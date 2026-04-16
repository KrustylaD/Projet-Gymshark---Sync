/* ============================================================
   GYMSHARK SYNC - FRONTEND
   Chat, history, modals, audio diagnostics and voice input.
   ============================================================ */

'use strict';

/** URL de base du backend Express. */
const API_BASE = 'http://localhost:3000';

/**
 * Cles de stockage utilisees par le frontend.
 * - conversationId: dernier fil actif (localStorage, persistant)
 * - snapshot: etat visuel du chat (sessionStorage, session courante)
 * - draft: brouillon de saisie (sessionStorage)
 */
const STORAGE_KEYS = {
    conversationId: 'currentConversationId',
    snapshot: 'chatConversationSnapshot',
    draft: 'chatDraftMessage',
};

/**
 * Regroupe toutes les references DOM manipulees par l'application.
 * Centraliser ces selecteurs simplifie la maintenance et evite de
 * reparcourir le document dans chaque fonction.
 */
const dom = {
    root: document.documentElement,
    body: document.body,
    loadingScreen: document.querySelector('.ecran-chargement'),
    pageTransition: document.querySelector('.transition-page'),
    sidebar: document.querySelector('.barre-laterale'),
    contentPanel: document.querySelector('.contenu-principal'),
    views: document.querySelectorAll('.vue'),
    chatView: document.querySelector('.vue[data-view="chat"]'),
    navButtons: document.querySelectorAll('[data-view-target]'),
    interactiveButtons: document.querySelectorAll('button'),
    textInputs: document.querySelectorAll('.champ-texte'),
    primaryInput: document.querySelector('.champ-texte'),
    secondaryInput: document.querySelector('.champ-texte-secondaire'),
    sendButtons: document.querySelectorAll('.bouton-envoyer'),
    primarySendButton: document.querySelector('.bouton-envoyer'),
    secondarySendButton: document.querySelector('.bouton-envoyer-secondaire'),
    micButtons: document.querySelectorAll('.bouton-micro'),
    messageForms: document.querySelectorAll('.boite-saisie'),
    inputBoxes: document.querySelectorAll('.boite-saisie'),
    primaryInputBox: document.querySelector('.boite-saisie'),
    secondaryInputBox: document.querySelector('.boite-saisie-secondaire'),
    suggestions: document.querySelectorAll('.suggestion'),
    actionCards: document.querySelectorAll('.carte-action'),
    conversationFeed: document.querySelector('.fil-conversation'),
    statusZone: document.querySelector('.zone-statut'),
    actionButtons: document.querySelectorAll('[data-action]'),
    historyList: document.querySelector('.liste-historique'),
    audioModal: document.querySelector('#modale-audio'),
    closeAudioModalButton: document.querySelector('#bouton-fermer-modale-audio'),
    audioInputSelect: document.querySelector('#select-audio-input'),
    refreshAudioButton: document.querySelector('#bouton-actualiser-audio'),
    testMicButton: document.querySelector('#bouton-test-micro'),
    testSpeakerButton: document.querySelector('#bouton-test-haut-parleur'),
    micLevelBar: document.querySelector('#barre-audio-niveau'),
    micLevelText: document.querySelector('#texte-audio-niveau'),
    micStatus: document.querySelector('#statut-micro-audio'),
    speakerLevelBar: document.querySelector('#barre-audio-sortie'),
    speakerLevelText: document.querySelector('#texte-audio-sortie'),
    speakerStatus: document.querySelector('#statut-sortie-audio'),
};

const initialConversationMarkup = dom.conversationFeed ? dom.conversationFeed.innerHTML : '';
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * Etat global de l'interface.
 * Ce store leger coordonne les vues, le streaming, l'audio et la saisie vocale.
 */
const state = {
    statusTimer: null,
    conversationId: localStorage.getItem(STORAGE_KEYS.conversationId) || null,
    isResponding: false,
    audioModalOpen: false,
    speechRecognition: null,
    speechActive: false,
    speechShouldRestart: false,
    speechErrored: false,
    speechInput: null,
    speechBaseText: '',
    speechFinalText: '',
    micTestActive: false,
    micStream: null,
    micContext: null,
    micAnalyser: null,
    micSource: null,
    micFrame: null,
    selectedAudioInputId: '',
    speakerContext: null,
    lastFocusedElement: null,
    activeView: document.querySelector('.vue.vue-active')?.dataset.view || 'chat',
    viewSwitchTimer: null,
};

/* ============================================================
   STOCKAGE CLIENT (session/local storage)
   ============================================================ */

function storageGet(key, fallback = null) {
    try {
        return sessionStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // Ignore storage failures.
    }
}

function storageRemove(key) {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

function setConversationId(id) {
    state.conversationId = id;
    if (id) {
        localStorage.setItem(STORAGE_KEYS.conversationId, id);
    } else {
        localStorage.removeItem(STORAGE_KEYS.conversationId);
    }
    saveConversationSnapshot();
}

/* ============================================================
    FEEDBACK UI (status + navigation + animations)
    ============================================================ */

function showStatus(message) {
    if (!dom.statusZone) return;
    dom.statusZone.textContent = message;
    dom.statusZone.classList.add('est-visible');
    if (state.statusTimer) clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
        dom.statusZone.classList.remove('est-visible');
    }, 2200);
}

function setDiagnosticStatus(element, message) {
    if (element) element.textContent = message;
}

function syncActiveNav(viewName) {
    for (const button of dom.navButtons) {
        button.classList.toggle('est-actif', button.dataset.viewTarget === viewName);
    }
}

function pulsePageTransition() {
    if (!dom.pageTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    dom.pageTransition.classList.remove('est-active');
    void dom.pageTransition.offsetWidth;
    dom.pageTransition.classList.add('est-active');
    setTimeout(() => dom.pageTransition?.classList.remove('est-active'), 720);
}

function getViewMotionTargets(view) {
    if (!view) return [];

    const selectors = [
        ':scope > .chat-accueil > *',
        ':scope > .section-saisie',
        ':scope > .fil-conversation > *',
        ':scope > .barre-saisie-fixe',
        ':scope > .vue-entete',
        ':scope > .liste-elements > *',
        ':scope > .grille-raccourcis > *',
        ':scope > .conteneur-cartes > *',
    ];

    const uniqueTargets = [];
    const seen = new Set();

    for (const selector of selectors) {
        for (const element of view.querySelectorAll(selector)) {
            if (!seen.has(element)) {
                uniqueTargets.push(element);
                seen.add(element);
            }
        }
    }

    return uniqueTargets.slice(0, 14);
}

function animateViewEntrance(view) {
    if (!view || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = getViewMotionTargets(view);
    for (const [index, element] of targets.entries()) {
        element.animate(
            [
                {
                    opacity: 0,
                    transform: 'translateY(22px) scale(0.985)',
                    filter: 'blur(10px)',
                },
                {
                    opacity: 1,
                    transform: 'translateY(0) scale(1)',
                    filter: 'blur(0)',
                },
            ],
            {
                duration: 640,
                delay: Math.min(index * 42, 220),
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );
    }
}

function activateView(viewName, { immediate = false } = {}) {
    const nextView = Array.from(dom.views).find((view) => view.dataset.view === viewName);
    if (!nextView) return;

    const currentView = Array.from(dom.views).find((view) => view.classList.contains('vue-active'));
    syncActiveNav(viewName);

    if (state.activeView === viewName && currentView === nextView) {
        return;
    }

    state.activeView = viewName;

    if (state.viewSwitchTimer) {
        clearTimeout(state.viewSwitchTimer);
        state.viewSwitchTimer = null;
    }

    if (immediate || !currentView || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const view of dom.views) {
            view.classList.toggle('vue-active', view === nextView);
            view.classList.remove('vue-transition-sortie', 'vue-transition-entree');
        }
        requestAnimationFrame(() => animateViewEntrance(nextView));
        return;
    }

    pulsePageTransition();
    currentView.classList.add('vue-transition-sortie');

    state.viewSwitchTimer = setTimeout(() => {
        currentView.classList.remove('vue-active', 'vue-transition-sortie');
        nextView.classList.add('vue-active', 'vue-transition-entree');
        requestAnimationFrame(() => animateViewEntrance(nextView));
        setTimeout(() => nextView.classList.remove('vue-transition-entree'), 520);
        state.viewSwitchTimer = null;
    }, 170);
}

function setConversationMode(enabled) {
    if (!dom.chatView) return;
    dom.chatView.classList.toggle('est-en-conversation', enabled);
}

/* ============================================================
    SAISIE UTILISATEUR (inputs + brouillons)
    ============================================================ */

function getActiveInput() {
    if (dom.secondaryInput && document.activeElement === dom.secondaryInput) {
        return dom.secondaryInput;
    }
    if (dom.secondaryInput && dom.chatView?.classList.contains('est-en-conversation')) {
        return dom.secondaryInput;
    }
    return dom.primaryInput;
}

function syncInputBoxesState() {
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

function saveDraft(value) {
    if (value && value.trim()) {
        storageSet(STORAGE_KEYS.draft, value);
    } else {
        storageRemove(STORAGE_KEYS.draft);
    }
}

function syncAllInputs(value) {
    for (const input of dom.textInputs) input.value = value;
    saveDraft(value);
    syncInputBoxesState();
}

function pulseInput(box = dom.primaryInputBox) {
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

function injectPrompt(text) {
    if (!dom.primaryInput || !text) return;
    stopSpeechInput(true);
    syncAllInputs(text);
    dom.primaryInput.focus();
    activateView('chat');
    pulseInput();
    showStatus(`Prompt chargé : ${text}`);
}

function resetConversation() {
    stopSpeechInput(true);
    setConversationMode(false);
    if (dom.conversationFeed) dom.conversationFeed.innerHTML = initialConversationMarkup;
    syncAllInputs('');
    setConversationId(null);
    clearConversationSnapshot();
}

/* ============================================================
    RENDU DES MESSAGES ET ACTIONS DE MESSAGE
    ============================================================ */

function setInputsDisabled(disabled) {
    for (const input of dom.textInputs) input.disabled = disabled;
    for (const button of dom.sendButtons) button.disabled = disabled;
}

function scrollConversationToBottom(behavior = 'smooth') {
    if (!dom.conversationFeed) return;
    dom.conversationFeed.scrollTo({
        top: dom.conversationFeed.scrollHeight,
        behavior,
    });
}

function createIconActionButton(iconClass, title, onClick, extraClass = '') {
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

function createMessageActionBar() {
    const bar = document.createElement('div');
    bar.className = 'message-action-bar';
    return bar;
}

function bindHoverActionBar(container, actionBar) {
    container.addEventListener('mouseenter', () => actionBar.classList.add('est-visible'));
    container.addEventListener('mouseleave', () => actionBar.classList.remove('est-visible'));
}

function copyTextToClipboard(getText) {
    const text = typeof getText === 'function' ? getText() : getText;
    navigator.clipboard.writeText(text || '')
        .then(() => showStatus('Message copié.'))
        .catch(() => showStatus('Erreur lors de la copie.'));
}

function buildMessageActionBar({ getCopyContent, onEdit } = {}) {
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

function mountConversationShell(shell, actionBar) {
    shell.append(actionBar);
    bindHoverActionBar(shell, actionBar);
    dom.conversationFeed.append(shell);
    scrollConversationToBottom();
    saveConversationSnapshot();
}

function buildMessageShell(content, role) {
    const shell = document.createElement('div');
    shell.className = `message-shell message-shell-${role}`;

    const article = document.createElement('article');
    article.className = `message message-${role}`;
    article.dataset.role = role;

    const paragraph = document.createElement('p');
    paragraph.textContent = content;
    article.append(paragraph);
    shell.append(article);

    return { shell, article, paragraph };
}

function appendMessage(content, role) {
    if (!dom.conversationFeed || !content) return null;

    const { shell, article, paragraph } = buildMessageShell(content, role);
    const actionBar = buildMessageActionBar({
        getCopyContent: () => paragraph.textContent || '',
        onEdit: role === 'utilisateur'
            ? () => openEditMessageModal(paragraph.textContent || '', article, shell)
            : null,
    });
    mountConversationShell(shell, actionBar);
    return article;
}

function createAssistantPlaceholder() {
    if (!dom.conversationFeed) return null;

    const { shell, article, paragraph } = buildMessageShell('', 'assistant');
    const actionBar = buildMessageActionBar({
        getCopyContent: () => paragraph.textContent || '',
    });
    mountConversationShell(shell, actionBar);
    return article;
}

function collectMessagesFromDom() {
    if (!dom.conversationFeed) return [];

    return Array.from(dom.conversationFeed.querySelectorAll('.message'))
        .map((message) => ({
            role: message.dataset.role === 'assistant' ? 'assistant' : 'user',
            content: message.querySelector('p')?.textContent || '',
        }))
        .filter((message) => message.content.trim().length > 0);
}

function saveConversationSnapshot() {
    const snapshot = {
        conversationId: state.conversationId,
        isConversationMode: !!dom.chatView?.classList.contains('est-en-conversation'),
        messages: collectMessagesFromDom(),
    };
    storageSet(STORAGE_KEYS.snapshot, JSON.stringify(snapshot));
}

function clearConversationSnapshot() {
    storageRemove(STORAGE_KEYS.snapshot);
}

function restoreConversationSnapshot() {
    const raw = storageGet(STORAGE_KEYS.snapshot);
    if (!raw || !dom.conversationFeed) return false;

    try {
        const snapshot = JSON.parse(raw);
        const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
        if (!messages.length) return false;

        dom.conversationFeed.innerHTML = '';
        for (const message of messages) {
            appendMessage(message.content, message.role === 'assistant' ? 'assistant' : 'utilisateur');
        }

        setConversationMode(Boolean(snapshot.isConversationMode));
        scrollConversationToBottom('auto');
        return true;
    } catch {
        return false;
    }
}

function restoreDraft() {
    const draft = storageGet(STORAGE_KEYS.draft, '');
    if (draft) syncAllInputs(draft);
}

function createModalBackdrop(extraClass = '') {
    const backdrop = document.createElement('div');
    backdrop.className = `modale-overlay${extraClass ? ` ${extraClass}` : ''}`;
    return backdrop;
}

function createModalCard(extraClass = '') {
    const card = document.createElement('div');
    card.className = `modale-confirmation${extraClass ? ` ${extraClass}` : ''}`;
    return card;
}

function createModalButton(label, variantClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `modale-bouton ${variantClass}`;
    button.textContent = label;
    return button;
}

function bindModalDismiss(backdrop, close) {
    const onKeyDown = (event) => {
        if (event.key === 'Escape') close();
    };

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}

function openConfirmModal({ title, message, confirmLabel = 'Confirmer', danger = false }) {
    return new Promise((resolve) => {
        const previousFocus = document.activeElement;
        const backdrop = createModalBackdrop();
        const card = createModalCard();
        const titleNode = document.createElement('h3');
        const messageNode = document.createElement('p');
        const actions = document.createElement('div');
        const cancelButton = createModalButton('Annuler', 'modale-bouton-secondaire');
        const confirmButton = createModalButton(
            confirmLabel,
            danger ? 'modale-bouton-danger' : 'modale-bouton-primaire'
        );

        titleNode.textContent = title;
        messageNode.textContent = message;
        actions.className = 'modale-actions';

        let settled = false;
        let removeDismissHandlers = () => { };
        const close = (value) => {
            if (settled) return;
            settled = true;
            removeDismissHandlers();
            backdrop.remove();
            previousFocus?.focus?.();
            resolve(value);
        };

        removeDismissHandlers = bindModalDismiss(backdrop, () => close(false));
        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(true));

        actions.append(cancelButton, confirmButton);
        card.append(titleNode, messageNode, actions);
        backdrop.append(card);
        document.body.append(backdrop);
        confirmButton.focus();
    });
}

function openEditMessageModal(originalContent, article, shell) {
    const previousFocus = document.activeElement;
    const backdrop = createModalBackdrop('modale-overlay-editor');
    const card = createModalCard('modale-editor');
    const title = document.createElement('h3');
    const textarea = document.createElement('textarea');
    const actions = document.createElement('div');
    const cancelButton = createModalButton('Annuler', 'modale-bouton-secondaire');
    const saveButton = createModalButton('Valider et régénérer', 'modale-bouton-primaire');

    title.textContent = 'Modifier le message';
    textarea.className = 'modale-editor-textarea';
    textarea.value = originalContent;

    actions.className = 'modale-actions';
    let removeDismissHandlers = () => { };

    const close = () => {
        removeDismissHandlers();
        backdrop.remove();
        previousFocus?.focus?.();
    };

    removeDismissHandlers = bindModalDismiss(backdrop, close);
    cancelButton.addEventListener('click', close);

    saveButton.addEventListener('click', async () => {
        const nextContent = textarea.value.trim();
        if (!nextContent || nextContent === originalContent) {
            close();
            return;
        }

        close();
        article.querySelector('p').textContent = nextContent;

        const nextShell = shell.nextElementSibling;
        if (nextShell?.querySelector('.message-assistant')) {
            nextShell.remove();
        }

        saveConversationSnapshot();
        await sendAndStream(nextContent, 'Réponse régénérée.');
    });

    actions.append(cancelButton, saveButton);
    card.append(title, textarea, actions);
    backdrop.append(card);
    document.body.append(backdrop);
    textarea.focus();
    textarea.select();
}

/* ============================================================
    TRANSPORT SSE (streaming de la reponse assistant)
    ============================================================ */

/**
 * Lit le flux SSE renvoye par le backend et met a jour le message assistant
 * au fil de l'eau.
 *
 * Le backend envoie :
 * - des evenements meta avec conversationId
 * - des fragments texte (data: ...)
 * - un marqueur [DONE] de fin de flux
 *
 * @param {Response} response - Reponse fetch du POST /api/chat.
 * @param {HTMLElement|null} assistantArticle - Message assistant a alimenter.
 * @returns {Promise<string>} Reponse complete reconstruite.
 */
async function readSSEStream(response, assistantArticle) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const paragraph = assistantArticle?.querySelector('p') || null;
    let reply = '';
    let buffer = '';

    if (paragraph) paragraph.textContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;

            try {
                const parsed = JSON.parse(payload);
                if (parsed.type === 'meta' && parsed.conversationId) {
                    setConversationId(parsed.conversationId);
                    continue;
                }
            } catch {
                // Raw text chunk.
            }

            const text = payload.replace(/\\n/g, '\n');
            reply += text;

            if (paragraph) {
                paragraph.textContent = reply;
                scrollConversationToBottom();
                saveConversationSnapshot();
            }
        }
    }

    return reply;
}

/**
 * Orchestre un envoi de message complet :
 * 1) verrouille les inputs
 * 2) cree le placeholder assistant
 * 3) lit le stream SSE et reconstruit la reponse
 * 4) met a jour l'historique et l'etat d'UI
 *
 * @param {string} message - Prompt utilisateur a envoyer au backend.
 * @param {string} successStatus - Message de statut a afficher en cas de succes.
 */
async function sendAndStream(message, successStatus) {
    state.isResponding = true;
    setInputsDisabled(true);

    const assistantArticle = createAssistantPlaceholder();
    const paragraph = assistantArticle?.querySelector('p') || null;
    if (paragraph) paragraph.textContent = '...';

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

        const fullReply = await readSSEStream(response, assistantArticle);
        if (!fullReply && paragraph) {
            paragraph.textContent = '(Pas de réponse du serveur)';
        }

        showStatus(successStatus);
        refreshHistory();
    } catch (error) {
        if (window.Logger) Logger.error(`Erreur chat : ${error.message}`, 'app.js');
        if (paragraph) {
            paragraph.textContent = `Erreur : ${error.message}. Vérifiez que le serveur backend est lancé.`;
        }
        showStatus('Erreur de connexion au serveur.');
    } finally {
        state.isResponding = false;
        setInputsDisabled(false);
    }
}

/**
 * Point d'entree principal de l'envoi depuis l'UI (bouton ou touche Enter).
 *
 * @param {Event} [event] - Evenement DOM optionnel.
 */
async function sendMessage(event) {
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

/* ============================================================
    HISTORIQUE DES CONVERSATIONS (sidebar)
    ============================================================ */

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
                if (window.Logger) Logger.error(`Erreur suppression : ${error.message}`, 'app.js');
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

/**
 * Recharge la liste des conversations depuis le backend puis reconstruit
 * la sidebar historique.
 */
async function refreshHistory() {
    if (!dom.historyList) return;

    try {
        const response = await fetch(`${API_BASE}/api/conversations`);
        if (!response.ok) return;
        const conversations = await response.json();

        dom.historyList.innerHTML = '';
        if (!conversations.length) {
            dom.historyList.append(createEmptyHistoryState());
            return;
        }

        for (const conversation of conversations) {
            dom.historyList.append(createHistoryItem(conversation));
        }
    } catch {
        // Backend unavailable.
    }
}

/**
 * Charge une conversation complete puis reconstruit le fil de messages.
 *
 * @param {string} id - Identifiant de conversation a charger.
 */
async function loadConversation(id) {
    stopSpeechInput(true);

    try {
        const response = await fetch(`${API_BASE}/api/conversations/${id}`);
        if (!response.ok) return;
        const conversation = await response.json();

        setConversationId(id);
        dom.conversationFeed.innerHTML = '';

        for (const message of conversation.messages) {
            appendMessage(message.content, message.role === 'assistant' ? 'assistant' : 'utilisateur');
        }

        activateView('chat');
        setConversationMode(true);
        scrollConversationToBottom('auto');
        saveConversationSnapshot();
        refreshHistory();
        showStatus('Conversation chargée.');
    } catch {
        showStatus('Erreur lors du chargement.');
    }
}

/* ============================================================
    DIAGNOSTIC AUDIO (micro + haut-parleurs)
    ============================================================ */

function setAudioMeter(bar, label, value, prefix) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    if (bar) bar.style.width = `${safeValue}%`;
    if (label) label.textContent = `${prefix} : ${safeValue}%`;
}

function resetMicMeter() {
    setAudioMeter(dom.micLevelBar, dom.micLevelText, 0, 'Niveau micro');
}

function resetSpeakerMeter() {
    setAudioMeter(dom.speakerLevelBar, dom.speakerLevelText, 0, 'Sortie audio');
    if (dom.speakerLevelText) dom.speakerLevelText.textContent = 'Sortie audio : inactive';
}

function stopMicTest() {
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

function animateMicLevel() {
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

async function loadAudioDevices() {
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

async function prepareAudioDevices() {
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

/**
 * Lance/arrete un test micro temps reel en mesurant le niveau RMS.
 */
async function toggleMicTest() {
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

async function playSpeakerTest() {
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

/* ============================================================
    SAISIE VOCALE (Web Speech API)
    ============================================================ */

function updateMicButtons(active) {
    for (const button of dom.micButtons) {
        button.classList.toggle('est-en-ecoute', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const label = active ? 'Arrêter la saisie vocale' : 'Démarrer la saisie vocale';
        button.title = label;
        button.setAttribute('aria-label', label);
    }
}

function normalizeSpeechText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

function getSpeechInput() {
    if (document.activeElement === dom.secondaryInput && dom.secondaryInput) return dom.secondaryInput;
    if (document.activeElement === dom.primaryInput && dom.primaryInput) return dom.primaryInput;
    if (dom.chatView?.classList.contains('est-en-conversation') && dom.secondaryInput) return dom.secondaryInput;
    return dom.primaryInput;
}

function mergeSpeechText(prefix, text) {
    const base = normalizeSpeechText(prefix);
    const next = normalizeSpeechText(text);
    if (!base) return next;
    if (!next) return base;
    return `${base} ${next}`;
}

function resetSpeechState() {
    state.speechActive = false;
    state.speechShouldRestart = false;
    state.speechErrored = false;
    state.speechFinalText = '';
}

function getSpeechErrorMessage(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
        return 'L\'accès au microphone a été refusé.';
    }
    if (code === 'no-speech') return 'Aucune voix détectée.';
    if (code === 'audio-capture') return 'Aucun microphone n\'a été détecté.';
    if (code === 'network') return 'Erreur réseau pendant la saisie vocale.';
    return 'La saisie vocale a rencontré un problème.';
}

/**
 * Initialise (lazy) l'instance SpeechRecognition et ses handlers.
 * La logique de restart permet une dictee continue tant que l'utilisateur
 * n'interrompt pas explicitement la capture.
 *
 * @returns {SpeechRecognition|null}
 */
function ensureSpeechRecognition() {
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
        state.speechErrored = true;
        state.speechShouldRestart = false;
        state.speechActive = false;
        updateMicButtons(false);
        showStatus(getSpeechErrorMessage(event.error));
    };

    recognition.onend = () => {
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

function stopSpeechInput(silent = false) {
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

function toggleSpeechInput() {
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

/* ============================================================
    MODALE AUDIO + INTERACTIONS VISUELLES
    ============================================================ */

function openAudioModal() {
    if (!dom.audioModal || state.audioModalOpen) return;
    state.lastFocusedElement = document.activeElement;
    dom.audioModal.hidden = false;
    state.audioModalOpen = true;
    dom.body.classList.add('modale-ouverte');
    prepareAudioDevices();
    setTimeout(() => dom.closeAudioModalButton?.focus(), 0);
}

function closeAudioModal() {
    if (!dom.audioModal || !state.audioModalOpen) return;
    dom.audioModal.hidden = true;
    state.audioModalOpen = false;
    dom.body.classList.remove('modale-ouverte');
    stopMicTest();
    state.lastFocusedElement?.focus?.();
    state.lastFocusedElement = null;
}

function createRipple(button, event) {
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.append(ripple);
    setTimeout(() => ripple.remove(), 520);
}

function initAnimations() {
    const animables = document.querySelectorAll(
        '.logo, .bouton-lateral, .section-salutation, .boite-saisie, .suggestion, .carte, .zone-aide .aide-bouton, .entete, .element-liste, .message'
    );

    for (const [index, element] of animables.entries()) {
        element.classList.add('animable');
        element.style.transitionDelay = `${Math.min(index * 36, 240)}ms`;
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
                duration: 980,
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
                duration: 1100,
                delay: 80,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );
    }
}

/* ============================================================
    BINDINGS D'EVENEMENTS ET BOOTSTRAP APPLICATION
    ============================================================ */

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

function initPage() {
    // Ordre d'initialisation important:
    // 1) animation/layout
    // 2) bindings evenements
    // 3) restauration d'etat session (snapshot, draft, conversation active)
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
        }, 2200);
    });
}

initPage();
