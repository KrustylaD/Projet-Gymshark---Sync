/* ============================================================
   SAISIE UTILISATEUR (inputs + brouillons)
   ============================================================ */

import { dom, initialConversationMarkup } from '../constants/config.js';
import { showStatus, activateView, setConversationMode } from './feedback.js';
import { syncAllInputs, saveDraft } from './input-sync.js';
import { clearConversationSnapshot, setConversationId } from './message-dom.js';
import { stopSpeechInput } from '../services/speech.js';

export { syncAllInputs, saveDraft } from './input-sync.js';

export function getActiveInput() {
    if (dom.secondaryInput && document.activeElement === dom.secondaryInput) {
        return dom.secondaryInput;
    }
    if (dom.secondaryInput && dom.chatView?.classList.contains('est-en-conversation')) {
        return dom.secondaryInput;
    }
    return dom.primaryInput;
}

export function syncInputBoxesState() {
    const value = getActiveInput()?.value?.trim() || dom.primaryInput?.value?.trim() || '';
    if (dom.primaryInputBox && dom.primaryInput) {
        const active = value.length > 0 || document.activeElement === dom.primaryInput;
        dom.primaryInputBox.classList.toggle('est-active', active);
    }
    if (dom.secondaryInputBox && dom.secondaryInput) {
        const active = value.length > 0 || document.activeElement === dom.secondaryInput;
        dom.secondaryInputBox.classList.toggle('est-active', active);
    }
}

export function pulseInput(box = dom.primaryInputBox) {
    if (!box) return;
    box.animate(
        [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(-1px) scale(1.005)' },
            { transform: 'translateY(0) scale(1)' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
}

export function injectPrompt(text) {
    if (!dom.primaryInput || !text) return;
    stopSpeechInput(true);
    syncAllInputs(text);
    dom.primaryInput.focus();
    activateView('chat');
    pulseInput();
    showStatus(`Prompt chargé : ${text}`);
}

export function resetConversation() {
    stopSpeechInput(true);
    setConversationMode(false);
    if (dom.conversationFeed) dom.conversationFeed.innerHTML = initialConversationMarkup;
    syncAllInputs('');
    setConversationId(null);
    clearConversationSnapshot();
}
