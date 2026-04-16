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
const MESSAGE_PREVIEW_LENGTH = 96;
const TITLE_MAX_LENGTH = 80;

const parsedMaxMessages = Number(process.env.MAX_STORED_MESSAGES);
const MAX_STORED_MESSAGES = Number.isFinite(parsedMaxMessages) && parsedMaxMessages > 0
    ? Math.floor(parsedMaxMessages)
    : 200;

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
 * Retourne un timestamp ISO valide.
 *
 * @param {string|Date|number|undefined} value
 * @returns {string}
 */
function toIsoDate(value) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
}

/**
 * Nettoie et normalise un message individuel.
 *
 * @param {any} entry
 * @returns {{role: 'user'|'assistant', content: string}|null}
 */
function normalizeMessage(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const role = entry.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof entry.content === 'string' ? entry.content.trim() : '';
    if (!content) return null;

    return { role, content };
}

/**
 * Nettoie et limite la taille d'un historique de messages.
 *
 * @param {any[]} messages
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];

    const normalized = [];
    for (const entry of messages) {
        const message = normalizeMessage(entry);
        if (message) normalized.push(message);
    }

    if (normalized.length <= MAX_STORED_MESSAGES) return normalized;
    return normalized.slice(normalized.length - MAX_STORED_MESSAGES);
}

/**
 * Extrait un titre court a partir du premier message utilisateur.
 * Tronque a TITLE_MAX_LENGTH caracteres si necessaire.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string}
 */
function extractTitle(messages) {
    const first = messages.find((m) => m.role === 'user');
    if (!first) return 'Nouvelle conversation';

    const text = first.content.trim();
    if (!text) return 'Nouvelle conversation';
    if (text.length <= TITLE_MAX_LENGTH) return text;
    return `${text.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

/**
 * Nettoie un titre libre utilisateur.
 *
 * @param {any} title
 * @returns {string}
 */
function normalizeTitle(title) {
    const value = typeof title === 'string' ? title.trim() : '';
    if (!value) return '';
    if (value.length <= TITLE_MAX_LENGTH) return value;
    return `${value.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

/**
 * Normalise une conversation stockee.
 *
 * @param {string} id
 * @param {any} raw
 * @returns {{id: string, title: string, messages: Array<{role: 'user'|'assistant', content: string}>, createdAt: string, updatedAt: string}}
 */
function normalizeConversation(id, raw) {
    const safeId = String(id || '').trim();
    const messages = normalizeMessages(raw?.messages);
    const fallbackTitle = extractTitle(messages);
    const title = normalizeTitle(raw?.title) || fallbackTitle;

    const createdAt = toIsoDate(raw?.createdAt);
    const updatedAt = toIsoDate(raw?.updatedAt || createdAt);

    return {
        id: safeId,
        title,
        messages,
        createdAt,
        updatedAt,
    };
}

/**
 * Produit un resume concis pour l'affichage de la liste d'historique.
 *
 * @param {{id: string, title: string, messages: Array<{content: string}>, createdAt: string, updatedAt: string}} conv
 * @returns {{id: string, title: string, createdAt: string, updatedAt: string, messageCount: number, lastMessagePreview: string}}
 */
function summarizeConversation(conv) {
    const lastMessage = conv.messages[conv.messages.length - 1]?.content || '';
    const lastMessagePreview = lastMessage.length <= MESSAGE_PREVIEW_LENGTH
        ? lastMessage
        : `${lastMessage.slice(0, MESSAGE_PREVIEW_LENGTH - 3)}...`;

    return {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
        lastMessagePreview,
    };
}

/**
 * Charge et retourne toutes les conversations depuis le fichier JSON.
 *
 * @returns {Object} Dictionnaire { [conversationId]: conversationObject }.
 */
function loadAll() {
    ensureDataDir();
    if (!fs.existsSync(HISTORY_FILE)) return {};

    try {
        const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            logger.dbError('READ', 'conversations.json', 'Format invalide, reinitialisation');
            return {};
        }

        const normalized = {};
        for (const [id, conv] of Object.entries(raw)) {
            const safeId = String(id || '').trim();
            if (!safeId) continue;
            normalized[safeId] = normalizeConversation(safeId, conv);
        }

        return normalized;
    } catch (err) {
        const backupPath = path.join(DATA_DIR, `conversations.corrupted.${Date.now()}.json`);
        try {
            fs.copyFileSync(HISTORY_FILE, backupPath);
            logger.dbError('READ', 'conversations.json', `JSON corrompu, backup cree: ${path.basename(backupPath)}`);
        } catch {
            logger.dbError('READ', 'conversations.json', `JSON corrompu, backup impossible: ${err.message}`);
        }
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
        const tmpPath = `${HISTORY_FILE}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmpPath, HISTORY_FILE);
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
    const safeId = String(id || '').trim();
    if (!safeId) return null;

    const all = loadAll();
    const conv = all[safeId] || null;
    if (conv) {
        logger.dbSuccess('READ', 'conversations', `Conversation ${safeId} chargee`);
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
    const safeId = String(id || '').trim();
    if (!safeId) {
        throw new Error('Conversation ID invalide');
    }

    const all = loadAll();
    const existing = all[safeId];
    const normalizedMessages = normalizeMessages(messages);
    all[safeId] = {
        id: safeId,
        title: normalizeTitle(title) || (existing && existing.title) || extractTitle(normalizedMessages),
        messages: normalizedMessages,
        updatedAt: new Date().toISOString(),
        createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    };

    saveAll(all);
    logger.dbSuccess('SAVE', 'conversations', `Conversation ${safeId} sauvegardee (${normalizedMessages.length} messages)`);
    return all[safeId];
}

/**
 * Remplace completement l'historique d'une conversation.
 * Utile pour synchroniser un etat edite cote frontend.
 *
 * @param {string} id
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [title]
 * @returns {{id: string, title: string, messages: Array<{role: 'user'|'assistant', content: string}>, createdAt: string, updatedAt: string}}
 */
function replaceConversationMessages(id, messages, title) {
    return saveConversation(id, messages, title);
}

/**
 * Renomme une conversation existante.
 *
 * @param {string} id
 * @param {string} title
 * @returns {{id: string, title: string, createdAt: string, updatedAt: string, messageCount: number, lastMessagePreview: string}|null}
 */
function renameConversation(id, title) {
    const safeId = String(id || '').trim();
    if (!safeId) return null;

    const nextTitle = normalizeTitle(title);
    if (!nextTitle) return null;

    const all = loadAll();
    const conv = all[safeId];
    if (!conv) return null;

    conv.title = nextTitle;
    conv.updatedAt = new Date().toISOString();
    all[safeId] = conv;
    saveAll(all);
    logger.dbSuccess('UPDATE', 'conversations', `Conversation ${safeId} renommee`);
    return summarizeConversation(conv);
}

/**
 * Supprime une conversation par son identifiant.
 *
 * @param {string} id - Identifiant de la conversation a supprimer.
 * @returns {boolean} true si la conversation existait et a ete supprimee.
 */
function deleteConversation(id) {
    const safeId = String(id || '').trim();
    if (!safeId) return false;

    const all = loadAll();
    if (!all[safeId]) return false;
    delete all[safeId];
    saveAll(all);
    logger.dbSuccess('DELETE', 'conversations', `Conversation ${safeId} supprimee`);
    return true;
}

/**
 * Retourne la liste de toutes les conversations (sans les messages),
 * triees par date de derniere mise a jour (plus recente en premier).
 *
 * @returns {Array<{id, title, createdAt, updatedAt}>}
 */
function listConversations({ query = '', limit } = {}) {
    const all = loadAll();

    let list = Object.values(all)
        .map((conv) => summarizeConversation(conv))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const safeQuery = String(query || '').trim().toLowerCase();
    if (safeQuery) {
        list = list.filter((conv) => {
            return conv.title.toLowerCase().includes(safeQuery)
                || conv.lastMessagePreview.toLowerCase().includes(safeQuery);
        });
    }

    const parsedLimit = Number(limit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        list = list.slice(0, Math.floor(parsedLimit));
    }

    logger.dbSuccess('LIST', 'conversations', `${list.length} conversations`);
    return list;
}

module.exports = {
    getConversation,
    saveConversation,
    replaceConversationMessages,
    renameConversation,
    deleteConversation,
    listConversations,
};
