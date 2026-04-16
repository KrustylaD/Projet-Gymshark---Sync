const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * Chemin absolu vers le fichier contenant le system prompt.
 * Ce fichier definit les instructions de niveau systeme de l'assistant
 * (role, ton, comportements attendus).
 */
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system_prompt');
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
        const stats = fs.statSync(SYSTEM_PROMPT_PATH);

        if (cachedPrompt !== null && cachedPromptMtimeMs === stats.mtimeMs) {
            return cachedPrompt;
        }

        cachedPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
        cachedPromptMtimeMs = stats.mtimeMs;
        return cachedPrompt;
    } catch (error) {
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
