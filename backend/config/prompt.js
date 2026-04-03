const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * Chemin absolu vers le fichier contenant le system prompt.
 * Ce fichier definit les instructions de niveau systeme de l'assistant
 * (role, ton, comportements attendus).
 */
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system_prompt');

/**
 * Lit et renvoie le contenu du fichier system prompt.
 * En cas d'erreur de lecture, retourne une chaine vide
 * et logge l'erreur pour faciliter le debogage.
 *
 * @returns {string} Le texte du system prompt, ou chaine vide en cas d'erreur.
 */
function getSystemPrompt() {
    try {
        return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
    } catch (error) {
        logger.warn(`Impossible de lire le system prompt: ${error.message}`, 'config/prompt.js');
        return '';
    }
}

module.exports = {
    getSystemPrompt,
    SYSTEM_PROMPT_PATH,
};
