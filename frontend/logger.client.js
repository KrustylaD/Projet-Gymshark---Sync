/* ============================================================
   LOGGER CLIENT - GYMSHARK SYNC
   Logs structures pour le navigateur.
   Categories : API, ROUTE, ERREUR, INFO
   ============================================================ */

(function () {
    'use strict';

    var STYLES = {
        apiSend: 'color:#4a90d9;font-weight:bold',
        apiOk: 'color:#27ae60;font-weight:bold',
        apiError: 'color:#e74c3c;font-weight:bold',
        route: 'color:#8e44ad;font-weight:bold',
        errorJs: 'color:#e74c3c;font-weight:bold',
        errorNet: 'color:#e67e22;font-weight:bold',
        info: 'color:#3498db;font-weight:bold',
        system: 'color:#27ae60;font-weight:bold',
        label: 'color:#95a5a6;font-weight:normal',
        reset: 'color:inherit;font-weight:normal',
    };

    var TAGS = {
        api: 'API    ',
        route: 'ROUTE  ',
        error: 'ERREUR ',
        info: 'INFO   ',
        system: 'SYSTEM ',
    };

    function timestamp() {
        var now = new Date();
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        return '[' + h + ':' + m + ':' + s + ']';
    }

    function emit(method, tag, tagStyle, segments) {
        try {
            var consoleMethod = typeof console[method] === 'function' ? console[method] : console.log;
            var format = '%c' + timestamp() + ' ' + tag;
            var styles = [tagStyle];

            for (var index = 0; index < segments.length; index += 1) {
                var segment = segments[index] || {};
                format += ' %c| %c' + (segment.text || '');
                styles.push(STYLES.label, segment.style || STYLES.reset);
            }

            consoleMethod.apply(console, [format].concat(styles));
        } catch (_) {
            /* securite */
        }
    }

    function formatMethod(method) {
        return String(method || 'GET').toUpperCase().padEnd(6);
    }

    function resolveRequestMeta(args) {
        var url = '';
        var method = 'GET';

        try {
            if (typeof args[0] === 'string') {
                url = args[0];
            } else if (args[0] && args[0].url) {
                url = args[0].url;
            }

            if (args[1] && args[1].method) {
                method = args[1].method;
            } else if (args[0] && typeof args[0] !== 'string' && args[0].method) {
                method = args[0].method;
            }
        } catch (_) {
            /* securite */
        }

        return {
            url: url,
            method: formatMethod(method),
        };
    }

    function logApiStart(request) {
        emit('log', TAGS.api, STYLES.apiSend, [
            { text: request.method, style: STYLES.apiSend },
            { text: request.url, style: STYLES.reset },
        ]);
    }

    function logApiResult(request, status, duration, errorMessage) {
        var style = status >= 400 || errorMessage ? STYLES.apiError : STYLES.apiOk;
        var statusText = errorMessage ? 'ERROR' : String(status);
        var durationText = duration + 'ms' + (errorMessage ? ' - ' + errorMessage : '');

        emit('log', TAGS.api, style, [
            { text: request.method, style: style },
            { text: request.url, style: STYLES.reset },
            { text: statusText, style: style },
            { text: durationText, style: STYLES.reset },
        ]);
    }

    function logRoute(from, to) {
        if (from === to) return;

        emit('log', TAGS.route, STYLES.route, [
            { text: from + ' -> ' + to, style: STYLES.route },
        ]);
    }

    function logClientError(message, file, line) {
        var location = file ? ' | ' + file + (line ? ':' + line : '') : '';
        emit('log', TAGS.error, STYLES.errorJs, [
            { text: String(message || 'Erreur inconnue') + location, style: STYLES.errorJs },
        ]);
    }

    function logResourceError(tagName, source) {
        emit('log', TAGS.error, STYLES.errorNet, [
            { text: 'Ressource introuvable: <' + tagName + '> ' + source, style: STYLES.errorNet },
        ]);
    }

    function logInfo(message) {
        emit('log', TAGS.info, STYLES.info, [
            { text: String(message || ''), style: STYLES.info },
        ]);
    }

    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function () {
            var args = arguments;
            var request = resolveRequestMeta(args);
            var startTime = performance.now();

            logApiStart(request);

            return originalFetch.apply(window, args).then(function (response) {
                var duration = Math.round(performance.now() - startTime);
                logApiResult(request, response.status, duration);
                return response;
            }).catch(function (err) {
                var duration = Math.round(performance.now() - startTime);
                var errorMessage = (err && err.message) || 'Network error';
                logApiResult(request, 0, duration, errorMessage);
                throw err;
            });
        };
    }

    var currentPath = window.location.pathname + window.location.hash;

    function patchHistoryMethod(methodName) {
        var originalMethod = history[methodName];
        if (typeof originalMethod !== 'function') return;

        history[methodName] = function () {
            var previousPath = currentPath;
            var result = originalMethod.apply(history, arguments);
            var nextPath = window.location.pathname + window.location.hash;
            logRoute(previousPath, nextPath);
            currentPath = nextPath;
            return result;
        };
    }

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    window.addEventListener('popstate', function () {
        var nextPath = window.location.pathname + window.location.hash;
        logRoute(currentPath, nextPath);
        currentPath = nextPath;
    });

    window.addEventListener('hashchange', function () {
        var nextPath = window.location.pathname + window.location.hash;
        logRoute(currentPath, nextPath);
        currentPath = nextPath;
    });

    window.addEventListener('error', function (event) {
        var file = event.filename || 'inconnu';
        var line = event.lineno || '?';
        var message = event.message || 'Erreur inconnue';
        logClientError(message, file, line);
    });

    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        var message = reason && reason.message ? reason.message : String(reason);
        logClientError('Unhandled Promise: ' + message);
    });

    window.addEventListener('error', function (event) {
        try {
            if (!event.target || event.target === window || !event.target.tagName) {
                return;
            }

            var tag = event.target.tagName.toLowerCase();
            var source = event.target.src || event.target.href || '';
            logResourceError(tag, source);
        } catch (_) {
            /* securite */
        }
    }, true);

    window.Logger = {
        api: function (method, url, status, duration) {
            logApiResult({
                method: formatMethod(method),
                url: url || '',
            }, Number(status) || 0, Number(duration) || 0);
        },

        route: function (from, to) {
            logRoute(from, to);
            currentPath = to;
        },

        error: function (message, file, line) {
            logClientError(message, file, line);
        },

        info: function (message) {
            logInfo(message);
        },
    };

    emit('log', TAGS.system, STYLES.system, [
        { text: 'Logger client initialise', style: STYLES.system },
    ]);
})();
