/* ============================================================
   HISTORIQUE DES CONVERSATIONS (sidebar)
   ============================================================ */

import { API_BASE, dom, state } from '../constants/config.js';
import { showStatus, activateView, animateElementBatch, setConversationMode } from '../components/feedback.js';
import {
    appendMessage,
    setConversationId,
    saveConversationSnapshot,
    scrollConversationToBottom,
} from '../components/message-dom.js';
import { bindHoverActionBar, createIconActionButton } from '../components/message-actions.js';
import { openConfirmModal } from '../components/modals.js';
import { resetConversation } from '../components/input.js';
import { stopSpeechInput } from './speech.js';

function createHistoryDeleteButton(conversation) {
    return createIconActionButton(
        'fa-solid fa-trash',
        'Supprimer',
        async (event) => {
            event.stopPropagation();
            const confirmed = await openConfirmModal({
                title: 'Supprimer la conversation',
                message: `Voulez-vous vraiment supprimer "${conversation.title}" ? Cette action est définitive.`,
                confirmLabel: 'Supprimer',
                danger: true,
            });

            if (!confirmed) return;

            try {
                const response = await fetch(`${API_BASE}/api/conversations/${conversation.id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) return;

                if (state.conversationId === conversation.id) {
                    resetConversation();
                }

                refreshHistory();
                showStatus('Conversation supprimée.');
            } catch (error) {
                if (window.Logger) Logger.error(`Erreur suppression : ${error.message}`, 'history.js');
                showStatus('Erreur lors de la suppression.');
            }
        },
        'history-action-button'
    );
}

function createEmptyHistoryState() {
    const emptyState = document.createElement('div');
    const title = document.createElement('strong');
    const description = document.createElement('span');

    emptyState.className = 'history-empty-state';
    title.textContent = 'Aucune conversation';
    description.textContent = 'Vos prochains échanges apparaîtront ici.';
    emptyState.append(title, description);

    return emptyState;
}

function createHistoryItem(conversation) {
    const button = document.createElement('button');
    const title = document.createElement('span');
    const actions = document.createElement('div');

    button.type = 'button';
    button.className = 'raccourci raccourci-historique history-item';
    button.dataset.conversationId = conversation.id;
    if (conversation.id === state.conversationId) {
        button.classList.add('est-actif');
    }

    title.className = 'history-item-title';
    title.textContent = conversation.title;
    actions.className = 'history-item-actions';
    actions.append(createHistoryDeleteButton(conversation));

    button.append(title, actions);
    bindHoverActionBar(button, actions);
    button.addEventListener('click', () => loadConversation(conversation.id));
    return button;
}

export async function refreshHistory() {
    if (!dom.historyList) return;

    try {
        const response = await fetch(`${API_BASE}/api/conversations`);
        if (!response.ok) return;
        const conversations = await response.json();

        dom.historyList.innerHTML = '';
        if (!conversations.length) {
            const emptyState = createEmptyHistoryState();
            dom.historyList.append(emptyState);
            animateElementBatch([emptyState], { delayStep: 0, duration: 420 });
            return;
        }

        const historyNodes = [];
        for (const conversation of conversations) {
            const item = createHistoryItem(conversation);
            dom.historyList.append(item);
            historyNodes.push(item);
        }

        animateElementBatch(historyNodes, { delayStep: 28, duration: 460 });
    } catch {
        // Backend unavailable.
    }
}

export async function loadConversation(id) {
    stopSpeechInput(true);

    try {
        const response = await fetch(`${API_BASE}/api/conversations/${id}`);
        if (!response.ok) return;
        const conversation = await response.json();
        const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];

        setConversationId(id);
        dom.conversationFeed.innerHTML = '';
        setConversationMode(messages.length > 0);

        for (const message of messages) {
            appendMessage(message.content, message.role === 'assistant' ? 'assistant' : 'utilisateur');
        }

        activateView('chat');
        scrollConversationToBottom('auto');
        saveConversationSnapshot();
        refreshHistory();
        showStatus('Conversation chargée.');
    } catch {
        showStatus('Erreur lors du chargement.');
    }
}
