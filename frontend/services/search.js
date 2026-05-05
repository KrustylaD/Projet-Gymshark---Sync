/* ============================================================
   RECHERCHE (filtrage des resultats)
   ============================================================ */

const SEARCH_SUGGESTIONS = [
    'Compte-rendu',
    'Priorites',
    'Automatisation',
    'Resume',
    'Support',
    'Organisation',
    'Template',
    'Suivi',
];

let _filterTimeout = null;

function buildSuggestions(container) {
    container.innerHTML = '';
    for (const text of SEARCH_SUGGESTIONS) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'recherche-pill';
        pill.textContent = text;
        pill.addEventListener('click', () => {
            const input = document.querySelector('.champ-recherche');
            if (input) {
                input.value = text;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            }
        });
        container.append(pill);
    }
}

function filterResults(query) {
    const results = document.getElementById('recherche-results');
    if (!results) return;

    const term = (query || '').toLowerCase().trim();
    const items = results.querySelectorAll('.element-liste');
    let hasVisible = false;

    for (const item of items) {
        const strong = item.querySelector('strong');
        const span = item.querySelector('span');
        const matchText = `${strong?.textContent || ''} ${span?.textContent || ''}`.toLowerCase();

        if (!term || matchText.includes(term)) {
            item.style.display = '';
            hasVisible = true;
        } else {
            item.style.display = 'none';
        }
    }

    showEmptyState(results, !hasVisible && !!term);
}

let _emptyStateEl = null;

function showEmptyState(container, show) {
    if (show) {
        if (!_emptyStateEl) {
            _emptyStateEl = document.createElement('div');
            _emptyStateEl.className = 'recherche-vide';
            const strong = document.createElement('strong');
            const span = document.createElement('span');
            strong.textContent = 'Aucun resultat';
            span.textContent = 'Essayez un autre mot-cle ou utilisez les suggestions ci-dessus.';
            _emptyStateEl.append(strong, span);
        }
        if (!_emptyStateEl.parentElement) {
            container.parentElement?.insertBefore(_emptyStateEl, container.nextSibling);
        }
        _emptyStateEl.style.display = '';
    } else if (_emptyStateEl) {
        _emptyStateEl.style.display = 'none';
    }
}

export function initSearch() {
    const input = document.querySelector('.champ-recherche');
    const suggestionsContainer = document.getElementById('recherche-suggestions-list');
    const clearButton = document.querySelector('.bouton-recherche-effacer');

    if (input) {
        input.addEventListener('input', () => {
            clearTimeout(_filterTimeout);
            _filterTimeout = setTimeout(() => filterResults(input.value), 120);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.blur();
            }
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            }
        });
    }

    if (suggestionsContainer) {
        buildSuggestions(suggestionsContainer);
    }
}
