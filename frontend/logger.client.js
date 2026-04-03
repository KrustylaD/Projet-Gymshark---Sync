/* ============================================================
   LOGGER CLIENT — GYMSHARK SYNC
   Systeme de logs structure et colore pour le navigateur.
   Categories : API, ROUTE, ERREUR
   Override du fetch natif + capture des erreurs globales.
   ============================================================ */

(function () {
    'use strict';

    /* --- Styles CSS pour console.log --- */
    const STYLES = {
        apiSend:    'color:#4a90d9;font-weight:bold',
        apiOk:      'color:#27ae60;font-weight:bold',
        apiError:   'color:#e74c3c;font-weight:bold',
        route:      'color:#8e44ad;font-weight:bold',
        errorJs:    'color:#e74c3c;font-weight:bold',
        errorNet:   'color:#e67e22;font-weight:bold',
        label:      'color:#95a5a6;font-weight:normal',
        reset:      'color:inherit;font-weight:normal',
    };

    /**
     * Retourne l'heure actuelle au format [HH:MM:SS].
     * @returns {string}
     */
    function timestamp() {
        var now = new Date();
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        return '[' + h + ':' + m + ':' + s + ']';
    }

    /* ============================================================
       🌐 APPELS API (interception du fetch)
       ============================================================ */

    var originalFetch = window.fetch;

    window.fetch = function () {
        var args = arguments;
        var url = '';
        var method = 'GET';

        try {
            if (typeof args[0] === 'string') {
                url = args[0];
            } else if (args[0] && args[0].url) {
                url = args[0].url;
            }
            if (args[1] && args[1].method) {
                method = args[1].method.toUpperCase();
            } else if (args[0] && typeof args[0] !== 'string' && args[0].method) {
                method = args[0].method.toUpperCase();
            }
        } catch (_) { /* securite */ }

        var startTime = performance.now();

        // Log de la requete envoyee
        try {
            console.log(
                '%c' + timestamp() + ' 🌐 API    %c| %c' + method.padEnd(6) + '%c| ' + url,
                STYLES.apiSend, STYLES.label, STYLES.apiSend, STYLES.label
            );
        } catch (_) { /* securite */ }

        return originalFetch.apply(window, args).then(function (response) {
            var duration = Math.round(performance.now() - startTime);
            try {
                var status = response.status;
                var style = status >= 400 ? STYLES.apiError : STYLES.apiOk;
                console.log(
                    '%c' + timestamp() + ' 🌐 API    %c| %c' + method.padEnd(6) + '%c| ' + url + ' | %c' + status + '%c | ' + duration + 'ms',
                    style, STYLES.label, style, STYLES.label, style, STYLES.label
                );
            } catch (_) { /* securite */ }
            return response;
        }).catch(function (err) {
            var duration = Math.round(performance.now() - startTime);
            try {
                console.log(
                    '%c' + timestamp() + ' 🌐 API    %c| %c' + method.padEnd(6) + '%c| ' + url + ' | %cERROR%c | ' + duration + 'ms — ' + (err && err.message || 'Network error'),
                    STYLES.apiError, STYLES.label, STYLES.apiError, STYLES.label, STYLES.apiError, STYLES.label
                );
            } catch (_) { /* securite */ }
            throw err;
        });
    };

    /* ============================================================
       🔄 CHANGEMENTS DE PAGE (History API + hashchange)
       ============================================================ */

    var currentPath = window.location.pathname + window.location.hash;

    /**
     * Logue un changement de page.
     * @param {string} from - Ancienne URL.
     * @param {string} to   - Nouvelle URL.
     */
    function logNavigation(from, to) {
        try {
            if (from === to) return;
            console.log(
                '%c' + timestamp() + ' 🔄 ROUTE  %c| %c' + from + ' → ' + to,
                STYLES.route, STYLES.label, STYLES.route
            );
            currentPath = to;
        } catch (_) { /* securite */ }
    }

    // Override pushState
    var originalPushState = history.pushState;
    history.pushState = function () {
        var oldPath = currentPath;
        originalPushState.apply(history, arguments);
        var newPath = window.location.pathname + window.location.hash;
        logNavigation(oldPath, newPath);
    };

    // Override replaceState
    var originalReplaceState = history.replaceState;
    history.replaceState = function () {
        var oldPath = currentPath;
        originalReplaceState.apply(history, arguments);
        var newPath = window.location.pathname + window.location.hash;
        logNavigation(oldPath, newPath);
    };

    // Evenements popstate et hashchange
    window.addEventListener('popstate', function () {
        try {
            var newPath = window.location.pathname + window.location.hash;
            logNavigation(currentPath, newPath);
        } catch (_) { /* securite */ }
    });

    window.addEventListener('hashchange', function () {
        try {
            var newPath = window.location.pathname + window.location.hash;
            logNavigation(currentPath, newPath);
        } catch (_) { /* securite */ }
    });

    /* ============================================================
       ❌ ERREURS CLIENT (globales)
       ============================================================ */

    // Erreurs JS non capturees
    window.addEventListener('error', function (event) {
        try {
            var file = event.filename || 'inconnu';
            var line = event.lineno || '?';
            var message = event.message || 'Erreur inconnue';
            console.log(
                '%c' + timestamp() + ' ❌ ERREUR %c| %c' + message + '%c | ' + file + ':' + line,
                STYLES.errorJs, STYLES.label, STYLES.errorJs, STYLES.label
            );
        } catch (_) { /* securite */ }
    });

    // Promesses non capturees
    window.addEventListener('unhandledrejection', function (event) {
        try {
            var reason = event.reason;
            var message = (reason && reason.message) ? reason.message : String(reason);
            console.log(
                '%c' + timestamp() + ' ❌ ERREUR %c| %cUnhandled Promise: ' + message,
                STYLES.errorJs, STYLES.label, STYLES.errorJs
            );
        } catch (_) { /* securite */ }
    });

    // Erreurs reseau (images, scripts, etc.)
    window.addEventListener('error', function (event) {
        try {
            if (event.target && event.target !== window && event.target.tagName) {
                var tag = event.target.tagName.toLowerCase();
                var src = event.target.src || event.target.href || '';
                console.log(
                    '%c' + timestamp() + ' ❌ ERREUR %c| %cRessource introuvable: <' + tag + '> ' + src,
                    STYLES.errorNet, STYLES.label, STYLES.errorNet
                );
            }
        } catch (_) { /* securite */ }
    }, true); // capture phase pour les erreurs de ressources

    /* ============================================================
       METHODES CUSTOM EXPOSEES SUR window.Logger
       ============================================================ */

    window.Logger = {
        /**
         * Log un appel API manuellement.
         * @param {string} method  - Methode HTTP.
         * @param {string} url     - URL appelee.
         * @param {number} status  - Code de statut.
         * @param {number} duration - Duree en ms.
         */
        api: function (method, url, status, duration) {
            try {
                var style = status >= 400 ? STYLES.apiError : STYLES.apiOk;
                console.log(
                    '%c' + timestamp() + ' 🌐 API    %c| %c' + (method || 'GET').padEnd(6) + '%c| ' + url + ' | %c' + status + '%c | ' + duration + 'ms',
                    style, STYLES.label, style, STYLES.label, style, STYLES.label
                );
            } catch (_) { /* securite */ }
        },

        /**
         * Log une navigation de page manuellement.
         * @param {string} from - Page d'origine.
         * @param {string} to   - Page de destination.
         */
        route: function (from, to) {
            logNavigation(from, to);
        },

        /**
         * Log une erreur client manuellement.
         * @param {string} message - Message d'erreur.
         * @param {string} [file]  - Fichier source.
         * @param {number} [line]  - Numero de ligne.
         */
        error: function (message, file, line) {
            try {
                var loc = file ? ' | ' + file + (line ? ':' + line : '') : '';
                console.log(
                    '%c' + timestamp() + ' ❌ ERREUR %c| %c' + message + loc,
                    STYLES.errorJs, STYLES.label, STYLES.errorJs
                );
            } catch (_) { /* securite */ }
        },

        /**
         * Log une info client.
         * @param {string} message
         */
        info: function (message) {
            try {
                console.log(
                    '%c' + timestamp() + ' ℹ️  INFO  %c| %c' + message,
                    'color:#3498db;font-weight:bold', STYLES.label, 'color:#3498db'
                );
            } catch (_) { /* securite */ }
        },
    };

    // Log d'initialisation
    try {
        console.log(
            '%c' + timestamp() + ' ✅ SYSTEM %c| %cLogger client initialise',
            'color:#27ae60;font-weight:bold', STYLES.label, 'color:#27ae60;font-weight:bold'
        );
    } catch (_) { /* securite */ }

})();
