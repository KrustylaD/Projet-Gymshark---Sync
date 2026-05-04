/* ============================================================
   DIAGNOSTIC AUDIO (micro + haut-parleurs)
   ============================================================ */

import { dom, state } from '../constants/config.js';
import { setDiagnosticStatus } from '../components/feedback.js';
import { stopSpeechInput } from './speech.js';

export function setAudioMeter(bar, label, value, prefix) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    if (bar) bar.style.width = `${safeValue}%`;
    if (label) label.textContent = `${prefix} : ${safeValue}%`;
}

export function resetMicMeter() {
    setAudioMeter(dom.micLevelBar, dom.micLevelText, 0, 'Niveau micro');
}

export function resetSpeakerMeter() {
    setAudioMeter(dom.speakerLevelBar, dom.speakerLevelText, 0, 'Sortie audio');
    if (dom.speakerLevelText) dom.speakerLevelText.textContent = 'Sortie audio : inactive';
}

export function stopMicTest() {
    state.micTestActive = false;

    if (state.micFrame) {
        cancelAnimationFrame(state.micFrame);
        state.micFrame = null;
    }

    if (state.micSource) {
        state.micSource.disconnect();
        state.micSource = null;
    }

    if (state.micAnalyser) {
        state.micAnalyser.disconnect();
        state.micAnalyser = null;
    }

    if (state.micStream) {
        for (const track of state.micStream.getTracks()) track.stop();
        state.micStream = null;
    }

    if (state.micContext) {
        state.micContext.close().catch(() => { });
        state.micContext = null;
    }

    if (dom.testMicButton) dom.testMicButton.textContent = 'Tester le micro';
    resetMicMeter();
    setDiagnosticStatus(dom.micStatus, 'Aucun test micro en cours.');
}

export function animateMicLevel() {
    if (!state.micAnalyser) return;

    const buffer = new Uint8Array(state.micAnalyser.fftSize);
    state.micAnalyser.getByteTimeDomainData(buffer);

    let sum = 0;
    for (const value of buffer) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / buffer.length);
    setAudioMeter(dom.micLevelBar, dom.micLevelText, Math.min(100, rms * 280), 'Niveau micro');

    if (state.micTestActive) {
        state.micFrame = requestAnimationFrame(animateMicLevel);
    }
}

export async function loadAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
        if (dom.audioInputSelect) {
            dom.audioInputSelect.innerHTML = '<option value="">Diagnostic audio non supporté</option>';
            dom.audioInputSelect.disabled = true;
        }
        setDiagnosticStatus(dom.micStatus, 'Votre navigateur ne permet pas de lister les périphériques audio.');
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');

        if (!dom.audioInputSelect) return;
        dom.audioInputSelect.innerHTML = '';

        if (!audioInputs.length) {
            dom.audioInputSelect.innerHTML = '<option value="">Aucun microphone détecté</option>';
            dom.audioInputSelect.disabled = true;
            setDiagnosticStatus(dom.micStatus, 'Aucun microphone détecté.');
            return;
        }

        dom.audioInputSelect.disabled = false;
        for (const [index, input] of audioInputs.entries()) {
            const option = document.createElement('option');
            option.value = input.deviceId;
            option.textContent = input.label || `Microphone ${index + 1}`;
            dom.audioInputSelect.append(option);
        }

        const selectedId = audioInputs.some((input) => input.deviceId === state.selectedAudioInputId)
            ? state.selectedAudioInputId
            : audioInputs[0].deviceId;

        state.selectedAudioInputId = selectedId;
        dom.audioInputSelect.value = selectedId;
        setDiagnosticStatus(dom.micStatus, 'Choisissez un micro puis lancez le test.');
    } catch {
        setDiagnosticStatus(dom.micStatus, 'Impossible de charger les périphériques audio.');
    }
}

export async function prepareAudioDevices() {
    if (!navigator.mediaDevices?.getUserMedia) {
        setDiagnosticStatus(dom.micStatus, 'Le navigateur ne prend pas en charge l\'accès au microphone.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
        await loadAudioDevices();
    } catch {
        setDiagnosticStatus(dom.micStatus, 'Accès au microphone refusé. Autorisez le micro pour lancer le diagnostic.');
    }
}

export async function toggleMicTest() {
    if (state.micTestActive) {
        stopMicTest();
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        setDiagnosticStatus(dom.micStatus, 'Le navigateur ne prend pas en charge le test micro.');
        return;
    }

    try {
        stopSpeechInput(true);
        stopMicTest();

        const constraints = state.selectedAudioInputId
            ? { audio: { deviceId: { exact: state.selectedAudioInputId } } }
            : { audio: true };

        state.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('audio-context-unavailable');

        state.micContext = new AudioContextClass();
        state.micAnalyser = state.micContext.createAnalyser();
        state.micAnalyser.fftSize = 1024;
        state.micSource = state.micContext.createMediaStreamSource(state.micStream);
        state.micSource.connect(state.micAnalyser);
        state.micTestActive = true;

        if (dom.testMicButton) dom.testMicButton.textContent = 'Arrêter le test';
        setDiagnosticStatus(dom.micStatus, 'Le micro est en écoute. Parlez pour voir le niveau bouger.');
        animateMicLevel();
    } catch (error) {
        stopMicTest();
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
            setDiagnosticStatus(dom.micStatus, 'Accès au microphone refusé par le navigateur.');
            return;
        }
        if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
            setDiagnosticStatus(dom.micStatus, 'Le micro sélectionné est introuvable.');
            return;
        }
        setDiagnosticStatus(dom.micStatus, 'Impossible de démarrer le test micro.');
    }
}

export async function playSpeakerTest() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        setDiagnosticStatus(dom.speakerStatus, 'Le navigateur ne prend pas en charge le test de sortie audio.');
        return;
    }

    try {
        if (!state.speakerContext || state.speakerContext.state === 'closed') {
            state.speakerContext = new AudioContextClass();
        }

        if (state.speakerContext.state === 'suspended') {
            await state.speakerContext.resume();
        }

        const oscillator = state.speakerContext.createOscillator();
        const gain = state.speakerContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, state.speakerContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, state.speakerContext.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, state.speakerContext.currentTime + 0.6);

        oscillator.connect(gain);
        gain.connect(state.speakerContext.destination);
        oscillator.start();
        oscillator.stop(state.speakerContext.currentTime + 0.62);

        dom.speakerLevelBar?.classList.add('est-active');
        if (dom.speakerLevelBar) dom.speakerLevelBar.style.width = '100%';
        if (dom.speakerLevelText) dom.speakerLevelText.textContent = 'Sortie audio : test en cours';
        setDiagnosticStatus(dom.speakerStatus, 'Un bip de test est en cours. Vérifiez vos haut-parleurs ou votre casque.');

        setTimeout(() => {
            dom.speakerLevelBar?.classList.remove('est-active');
            resetSpeakerMeter();
            setDiagnosticStatus(dom.speakerStatus, 'Si vous avez entendu le bip, la sortie audio fonctionne.');
        }, 700);
    } catch {
        setDiagnosticStatus(dom.speakerStatus, 'Impossible de jouer le son test.');
    }
}

export function openAudioModal() {
    if (!dom.audioModal || state.audioModalOpen) return;
    state.lastFocusedElement = document.activeElement;
    dom.audioModal.hidden = false;
    state.audioModalOpen = true;
    dom.body.classList.add('modale-ouverte');
    prepareAudioDevices();
    setTimeout(() => dom.closeAudioModalButton?.focus(), 0);
}

export function closeAudioModal() {
    if (!dom.audioModal || !state.audioModalOpen) return;
    dom.audioModal.hidden = true;
    state.audioModalOpen = false;
    dom.body.classList.remove('modale-ouverte');
    stopMicTest();
    state.lastFocusedElement?.focus?.();
    state.lastFocusedElement = null;
}
