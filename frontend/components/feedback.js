/* ============================================================
   FEEDBACK UI (status + navigation + animations)
   ============================================================ */

import { dom, state } from '../constants/config.js';

export function showStatus(message) {
    if (!dom.statusZone) return;
    dom.statusZone.textContent = message;
    dom.statusZone.classList.add('est-visible');
    if (state.statusTimer) clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
        dom.statusZone.classList.remove('est-visible');
    }, 2200);
}

export function setDiagnosticStatus(element, message) {
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

export function animateViewEntrance(view) {
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

export function animateElementBatch(elements, { delayStep = 34, duration = 560 } = {}) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (const [index, element] of elements.entries()) {
        if (!(element instanceof HTMLElement)) continue;

        element.animate(
            [
                {
                    opacity: 0,
                    transform: 'translateY(18px) scale(0.985)',
                    filter: 'blur(10px)',
                },
                {
                    opacity: 1,
                    transform: 'translateY(0) scale(1)',
                    filter: 'blur(0)',
                },
            ],
            {
                duration,
                delay: Math.min(index * delayStep, 180),
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );
    }
}

export function activateView(viewName, { immediate = false } = {}) {
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

export function setConversationMode(enabled) {
    if (!dom.chatView) return;
    dom.chatView.classList.toggle('est-en-conversation', enabled);
}

