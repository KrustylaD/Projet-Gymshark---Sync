const fs = require('fs');
const path = require('path');

// Chemin vers le fichier contenant le "system prompt".
// Ce fichier définit les instructions de niveau système de l'assistant
// (rôle, ton, comportements attendus). Garder ce fichier lisible par un humain.
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system_prompt');

// getSystemPrompt(): lit et renvoie le texte du system prompt.
// En cas d'erreur de lecture, retourne une chaîne vide et logge l'erreur
// pour faciliter le débogage sans casser l'exécution.
function getSystemPrompt() {
	try {
		return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
	} catch (error) {
		console.error('Impossible de lire le system prompt :', error.message);
		return '';
	}
}

module.exports = {
	getSystemPrompt,
	SYSTEM_PROMPT_PATH,
};
