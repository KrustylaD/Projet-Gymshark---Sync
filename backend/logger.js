const chalk = require('chalk');
const morgan = require('morgan');

/* ============================================================
   LOGGER SERVEUR - GYMSHARK SYNC
   Systeme de logs structure et colore pour le backend.
   Categories : HTTP, BDD, ERREUR, SYSTEM
   ============================================================ */

const SEPARATOR = chalk.gray(' | ');
const TAGS = {
    http: chalk.cyan('\u{1F4E1} HTTP  '),
    db: chalk.cyan('\u{1F5C3}\uFE0F  BDD  '),
    error: chalk.bgRed.white.bold(' \u274C ERREUR '),
    warn: chalk.yellow.bold('\u26A0\uFE0F  WARN  '),
    info: chalk.white('\u2139\uFE0F  INFO  '),
    systemStart: chalk.green.bold('\u2705 SYSTEM'),
    systemStop: chalk.red.bold('\u{1F6D1} SYSTEM'),
    systemInfo: chalk.cyan('\u2705 SYSTEM'),
};

function timestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `[${h}:${m}:${s}]`;
}

function colorMethod(method) {
    const upper = (method || '').toUpperCase().padEnd(6);
    switch (upper.trim()) {
        case 'GET':
            return chalk.blue(upper);
        case 'POST':
            return chalk.green(upper);
        case 'PUT':
            return chalk.yellow(upper);
        case 'DELETE':
            return chalk.red(upper);
        default:
            return chalk.white(upper);
    }
}

function colorStatus(status) {
    const str = String(status);
    if (status >= 500) return chalk.red(str);
    if (status >= 400) return chalk.yellow(str);
    if (status >= 200 && status < 300) return chalk.green(str);
    return chalk.white(str);
}

function formatLocation(file, line) {
    if (!file) return '';
    return `${chalk.gray(file)}${line ? `:${line}` : ''}`;
}

function emit(method, tag, segments) {
    try {
        const output = typeof console[method] === 'function' ? console[method] : console.log;
        const visibleSegments = segments.filter(Boolean);
        const suffix = visibleSegments.length ? `${SEPARATOR}${visibleSegments.join(SEPARATOR)}` : '';
        output.call(console, `${timestamp()} ${tag}${suffix}`);
    } catch (_) {
        /* ne jamais planter */
    }
}

function http(method, endpoint, status, durationMs) {
    emit('log', TAGS.http, [
        colorMethod(method),
        chalk.white(endpoint),
        colorStatus(status),
        chalk.gray(`${durationMs}ms`),
    ]);
}

function dbSuccess(action, collection, result) {
    emit('log', TAGS.db, [
        chalk.green(action),
        chalk.white(collection),
        chalk.green(result),
    ]);
}

function dbError(action, collection, errorMsg) {
    emit('log', TAGS.db, [
        chalk.red(action),
        chalk.white(collection),
        chalk.red(errorMsg),
    ]);
}

function dbConnection(message) {
    emit('log', TAGS.db, [chalk.cyan(message)]);
}

function fatal(message, file, line) {
    emit('error', TAGS.error, [
        chalk.red.bold(message),
        formatLocation(file, line),
    ]);
}

function warn(message, file, line) {
    emit('warn', TAGS.warn, [
        chalk.yellow.bold(message),
        formatLocation(file, line),
    ]);
}

function info(message) {
    emit('log', TAGS.info, [chalk.white(message)]);
}

function systemStart(message) {
    emit('log', TAGS.systemStart, [chalk.green.bold(message)]);
}

function systemStop(message) {
    emit('log', TAGS.systemStop, [chalk.red.bold(message)]);
}

function systemInfo(message) {
    emit('log', TAGS.systemInfo, [chalk.cyan(message)]);
}

function morganMiddleware() {
    return morgan((tokens, req, res) => {
        try {
            const method = tokens.method(req, res) || 'GET';
            const url = tokens.url(req, res) || '/';
            const status = Number(tokens.status(req, res)) || 0;
            const duration = Math.round(parseFloat(tokens['response-time'](req, res)) || 0);
            http(method, url, status, duration);
        } catch (_) {
            /* ne jamais planter */
        }
        return null;
    });
}

module.exports = {
    http,
    dbSuccess,
    dbError,
    dbConnection,
    fatal,
    warn,
    info,
    systemStart,
    systemStop,
    systemInfo,
    morganMiddleware,
};
