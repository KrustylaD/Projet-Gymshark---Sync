const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// Chemin vers le fichier texte qui contient les instructions systeme du LLM.
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system_prompt');

// Cache memoire du prompt : evite de relire le fichier a chaque requete.
// cachedPromptMtimeMs stocke la date de modification pour detecter les changements.
let cachedPrompt = null;
let cachedPromptMtimeMs = null;

/**
 * Retourne le contenu du system prompt.
 * Relit le fichier uniquement si son contenu a change depuis le dernier appel.
 * Retourne une chaine vide si le fichier est illisible.
 */
function getSystemPrompt() {
    try {
        // Lire les metadonnees du fichier pour savoir s'il a ete modifie.
        const stats = fs.statSync(SYSTEM_PROMPT_PATH);

        // Le cache est encore valide : meme fichier, meme date de modification.
        const cacheIsValid = cachedPrompt !== null && cachedPromptMtimeMs === stats.mtimeMs;
        if (cacheIsValid) {
            return cachedPrompt;
        }

        // Le fichier a change (ou premiere lecture) : recharger depuis le disque.
        cachedPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
        cachedPromptMtimeMs = stats.mtimeMs;
        return cachedPrompt;

    } catch (error) {
        // Le fichier est absent ou illisible : on continue sans system prompt.
        logger.warn(`Impossible de lire le system prompt: ${error.message}`, 'config/prompt.js');
        cachedPrompt = '';
        cachedPromptMtimeMs = null;
        return '';
    }
}

module.exports = {
    getSystemPrompt,
    SYSTEM_PROMPT_PATH,
};
