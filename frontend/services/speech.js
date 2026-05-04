/* ============================================================
   SAISIE VOCALE (Web Speech API)
   ============================================================ */

import { dom, state, SpeechRecognitionAPI } from '../constants/config.js';
import { showStatus } from '../components/feedback.js';
import { syncAllInputs } from '../components/input-sync.js';

export function updateMicButtons(active) {
    for (const button of dom.micButtons) {
        button.classList.toggle('est-en-ecoute', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const label = active ? 'Arrêter la saisie vocale' : 'Démarrer la saisie vocale';
        button.title = label;
        button.setAttribute('aria-label', label);
    }
}

export function normalizeSpeechText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

export function getSpeechInput() {
    if (document.activeElement === dom.secondaryInput && dom.secondaryInput) return dom.secondaryInput;
    if (document.activeElement === dom.primaryInput && dom.primaryInput) return dom.primaryInput;
    if (dom.chatView?.classList.contains('est-en-conversation') && dom.secondaryInput) return dom.secondaryInput;
    return dom.primaryInput;
}

export function mergeSpeechText(prefix, text) {
    const base = normalizeSpeechText(prefix);
    const next = normalizeSpeechText(text);
    if (!base) return next;
    if (!next) return base;
    return `${base} ${next}`;
}

export function resetSpeechState() {
    state.speechActive = false;
    state.speechShouldRestart = false;
    state.speechErrored = false;
    state.speechFinalText = '';
}

export function getSpeechErrorMessage(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
        return 'L\'accès au microphone a été refusé.';
    }
    if (code === 'no-speech') return 'Aucune voix détectée.';
    if (code === 'audio-capture') return 'Aucun microphone n\'a été détecté.';
    if (code === 'network') return 'Erreur réseau pendant la saisie vocale.';
    return 'La saisie vocale a rencontré un problème.';
}

export function ensureSpeechRecognition() {
    if (!SpeechRecognitionAPI) return null;
    if (state.speechRecognition) return state.speechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        state.speechActive = true;
        state.speechErrored = false;
        updateMicButtons(true);
        showStatus('Saisie vocale active. Parlez, puis recliquez sur le micro pour arrêter.');
    };

    recognition.onresult = (event) => {
        let interim = '';

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0]?.transcript || '';
            if (result.isFinal) {
                state.speechFinalText += `${transcript} `;
            } else {
                interim += transcript;
            }
        }

        if (!state.speechInput) return;
        const nextText = mergeSpeechText(state.speechBaseText, `${state.speechFinalText} ${interim}`);
        syncAllInputs(nextText);
        state.speechInput.focus();
    };

    recognition.onerror = (event) => {
        try {
            console.error('SpeechRecognition error event:', event);
        } catch (e) {
            // ignore
        }

        state.speechErrored = true;
        state.speechShouldRestart = false;
        state.speechActive = false;
        updateMicButtons(false);
        showStatus(getSpeechErrorMessage(event.error));
    };

    recognition.onend = () => {
        try {
            console.log('SpeechRecognition ended. current state:', {
                speechErrored: state.speechErrored,
                speechShouldRestart: state.speechShouldRestart,
                speechFinalText: state.speechFinalText,
            });
        } catch (e) {
            // ignore
        }

        const finalText = mergeSpeechText(state.speechBaseText, state.speechFinalText);
        if (state.speechInput && finalText) {
            syncAllInputs(finalText);
            state.speechInput.focus();
        }

        const shouldRestart = state.speechShouldRestart && !state.speechErrored;
        state.speechActive = false;
        updateMicButtons(false);

        if (shouldRestart) {
            try {
                recognition.start();
                return;
            } catch {
                // Fall back to normal stop.
            }
        }

        if (state.speechFinalText.trim() && !state.speechErrored) {
            showStatus('Saisie vocale terminée.');
        }

        resetSpeechState();
    };

    state.speechRecognition = recognition;
    return recognition;
}

export function stopSpeechInput(silent = false) {
    if (!state.speechRecognition || (!state.speechActive && !state.speechShouldRestart)) return;

    state.speechShouldRestart = false;
    state.speechErrored = false;

    try {
        state.speechRecognition.stop();
    } catch {
        resetSpeechState();
        updateMicButtons(false);
    }

    if (!silent) showStatus('Saisie vocale arrêtée.');
}

export function toggleSpeechInput() {
    const recognition = ensureSpeechRecognition();
    if (!recognition) {
        showStatus('La saisie vocale n\'est pas prise en charge par ce navigateur.');
        return;
    }

    if (state.speechActive || state.speechShouldRestart) {
        stopSpeechInput();
        return;
    }

    state.speechInput = getSpeechInput();
    if (!state.speechInput) {
        showStatus('Aucun champ de saisie disponible.');
        return;
    }

    state.speechInput.focus();
    state.speechBaseText = state.speechInput.value.trim();
    state.speechFinalText = '';
    state.speechErrored = false;
    state.speechShouldRestart = true;

    try {
        recognition.start();
    } catch {
        resetSpeechState();
        updateMicButtons(false);
        showStatus('Impossible de démarrer la saisie vocale pour le moment.');
    }
}
