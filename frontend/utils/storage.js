/* ============================================================
   STOCKAGE CLIENT (session/local storage)
   ============================================================ */

// STORAGE_KEYS imported by consuming modules

export function storageGet(key, fallback = null) {
    try {
        return sessionStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

export function storageSet(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // Ignore storage failures.
    }
}

export function storageRemove(key) {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}
