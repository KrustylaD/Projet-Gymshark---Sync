/* ============================================================
   BINDINGS D'EVENEMENTS ET BOOTSTRAP APPLICATION
   ============================================================ */

import { dom, state } from '../constants/config.js';
import { showStatus, activateView, animateViewEntrance } from './feedback.js';
import { injectPrompt, resetConversation, syncInputBoxesState } from './input.js';
import { syncAllInputs } from './input-sync.js';
import { restoreConversationSnapshot, restoreDraft } from './message-dom.js';
import { sendMessage } from '../services/chat.js';
import { refreshHistory, loadConversation } from '../services/history.js';
import { toggleMicTest, prepareAudioDevices, playSpeakerTest, stopMicTest, openAudioModal, closeAudioModal } from '../services/audio.js';
import { setDiagnosticStatus } from './feedback.js';
import { toggleSpeechInput, stopSpeechInput } from '../services/speech.js';
import { setRefreshHistory } from '../services/chat.js';

const RIPPLE_REMOVE_MS = 520;
const ANIMATION_DELAY_STEP_MS = 36;
const ANIMATION_MAX_DELAY_MS = 240;
const SIDEBAR_ANIM_DURATION_MS = 980;
const CONTENT_ANIM_DURATION_MS = 1100;
const CONTENT_ANIM_DELAY_MS = 80;
const LOADING_SCREEN_DELAY_MS = 2200;

function createRipple(button, event) {
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.append(ripple);
    setTimeout(() => ripple.remove(), RIPPLE_REMOVE_MS);
}

function initAnimations() {
    const animables = document.querySelectorAll(
        '.logo, .bouton-lateral, .section-salutation, .boite-saisie, .suggestion, .carte, .zone-aide .aide-bouton, .entete, .element-liste, .message'
    );

    for (const [index, element] of animables.entries()) {
        element.classList.add('animable');
        element.style.transitionDelay = `${Math.min(index * ANIMATION_DELAY_STEP_MS, ANIMATION_MAX_DELAY_MS)}ms`;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('est-visible');
                    observer.unobserve(entry.target);
                }
            }
        },
        { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
    );

    for (const element of animables) observer.observe(element);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dom.sidebar?.animate(
            [
                { opacity: 0, transform: 'translateX(-24px) scale(0.985)', filter: 'blur(16px)' },
                { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' },
            ],
            {
                duration: SIDEBAR_ANIM_DURATION_MS,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );

        dom.contentPanel?.animate(
            [
                { opacity: 0, transform: 'translateY(26px) scale(0.99)', filter: 'blur(18px)' },
                { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
            ],
            {
                duration: CONTENT_ANIM_DURATION_MS,
                delay: CONTENT_ANIM_DELAY_MS,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );
    }
}

function bindGlobalEvents() {
    for (const button of dom.interactiveButtons) {
        button.addEventListener('pointerdown', (event) => createRipple(button, event));
    }

    window.addEventListener('mousemove', (event) => {
        dom.root.style.setProperty('--spotlight-x', `${event.clientX}px`);
        dom.root.style.setProperty('--spotlight-y', `${event.clientY}px`);
    });

    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopSpeechInput(true);
            stopMicTest();
            closeAudioModal();
        }
    });

    window.addEventListener('beforeunload', () => {
        stopSpeechInput(true);
        stopMicTest();
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.audioModalOpen) {
            closeAudioModal();
        }
    });
}

function handleViewTargetSource(source, { resetConversationOnPrimaryChat = false } = {}) {
    stopSpeechInput(true);

    const target = source.dataset.viewTarget;
    const prompt = source.dataset.prompt;

    if (resetConversationOnPrimaryChat && target === 'chat' && source.classList.contains('bouton-principal') && !prompt) {
        resetConversation();
    }

    if (target) {
        activateView(target);
        showStatus(`Vue active : ${target}`);
    }

    if (prompt) injectPrompt(prompt);
}

function handleAppAction(action) {
    if (action === 'share') {
        showStatus('Lien de partage préparé.');
        return;
    }

    if (action === 'attach') {
        showStatus('Module d\'ajout prêt. Vous pouvez connecter un document ici.');
        return;
    }

    if (action === 'voice') {
        toggleSpeechInput();
        return;
    }

    if (action === 'audio-settings') {
        openAudioModal();
    }
}

function bindNavigation() {
    for (const button of dom.navButtons) {
        button.addEventListener('click', () => handleViewTargetSource(button, { resetConversationOnPrimaryChat: true }));
    }

    for (const suggestion of dom.suggestions) {
        suggestion.addEventListener('click', () => injectPrompt(suggestion.textContent || ''));
    }

    for (const card of dom.actionCards) {
        card.addEventListener('click', () => handleViewTargetSource(card));
    }

    for (const button of dom.actionButtons) {
        button.addEventListener('click', () => handleAppAction(button.dataset.action));
    }
}

function bindAudioModal() {
    dom.closeAudioModalButton?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeAudioModal();
    });

    dom.audioModal?.addEventListener('click', (event) => {
        if (event.target === dom.audioModal) {
            closeAudioModal();
        }
    });

    dom.audioInputSelect?.addEventListener('change', () => {
        state.selectedAudioInputId = dom.audioInputSelect.value;
        if (state.micTestActive) {
            toggleMicTest();
            setTimeout(() => toggleMicTest(), 150);
        } else {
            setDiagnosticStatus(dom.micStatus, 'Micro sélectionné. Lancez le test pour vérifier le niveau.');
        }
    });

    dom.refreshAudioButton?.addEventListener('click', async () => {
        stopMicTest();
        await prepareAudioDevices();
    });

    dom.testMicButton?.addEventListener('click', toggleMicTest);
    dom.testSpeakerButton?.addEventListener('click', playSpeakerTest);
}

function bindInputs() {
    for (const form of dom.messageForms) {
        form.addEventListener('submit', sendMessage);
    }

    for (const input of dom.textInputs) {
        input.addEventListener('input', (event) => syncAllInputs(event.target.value));
        input.addEventListener('focus', syncInputBoxesState);
        input.addEventListener('blur', syncInputBoxesState);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                input.closest('form')?.requestSubmit();
            }
        });
    }
}

export function initPage() {
    // Resolve circular dependency: give chat.js access to refreshHistory
    setRefreshHistory(refreshHistory);

    initAnimations();
    bindGlobalEvents();
    bindNavigation();
    bindAudioModal();
    bindInputs();
    syncInputBoxesState();

    window.addEventListener('load', () => {
        setTimeout(() => {
            dom.loadingScreen?.classList.add('cache');
            dom.body.classList.add('page-chargee');
            activateView('chat', { immediate: true });
            showStatus('Vue active : chat');
            restoreConversationSnapshot();
            restoreDraft();
            refreshHistory();
            animateViewEntrance(dom.chatView);

            if (state.conversationId) {
                loadConversation(state.conversationId);
            }
        }, LOADING_SCREEN_DELAY_MS);
    });
}
