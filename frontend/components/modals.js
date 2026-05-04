/* ============================================================
   MODALES (confirmation + edition)
   ============================================================ */

import { dom } from '../constants/config.js';
import { setMessageContent, saveConversationSnapshot } from './message-dom.js';

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

export function openConfirmModal({ title, message, confirmLabel = 'Confirmer', danger = false }) {
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

export async function openEditMessageModal(originalContent, article, shell) {
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
        setMessageContent(article, article.querySelector('.message-body'), nextContent, 'utilisateur');

        const nextShell = shell.nextElementSibling;
        if (nextShell?.querySelector('.message-assistant')) {
            nextShell.remove();
        }

        saveConversationSnapshot();
        const { sendAndStream } = await import('../services/chat.js');
        await sendAndStream(nextContent, 'Réponse régénérée.');
    });

    actions.append(cancelButton, saveButton);
    card.append(title, textarea, actions);
    backdrop.append(card);
    document.body.append(backdrop);
    textarea.focus();
    textarea.select();
}
