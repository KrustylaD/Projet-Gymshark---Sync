/* ============================================================
   MESSAGE ACTIONS (icones, barre d'action, copie)
   ============================================================ */

import { showStatus } from './feedback.js';

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

export function copyTextToClipboard(getText) {
    const text = typeof getText === 'function' ? getText() : getText;
    navigator.clipboard.writeText(text || '')
        .then(() => showStatus('Message copie.'))
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
