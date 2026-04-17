const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * Chemin absolu vers le fichier contenant le system prompt.
 * Ce fichier definit les instructions de niveau systeme de l'assistant
 * (role, ton, comportements attendus).
 */
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system_prompt');

// Cache memoire: evite de relire le fichier a chaque requete.
// L'invalidation se fait via la date de modification (mtime).
let cachedPrompt = null;
let cachedPromptMtimeMs = null;

/**
 * Lit et renvoie le contenu du fichier system prompt.
 * En cas d'erreur de lecture, retourne une chaine vide
 * et logge l'erreur pour faciliter le debogage.
 *
 * @returns {string} Le texte du system prompt, ou chaine vide en cas d'erreur.
 */
function getSystemPrompt() {
    try {
        // On lit d'abord les metadonnees pour savoir si le fichier a change.
        const stats = fs.statSync(SYSTEM_PROMPT_PATH);

        // Si rien n'a change, on reutilise la valeur deja en memoire.
        if (cachedPrompt !== null && cachedPromptMtimeMs === stats.mtimeMs) {
            return cachedPrompt;
        }

        // Rechargement du prompt depuis le disque puis mise a jour du cache.
        cachedPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
        cachedPromptMtimeMs = stats.mtimeMs;
        return cachedPrompt;
    } catch (error) {
        // Fallback defensif: le service continue de fonctionner sans system prompt.
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
