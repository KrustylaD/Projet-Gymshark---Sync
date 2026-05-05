import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
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

let isDataDirEnsured = false;

/**
 * Cree le dossier de donnees s'il n'existe pas encore.
 */
function ensureDataDir() {
    if (isDataDirEnsured) return;
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
        logger.dbConnection('Dossier data cree: ' + DATA_DIR);
    }
    isDataDirEnsured = true;
}

/**
 * Charge et retourne toutes les conversations depuis le fichier JSON.
 * Retourne un objet vide si le fichier n'existe pas ou est corrompu.
 */
async function loadAll() {
    ensureDataDir();

    try {
        const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {};
        }
        logger.dbError('READ', 'conversations.json', 'Fichier JSON corrompu, reinitialisation');
        return {};
    }
}

/**
 * Ecrit l'ensemble des conversations dans le fichier JSON.
 */
async function saveAll(data) {
    ensureDataDir();
    try {
        const content = JSON.stringify(data, null, 2);
        await fs.writeFile(HISTORY_FILE, content, 'utf-8');
    } catch (err) {
        logger.dbError('WRITE', 'conversations.json', err.message);
    }
}

/**
 * Recupere une conversation par son identifiant.
 * Retourne null si la conversation n'existe pas.
 */
async function getConversation(id) {
    const all = await loadAll();

    if (all[id] == null) {
        return null;
    }

    logger.dbSuccess('READ', 'conversations', `Conversation ${id} chargee`);
    return all[id];
}

/**
 * Sauvegarde (cree ou met a jour) une conversation.
 * Conserve la date de creation d'origine si la conversation existait deja.
 */
async function saveConversation(id, messages, title) {
    const all = await loadAll();
    const existing = all[id];
    const now = new Date().toISOString();

    let finalTitle;
    if (title) {
        finalTitle = title;
    } else if (existing?.title) {
        finalTitle = existing.title;
    } else {
        finalTitle = extractTitle(messages);
    }

    let createdAt;
    if (existing != null && existing.createdAt) {
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

    await saveAll(all);
    logger.dbSuccess('SAVE', 'conversations', `Conversation ${id} sauvegardee (${messages.length} messages)`);
}

/**
 * Supprime une conversation par son identifiant.
 * Retourne true si la suppression a eu lieu, false si la conversation n'existait pas.
 */
async function deleteConversation(id) {
    const all = await loadAll();

    if (all[id] == null) {
        return false;
    }

    delete all[id];
    await saveAll(all);
    logger.dbSuccess('DELETE', 'conversations', `Conversation ${id} supprimee`);
    return true;
}

/**
 * Retourne la liste de toutes les conversations sans leurs messages,
 * triees par date de mise a jour decroissante (la plus recente en premier).
 */
async function listConversations() {
    const all = await loadAll();

    const list = [];
    for (const conv of Object.values(all)) {
        list.push({
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
        });
    }

    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    logger.dbSuccess('LIST', 'conversations', `${list.length} conversations`);
    return list;
}

/**
 * Genere un titre court a partir du premier message utilisateur.
 * Tronque a TITLE_MAX_LENGTH caracteres si necessaire.
 */
function extractTitle(messages) {
    const firstUserMessage = messages.find(m => m.role === 'user');

    if (firstUserMessage == null) {
        return 'Nouvelle conversation';
    }

    const text = firstUserMessage.content.trim();

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
