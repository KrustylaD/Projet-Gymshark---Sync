/* ============================================================
   FEEDBACK UI (status + navigation + animations)
   ============================================================ */

import { dom, state } from '../constants/config.js';

const STATUS_DISPLAY_MS = 2200;
const PAGE_TRANSITION_MS = 720;
const MAX_VIEW_ENTRANCE_TARGETS = 14;
const VIEW_ENTRANCE_DURATION_MS = 640;
const VIEW_ENTRANCE_DELAY_STEP_MS = 42;
const VIEW_ENTRANCE_MAX_DELAY_MS = 220;
const BATCH_ENTRANCE_DELAY_STEP_MS = 34;
const BATCH_ENTRANCE_DURATION_MS = 560;
const BATCH_ENTRANCE_MAX_DELAY_MS = 180;
const VIEW_SWITCH_DELAY_MS = 170;
const VIEW_OUTRO_CLEANUP_MS = 520;

export function showStatus(message) {
    if (!dom.statusZone) return;
    dom.statusZone.textContent = message;
    dom.statusZone.classList.add('est-visible');
    if (state.statusTimer) clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
        dom.statusZone.classList.remove('est-visible');
    }, STATUS_DISPLAY_MS);
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
    setTimeout(() => dom.pageTransition?.classList.remove('est-active'), PAGE_TRANSITION_MS);
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

    return uniqueTargets.slice(0, MAX_VIEW_ENTRANCE_TARGETS);
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
                duration: VIEW_ENTRANCE_DURATION_MS,
                delay: Math.min(index * VIEW_ENTRANCE_DELAY_STEP_MS, VIEW_ENTRANCE_MAX_DELAY_MS),
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            }
        );
    }
}

export function animateElementBatch(elements, { delayStep = BATCH_ENTRANCE_DELAY_STEP_MS, duration = BATCH_ENTRANCE_DURATION_MS } = {}) {
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
                delay: Math.min(index * delayStep, BATCH_ENTRANCE_MAX_DELAY_MS),
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
        setTimeout(() => nextView.classList.remove('vue-transition-entree'), VIEW_OUTRO_CLEANUP_MS);
        state.viewSwitchTimer = null;
    }, VIEW_SWITCH_DELAY_MS);
}

export function setConversationMode(enabled) {
    if (!dom.chatView) return;
    dom.chatView.classList.toggle('est-en-conversation', enabled);
}

