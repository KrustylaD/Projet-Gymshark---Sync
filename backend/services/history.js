import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============================================================
   SERVICE DE PERSISTANCE DES CONVERSATIONS
   Gere la lecture/ecriture du fichier JSON contenant
   l'historique de toutes les conversations.
   ============================================================ */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'conversations.json');

// Longueur maximale d'un titre de conversation genere automatiquement.
const TITLE_MAX_LENGTH = 60;

/**
 * Cree le dossier de donnees s'il n'existe pas encore.
 */
function ensureDataDir() {
    const dirExists = fs.existsSync(DATA_DIR);
    if (dirExists === false) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.dbConnection('Dossier data cree: ' + DATA_DIR);
    }
}

/**
 * Charge et retourne toutes les conversations depuis le fichier JSON.
 * Retourne un objet vide si le fichier n'existe pas ou est corrompu.
 */
function loadAll() {
    ensureDataDir();

    // Premiere execution : le fichier n'a pas encore ete cree.
    const fileExists = fs.existsSync(HISTORY_FILE);
    if (fileExists === false) {
        return {};
    }

    try {
        // Le fichier est un objet JSON indexe par conversationId.
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return data;
    } catch {
        // Fichier JSON invalide : on repart d'un etat vide plutot que de crasher.
        logger.dbError('READ', 'conversations.json', 'Fichier JSON corrompu, reinitialisation');
        return {};
    }
}

/**
 * Ecrit l'ensemble des conversations dans le fichier JSON.
 */
function saveAll(data) {
    ensureDataDir();
    try {
        // Pretty-print pour pouvoir inspecter le fichier manuellement en dev.
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(HISTORY_FILE, content, 'utf-8');
    } catch (err) {
        logger.dbError('WRITE', 'conversations.json', err.message);
    }
}

/**
 * Recupere une conversation par son identifiant.
 * Retourne null si la conversation n'existe pas.
 */
function getConversation(id) {
    const all = loadAll();

    // Verifier explicitement que la cle existe dans l'objet.
    if (all[id] === undefined || all[id] === null) {
        return null;
    }

    logger.dbSuccess('READ', 'conversations', `Conversation ${id} chargee`);
    return all[id];
}

/**
 * Sauvegarde (cree ou met a jour) une conversation.
 * Conserve la date de creation d'origine si la conversation existait deja.
 */
function saveConversation(id, messages, title) {
    const all = loadAll();
    const existing = all[id];
    const now = new Date().toISOString();

    // Determiner le titre : priorite au titre explicite, sinon celui existant, sinon on le genere.
    let finalTitle;
    if (title !== undefined && title !== null && title !== '') {
        finalTitle = title;
    } else if (existing !== undefined && existing !== null && existing.title) {
        finalTitle = existing.title;
    } else {
        finalTitle = extractTitle(messages);
    }

    // Conserver la date de creation d'origine pour les conversations existantes.
    let createdAt;
    if (existing !== undefined && existing !== null && existing.createdAt) {
        createdAt = existing.createdAt;
    } else {
        createdAt = now;
    }

    all[id] = {
        id,
        title: finalTitle,
        messages,
        updatedAt: now,
        createdAt: createdAt,
    };

    saveAll(all);
    logger.dbSuccess('SAVE', 'conversations', `Conversation ${id} sauvegardee (${messages.length} messages)`);
}

/**
 * Supprime une conversation par son identifiant.
 * Retourne true si la suppression a eu lieu, false si la conversation n'existait pas.
 */
function deleteConversation(id) {
    const all = loadAll();

    if (all[id] === undefined || all[id] === null) {
        return false;
    }

    delete all[id];
    saveAll(all);
    logger.dbSuccess('DELETE', 'conversations', `Conversation ${id} supprimee`);
    return true;
}

/**
 * Retourne la liste de toutes les conversations sans leurs messages,
 * triees par date de mise a jour decroissante (la plus recente en premier).
 */
function listConversations() {
    const all = loadAll();

    // Construire une version allegee de chaque conversation (sans les messages).
    const list = [];
    for (const conv of Object.values(all)) {
        list.push({
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
        });
    }

    // Trier par date de mise a jour, de la plus recente a la plus ancienne.
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    logger.dbSuccess('LIST', 'conversations', `${list.length} conversations`);
    return list;
}

/**
 * Genere un titre court a partir du premier message utilisateur.
 * Tronque a TITLE_MAX_LENGTH caracteres si necessaire.
 */
function extractTitle(messages) {
    // Chercher le premier message envoye par l'utilisateur.
    const firstUserMessage = messages.find(m => m.role === 'user');

    if (firstUserMessage === undefined || firstUserMessage === null) {
        return 'Nouvelle conversation';
    }

    const text = firstUserMessage.content.trim();

    // Tronquer pour eviter un titre trop long dans l'interface.
    if (text.length > TITLE_MAX_LENGTH) {
        return text.slice(0, TITLE_MAX_LENGTH - 3) + '...';
    }

    return text;
}

export {
    getConversation,
    saveConversation,
    deleteConversation,
    listConversations,
};
