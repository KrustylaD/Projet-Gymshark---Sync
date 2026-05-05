/* ============================================================
   SYNC UTILS (shared to avoid circular deps)
   ============================================================ */

import { dom, STORAGE_KEYS } from '../constants/config.js';
import { storageSet, storageRemove } from '../utils/storage.js';

export function saveDraft(value) {
    if (value && value.trim()) {
        storageSet(STORAGE_KEYS.draft, value);
    } else {
        storageRemove(STORAGE_KEYS.draft);
    }
}

export function syncAllInputs(value) {
    for (const input of dom.textInputs) input.value = value;
    saveDraft(value);
    syncInputBoxesState();
}

function syncInputBoxesState() {
    const activeEl = document.activeElement;
    const value = (dom.secondaryInput && activeEl === dom.secondaryInput
        ? dom.secondaryInput?.value?.trim()
        : '') || dom.primaryInput?.value?.trim() || '';
    if (dom.primaryInputBox && dom.primaryInput) {
        dom.primaryInputBox.classList.toggle('est-active', value.length > 0 || activeEl === dom.primaryInput);
    }
    if (dom.secondaryInputBox && dom.secondaryInput) {
        dom.secondaryInputBox.classList.toggle('est-active', value.length > 0 || activeEl === dom.secondaryInput);
    }
}
