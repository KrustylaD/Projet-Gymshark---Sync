const chalk = require('chalk');

/* ============================================================
   LOGGER SERVEUR — GYMSHARK SYNC
   Systeme de logs structure et colore pour le backend.
   Categories : HTTP, BDD, ERREUR, SYSTEM
   ============================================================ */

/**
 * Retourne l'heure actuelle au format [HH:MM:SS].
 * @returns {string}
 */
function timestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `[${h}:${m}:${s}]`;
}

/* ============================================================
   📡 REQUETES HTTP
   ============================================================ */

/**
 * Colore une methode HTTP selon sa nature.
 * @param {string} method
 * @returns {string}
 */
function colorMethod(method) {
    const upper = (method || '').toUpperCase().padEnd(6);
    switch (upper.trim()) {
        case 'GET':    return chalk.blue(upper);
        case 'POST':   return chalk.green(upper);
        case 'PUT':    return chalk.yellow(upper);
        case 'DELETE': return chalk.red(upper);
        default:       return chalk.white(upper);
    }
}

/**
 * Colore un code de statut HTTP.
 * @param {number} status
 * @returns {string}
 */
function colorStatus(status) {
    const str = String(status);
    if (status >= 500) return chalk.red(str);
    if (status >= 400) return chalk.yellow(str);
    if (status >= 200 && status < 300) return chalk.green(str);
    return chalk.white(str);
}

/**
 * Logue une requete HTTP.
 * Format : [HH:MM:SS] 📡 HTTP   | METHODE | ENDPOINT | STATUS | Xms
 *
 * @param {string} method   - Methode HTTP (GET, POST, etc.)
 * @param {string} endpoint - URL de la requete.
 * @param {number} status   - Code de statut HTTP.
 * @param {number} durationMs - Duree de la requete en ms.
 */
function http(method, endpoint, status, durationMs) {
    try {
        const ts = timestamp();
        const tag = chalk.cyan('📡 HTTP  ');
        const sep = chalk.gray(' | ');
        const dur = chalk.gray(`${durationMs}ms`);
        console.log(`${ts} ${tag}${sep}${colorMethod(method)}${sep}${chalk.white(endpoint)}${sep}${colorStatus(status)}${sep}${dur}`);
    } catch (_) { /* ne jamais planter */ }
}

/* ============================================================
   🗄️  ACCES BASE DE DONNEES
   ============================================================ */

/**
 * Logue un acces base de donnees reussi.
 *
 * @param {string} action     - Type d'action (SELECT, INSERT, UPDATE, DELETE, etc.)
 * @param {string} collection - Nom de la collection/table.
 * @param {string} result     - Description du resultat.
 */
function dbSuccess(action, collection, result) {
    try {
        const ts = timestamp();
        const tag = chalk.cyan('🗄️  BDD  ');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.green(action)}${sep}${chalk.white(collection)}${sep}${chalk.green(result)}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue un acces base de donnees echoue.
 *
 * @param {string} action     - Type d'action tentee.
 * @param {string} collection - Nom de la collection/table.
 * @param {string} errorMsg   - Message d'erreur.
 */
function dbError(action, collection, errorMsg) {
    try {
        const ts = timestamp();
        const tag = chalk.cyan('🗄️  BDD  ');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.red(action)}${sep}${chalk.white(collection)}${sep}${chalk.red(errorMsg)}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue une connexion a la base de donnees.
 *
 * @param {string} message - Message de connexion.
 */
function dbConnection(message) {
    try {
        const ts = timestamp();
        const tag = chalk.cyan('🗄️  BDD  ');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.cyan(message)}`);
    } catch (_) { /* ne jamais planter */ }
}

/* ============================================================
   ❌ ERREURS SERVEUR
   ============================================================ */

/**
 * Logue une erreur fatale.
 *
 * @param {string} message - Message d'erreur.
 * @param {string} [file]  - Fichier d'origine.
 * @param {number} [line]  - Numero de ligne.
 */
function fatal(message, file, line) {
    try {
        const ts = timestamp();
        const tag = chalk.bgRed.white.bold(' ❌ ERREUR ');
        const sep = chalk.gray(' | ');
        const loc = file ? `${sep}${chalk.gray(file)}${line ? ':' + line : ''}` : '';
        console.error(`${ts} ${tag}${sep}${chalk.red.bold(message)}${loc}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue un avertissement.
 *
 * @param {string} message - Message d'avertissement.
 * @param {string} [file]  - Fichier d'origine.
 * @param {number} [line]  - Numero de ligne.
 */
function warn(message, file, line) {
    try {
        const ts = timestamp();
        const tag = chalk.yellow.bold('⚠️  WARN  ');
        const sep = chalk.gray(' | ');
        const loc = file ? `${sep}${chalk.gray(file)}${line ? ':' + line : ''}` : '';
        console.warn(`${ts} ${tag}${sep}${chalk.yellow.bold(message)}${loc}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue une information (erreur de niveau info).
 *
 * @param {string} message - Message d'information.
 */
function info(message) {
    try {
        const ts = timestamp();
        const tag = chalk.white('ℹ️  INFO  ');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.white(message)}`);
    } catch (_) { /* ne jamais planter */ }
}

/* ============================================================
   ✅ EVENEMENTS SYSTEME
   ============================================================ */

/**
 * Logue le demarrage du serveur.
 *
 * @param {string} message - Message de demarrage.
 */
function systemStart(message) {
    try {
        const ts = timestamp();
        const tag = chalk.green.bold('✅ SYSTEM');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.green.bold(message)}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue l'arret du serveur.
 *
 * @param {string} message - Message d'arret.
 */
function systemStop(message) {
    try {
        const ts = timestamp();
        const tag = chalk.red.bold('🛑 SYSTEM');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.red.bold(message)}`);
    } catch (_) { /* ne jamais planter */ }
}

/**
 * Logue une information systeme generale.
 *
 * @param {string} message - Message d'information.
 */
function systemInfo(message) {
    try {
        const ts = timestamp();
        const tag = chalk.cyan('✅ SYSTEM');
        const sep = chalk.gray(' | ');
        console.log(`${ts} ${tag}${sep}${chalk.cyan(message)}`);
    } catch (_) { /* ne jamais planter */ }
}

/* ============================================================
   MIDDLEWARE MORGAN PERSONNALISE
   Retourne un token format pour morgan qui delegue a logger.http
   ============================================================ */

const morgan = require('morgan');

/**
 * Cree un middleware morgan qui utilise le logger interne.
 * @returns {Function} Middleware Express.
 */
function morganMiddleware() {
    return morgan((tokens, req, res) => {
        try {
            const method = tokens.method(req, res) || 'GET';
            const url = tokens.url(req, res) || '/';
            const status = Number(tokens.status(req, res)) || 0;
            const duration = Math.round(parseFloat(tokens['response-time'](req, res)) || 0);
            http(method, url, status, duration);
        } catch (_) { /* ne jamais planter */ }
        return null; // on gere l'affichage nous-memes
    });
}

/* ============================================================
   EXPORTS
   ============================================================ */

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
