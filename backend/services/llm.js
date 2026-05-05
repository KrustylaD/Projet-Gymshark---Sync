import { generateOllamaResponse, getOllamaHealth } from './ollama.js';
import { generateOpenCodeResponse, getOpenCodeHealth } from './opencode.js';
import logger from '../logger.js';

const PROVIDER = (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();

if (PROVIDER !== 'ollama' && PROVIDER !== 'opencode') {
    logger.warn(`LLM_PROVIDER invalide: "${PROVIDER}". Utilisation de "ollama".`, 'services/llm.js');
}

const effectiveProvider = (PROVIDER === 'ollama' || PROVIDER === 'opencode') ? PROVIDER : 'ollama';

logger.systemInfo(`Fournisseur LLM: ${effectiveProvider}`);

export async function generateResponse(prompt, options = {}) {
    if (effectiveProvider === 'opencode') {
        return generateOpenCodeResponse(prompt, options);
    }
    return generateOllamaResponse(prompt, options);
}

export async function getHealth(options = {}) {
    if (effectiveProvider === 'opencode') {
        return getOpenCodeHealth(options);
    }
    return getOllamaHealth(options);
}
