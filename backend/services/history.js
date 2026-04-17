const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/* ============================================================
   SERVICE DE PERSISTANCE DES CONVERSATIONS
   Gere la lecture/ecriture du fichier JSON contenant
   l'historique de toutes les conversations.
   ============================================================ */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'conversations.json');

/**
 * Cree le dossier de donnees s'il n'existe pas encore.
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.dbConnection('Dossier data cree: ' + DATA_DIR);
    }
}

/**
 * Charge et retourne toutes les conversations depuis le fichier JSON.
 *
 * @returns {Object} Dictionnaire { [conversationId]: conversationObject }.
 */
function loadAll() {
    ensureDataDir();

    // Premiere execution: aucun historique encore cree.
    if (!fs.existsSync(HISTORY_FILE)) return {};

    try {
        // Format attendu: objet indexe par conversationId.
        const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        return data;
    } catch {
        // Strategie defensive: ne pas bloquer l'application sur un JSON invalide.
        logger.dbError('READ', 'conversations.json', 'Fichier JSON corrompu, reinitialisation');
        return {};
    }
}

/**
 * Ecrit l'ensemble des conversations dans le fichier JSON.
 *
 * @param {Object} data - Dictionnaire complet des conversations.
 */
function saveAll(data) {
    ensureDataDir();
    try {
        // Ecriture pretty-print pour faciliter une inspection manuelle en dev.
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        logger.dbError('WRITE', 'conversations.json', err.message);
    }
}

/**
 * Recupere une conversation par son identifiant.
 *
 * @param {string} id - Identifiant unique de la conversation.
 * @returns {Object|null} L'objet conversation, ou null si introuvable.
 */
function getConversation(id) {
    const all = loadAll();
    const conv = all[id] || null;
    if (conv) {
        logger.dbSuccess('READ', 'conversations', `Conversation ${id} chargee`);
    }
    return conv;
}

/**
 * Sauvegarde (cree ou met a jour) une conversation.
 *
 * @param {string} id       - Identifiant unique de la conversation.
 * @param {Array}  messages  - Tableau des messages { role, content }.
 * @param {string} [title]   - Titre explicite (sinon extrait du premier message).
 */
function saveConversation(id, messages, title) {
    const all = loadAll();
    const existing = all[id];
    const now = new Date().toISOString();

    // Conserve createdAt d'origine en cas de mise a jour d'une conversation existante.
    all[id] = {
        id,
        title: title || (existing && existing.title) || extractTitle(messages),
        messages,
        updatedAt: now,
        createdAt: (existing && existing.createdAt) || now,
    };
    saveAll(all);
    logger.dbSuccess('SAVE', 'conversations', `Conversation ${id} sauvegardee (${messages.length} messages)`);
}

/**
 * Supprime une conversation par son identifiant.
 *
 * @param {string} id - Identifiant de la conversation a supprimer.
 * @returns {boolean} true si la conversation existait et a ete supprimee.
 */
function deleteConversation(id) {
    const all = loadAll();
    if (!all[id]) return false;
    delete all[id];
    saveAll(all);
    logger.dbSuccess('DELETE', 'conversations', `Conversation ${id} supprimee`);
    return true;
}

/**
 * Retourne la liste de toutes les conversations (sans les messages),
 * triees par date de derniere mise a jour (plus recente en premier).
 *
 * @returns {Array<{id, title, createdAt, updatedAt}>}
 */
function listConversations() {
    const all = loadAll();
    const list = Object.values(all)
        // On retire volontairement le tableau `messages` pour une reponse legere.
        .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    logger.dbSuccess('LIST', 'conversations', `${list.length} conversations`);
    return list;
}

/**
 * Extrait un titre court a partir du premier message utilisateur.
 * Tronque a 60 caracteres si necessaire.
 *
 * @param {Array} messages - Tableau des messages de la conversation.
 * @returns {string} Titre genere.
 */
function extractTitle(messages) {
    // Le titre est base sur le premier message user pour rester representatif.
    const first = messages.find(m => m.role === 'user');
    if (!first) return 'Nouvelle conversation';
    const text = first.content.trim();
    // Limite la longueur pour garder une UI lisible cote front.
    return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

module.exports = { getConversation, saveConversation, deleteConversation, listConversations };
