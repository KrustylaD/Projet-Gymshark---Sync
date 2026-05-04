/* ============================================================
   TRANSPORT SSE (streaming de la reponse assistant)
   ============================================================ */

import { API_BASE, dom, state } from '../constants/config.js';
import { showStatus, setConversationMode } from '../components/feedback.js';
import { getActiveInput, syncAllInputs } from '../components/input.js';
import {
    appendMessage,
    setInputsDisabled,
    createAssistantPlaceholder,
    setMessageContent,
    scrollConversationToBottom,
    saveConversationSnapshot,
    setConversationId,
} from '../components/message-dom.js';
import { stopSpeechInput } from './speech.js';

let _refreshHistory = null;

function _getRefreshHistory() {
    return _refreshHistory;
}

export function setRefreshHistory(fn) {
    _refreshHistory = fn;
}

/**
 * Lit le flux SSE renvoye par le backend et met a jour le message assistant
 * au fil de l'eau.
 */
export async function readSSEStream(response, assistantArticle) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const contentNode = assistantArticle?.querySelector('.message-body') || null;
    let reply = '';
    let buffer = '';

    if (assistantArticle && contentNode) {
        setMessageContent(assistantArticle, contentNode, '', 'assistant');
    }

    const processEventBlock = (block) => {
        const lines = String(block || '').split(/\r?\n/);
        let eventType = 'message';
        const dataLines = [];

        for (const rawLine of lines) {
            const line = rawLine.trimEnd();
            if (!line || line.startsWith(':')) continue;

            if (line.startsWith('event:')) {
                eventType = line.slice(6).trim() || 'message';
                continue;
            }

            if (line.startsWith('data:')) {
                const payloadLine = line.slice(5);
                dataLines.push(payloadLine.startsWith(' ') ? payloadLine.slice(1) : payloadLine);
            }
        }

        const payload = dataLines.join('\n');
        if (!payload) return;

        if (eventType === 'error') {
            let errorMessage = payload;

            try {
                const parsed = JSON.parse(payload);
                if (typeof parsed?.message === 'string' && parsed.message.trim()) {
                    errorMessage = parsed.message.trim();
                }
            } catch {
                // Keep raw payload as fallback.
            }

            throw new Error(errorMessage);
        }

        if (payload === '[DONE]') return;

        try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'meta' && parsed.conversationId) {
                setConversationId(parsed.conversationId);
                return;
            }

            if (typeof parsed?.response === 'string') {
                reply += parsed.response;
            } else if (typeof parsed?.text === 'string') {
                reply += parsed.text;
            } else if (typeof parsed?.message?.content === 'string') {
                reply += parsed.message.content;
            } else {
                return;
            }
        } catch {
            reply += payload.replace(/\\n/g, '\n');
        }

        if (assistantArticle && contentNode) {
            setMessageContent(assistantArticle, contentNode, reply, 'assistant');
            scrollConversationToBottom();
            saveConversationSnapshot();
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';

        for (const eventBlock of events) {
            processEventBlock(eventBlock);
        }
    }

    if (buffer.trim()) {
        processEventBlock(buffer);
    }

    return reply;
}

export async function sendAndStream(message, successStatus) {
    state.isResponding = true;
    setInputsDisabled(true);

    const assistantArticle = createAssistantPlaceholder();
    const contentNode = assistantArticle?.querySelector('.message-body') || null;
    if (assistantArticle && contentNode) {
        contentNode.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
    }

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                conversationId: state.conversationId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Erreur serveur : ${response.status}`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const fullReply = await readSSEStream(response, assistantArticle);
        if (!fullReply && assistantArticle && contentNode) {
            setMessageContent(assistantArticle, contentNode, '(Pas de réponse du serveur)', 'assistant');
        }

        showStatus(successStatus);
        if (_getRefreshHistory()) _getRefreshHistory()();
    } catch (error) {
        if (window.Logger) Logger.error(`Erreur chat : ${error.message}`, 'chat.js');
        if (assistantArticle && contentNode) {
            setMessageContent(
                assistantArticle,
                contentNode,
                `Erreur : ${error.message}. Vérifiez que le serveur backend est lancé.`,
                'assistant'
            );
            scrollConversationToBottom();
            saveConversationSnapshot();
        }
        showStatus('Erreur lors de la reponse du serveur.');
    } finally {
        state.isResponding = false;
        setInputsDisabled(false);
    }
}

export async function sendMessage(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (state.isResponding) return;
    stopSpeechInput(true);

    const activeInput = getActiveInput();
    const activeButton = activeInput === dom.secondaryInput
        ? dom.secondarySendButton
        : dom.primarySendButton;

    if (!activeInput) return;
    const text = activeInput.value.trim();

    if (!text) {
        activeInput.focus();
        showStatus('Écrivez un message avant d\'envoyer.');
        return;
    }

    setConversationMode(true);

    if (activeButton) activeButton.classList.add('est-envoi');
    setTimeout(() => activeButton?.classList.remove('est-envoi'), 140);

    appendMessage(text, 'utilisateur');
    syncAllInputs('');
    showStatus('Message envoyé...');

    await sendAndStream(text, 'Réponse reçue.');
    dom.secondaryInput?.focus();
}
