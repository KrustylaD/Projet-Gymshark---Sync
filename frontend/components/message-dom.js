/* ============================================================
   MESSAGE DOM (construction, affichage, snapshots)
   ============================================================ */

import { dom, state, STORAGE_KEYS } from '../constants/config.js';
import { getAssistantDisplayContent, renderAssistantMessage } from '../utils/markdown.js';
import { showStatus } from './feedback.js';
import { setConversationMode } from './feedback.js';
import { storageGet, storageSet, storageRemove } from '../utils/storage.js';
import { syncAllInputs } from './input.js';

export function setInputsDisabled(disabled) {
    for (const input of dom.textInputs) input.disabled = disabled;
    for (const button of dom.sendButtons) button.disabled = disabled;
}

export function scrollConversationToBottom(behavior = 'smooth') {
    if (!dom.conversationFeed) return;
    dom.conversationFeed.scrollTo({
        top: dom.conversationFeed.scrollHeight,
        behavior,
    });
}

export function createIconActionButton(iconClass, title, onClick, extraClass = '') {
    const button = document.createElement('button');
    const icon = document.createElement('i');
    button.type = 'button';
    button.className = `icon-action-button${extraClass ? ` ${extraClass}` : ''}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', onClick);
    return button;
}

export function createMessageActionBar() {
    const bar = document.createElement('div');
    bar.className = 'message-action-bar';
    return bar;
}

export function bindHoverActionBar(container, actionBar) {
    container.addEventListener('mouseenter', () => actionBar.classList.add('est-visible'));
    container.addEventListener('mouseleave', () => actionBar.classList.remove('est-visible'));
}

export function setMessageContent(article, contentNode, content, role) {
    if (!article || !contentNode) return;

    const rawContent = role === 'assistant'
        ? getAssistantDisplayContent(content)
        : String(content || '');
    article.dataset.rawContent = rawContent;

    if (role === 'assistant') {
        contentNode.innerHTML = renderAssistantMessage(rawContent);
        return;
    }

    contentNode.textContent = rawContent;
}

export function copyTextToClipboard(getText) {
    const text = typeof getText === 'function' ? getText() : getText;
    navigator.clipboard.writeText(text || '')
        .then(() => showStatus('Message copié.'))
        .catch(() => showStatus('Erreur lors de la copie.'));
}

export function buildMessageActionBar({ getCopyContent, onEdit } = {}) {
    const actionBar = createMessageActionBar();
    actionBar.append(
        createIconActionButton('fa-regular fa-copy', 'Copier', () => copyTextToClipboard(getCopyContent))
    );

    if (typeof onEdit === 'function') {
        actionBar.append(
            createIconActionButton('fa-regular fa-pen-to-square', 'Modifier', onEdit)
        );
    }

    return actionBar;
}

export function mountConversationShell(shell, actionBar) {
    shell.append(actionBar);
    bindHoverActionBar(shell, actionBar);
    dom.conversationFeed.append(shell);
    scrollConversationToBottom();
    saveConversationSnapshot();
}

export function buildMessageShell(content, role) {
    const shell = document.createElement('div');
    shell.className = `message-shell message-shell-${role}`;

    const article = document.createElement('article');
    article.className = `message message-${role}`;
    article.dataset.role = role;

    const contentNode = document.createElement('div');
    contentNode.className = 'message-body';
    article.append(contentNode);
    setMessageContent(article, contentNode, content, role);
    shell.append(article);

    return { shell, article, contentNode };
}

export function appendMessage(content, role) {
    if (!dom.conversationFeed || !content) return null;

    const { shell, article, contentNode } = buildMessageShell(content, role);
    // Import modale asynchronously to avoid circular dependency
    const actionBar = buildMessageActionBar({
        getCopyContent: () => article.dataset.rawContent || contentNode.textContent || '',
        onEdit: role === 'utilisateur'
            ? () => import('./modals.js').then(m => m.openEditMessageModal(article.dataset.rawContent || '', article, shell))
            : null,
    });
    mountConversationShell(shell, actionBar);
    return article;
}

export function createAssistantPlaceholder() {
    if (!dom.conversationFeed) return null;

    const { shell, article, contentNode } = buildMessageShell('', 'assistant');
    const actionBar = buildMessageActionBar({
        getCopyContent: () => article.dataset.rawContent || contentNode.textContent || '',
    });
    mountConversationShell(shell, actionBar);
    return article;
}

export function collectMessagesFromDom() {
    if (!dom.conversationFeed) return [];

    return Array.from(dom.conversationFeed.querySelectorAll('.message'))
        .map((message) => ({
            role: message.dataset.role === 'assistant' ? 'assistant' : 'user',
            content: message.dataset.rawContent || message.querySelector('.message-body')?.textContent || '',
        }))
        .filter((message) => message.content.trim().length > 0);
}

export function saveConversationSnapshot() {
    const messages = collectMessagesFromDom();
    const snapshot = {
        conversationId: state.conversationId,
        isConversationMode: messages.length > 0 || !!dom.chatView?.classList.contains('est-en-conversation'),
        messages,
    };
    storageSet(STORAGE_KEYS.snapshot, JSON.stringify(snapshot));
}

export function clearConversationSnapshot() {
    storageRemove(STORAGE_KEYS.snapshot);
}

export function restoreConversationSnapshot() {
    const raw = storageGet(STORAGE_KEYS.snapshot);
    if (!raw || !dom.conversationFeed) return false;

    try {
        const snapshot = JSON.parse(raw);
        const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
        if (!messages.length) return false;

        dom.conversationFeed.innerHTML = '';
        setConversationMode(true);
        for (const message of messages) {
            appendMessage(message.content, message.role === 'assistant' ? 'assistant' : 'utilisateur');
        }

        setConversationMode(true);
        scrollConversationToBottom('auto');
        saveConversationSnapshot();
        return true;
    } catch {
        return false;
    }
}

export function restoreDraft() {
    const draft = storageGet(STORAGE_KEYS.draft, '');
    if (draft) syncAllInputs(draft);
}

export function setConversationId(id) {
    state.conversationId = id;
    if (id) {
        localStorage.setItem(STORAGE_KEYS.conversationId, id);
    } else {
        localStorage.removeItem(STORAGE_KEYS.conversationId);
    }
    saveConversationSnapshot();
}
