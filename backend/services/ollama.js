const { getSystemPrompt } = require('../config/prompt');
const logger = require('../logger');

/* ============================================================
   SERVICE OLLAMA
   Gere la communication avec le serveur Ollama (LLM local).
   Supporte le streaming et le health check.
   ============================================================ */

const ollamaBaseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const API_URL = ollamaBaseUrl + '/api/generate';
const MODEL = process.env.OLLAMA_MODEL || 'llama3';

/* --- Resolution du fetch (Node 18+ natif ou node-fetch en fallback) --- */
let fetchFn = global.fetch;
if (!fetchFn) {
    try {
        fetchFn = require('node-fetch');
    } catch (e) {
        // fetch sera peut-etre disponible a l'execution ;
        // une erreur explicite sera levee plus tard si absent
    }
}

/**
 * Extrait la portion de texte lisible d'une ligne brute recue
 * depuis le stream Ollama (SSE / JSON / texte brut).
 * Conserve les espaces significatifs entre les mots.
 *
 * @param {string} line - Ligne brute du stream.
 * @returns {string} Texte extrait, ou chaine vide si rien d'utile.
 */
function extractTextPiece(line) {
    let value = String(line || '');
    if (value === '') return '';

    // Supprime un eventuel prefixe SSE "data:"
    if (/^\s*data:\s*/.test(value)) {
        value = value.replace(/^\s*data:\s*/, '');
    }

    // Marqueur de fin de flux
    if (value.trim() === '[DONE]') return '';

    try {
        const parsed = JSON.parse(value);

        // Format Ollama /api/generate : { response: "...", done: false }
        if (typeof parsed.response === 'string') return parsed.response;

        // Format /api/chat : { message: { content: '...' } }
        if (parsed.message && typeof parsed.message.content === 'string') return parsed.message.content;

        // Formats alternatifs de compatibilite
        if (typeof parsed.output_text === 'string') return parsed.output_text;
        if (typeof parsed.text === 'string') return parsed.text;
        if (parsed?.output && Array.isArray(parsed.output)) {
            const first = parsed.output[0];
            if (first && typeof first.content === 'string') return first.content;
        }

        // Metadonnees seules -> ignorer
        return '';
    } catch (e) {
        // Pas du JSON -> renvoyer la valeur brute (preserve les espaces)
        return value;
    }
}

/**
 * Envoie une requete en streaming vers /api/generate d'Ollama
 * et appelle `onChunk(text)` pour chaque fragment textuel recu.
 *
 * @param {string} prompt             - Le prompt complet a envoyer au LLM.
 * @param {Object} options
 * @param {Function} [options.onChunk]  - Callback appele avec chaque fragment de texte.
 * @param {number}   [options.timeoutMs] - Timeout d'inactivite (re-arme a chaque fragment).
 * @returns {Promise<string>} Le texte complet assemble une fois le flux termine.
 */
async function generateOllamaResponse(prompt, { onChunk, timeoutMs } = {}) {
    const controller = new AbortController();
    const { signal } = controller;

    const parsedTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0;
    let timeoutId;

    /** Arme (ou re-arme) le timer d'inactivite. */
    const armTimeout = () => {
        if (!hasTimeout) return;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), parsedTimeout);
    };

    /** Annule le timer d'inactivite en cours. */
    const clearTimeoutIfNeeded = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    armTimeout();

    /* --- Construction du payload --- */
    const systemPrompt = getSystemPrompt();
    const payload = {
        model: MODEL,
        prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        stream: true,
        num_predict: 400,
        temperature: 0.6,
        top_k: 40,
        top_p: 0.85,
        repeat_penalty: 1.1,
    };

    if (!fetchFn) {
        throw new Error('No fetch implementation available. Install node-fetch or run on Node 18+');
    }

    logger.systemInfo(`Requete Ollama → ${MODEL}`);

    const res = await fetchFn(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, text/plain, application/json' },
        body: JSON.stringify(payload),
        signal,
    });

    if (!res.ok) {
        clearTimeoutIfNeeded();
        const txt = await res.text().catch(() => '');
        const err = new Error(`Ollama HTTP error: ${res.status} ${res.statusText} - ${txt}`);
        err.status = res.status;
        logger.fatal(`Ollama HTTP ${res.status}: ${txt.slice(0, 100)}`, 'services/ollama.js');
        throw err;
    }

    /* --- Lecture du flux de reponse --- */
    const decoder = new TextDecoder();
    let result = '';

    /**
     * Traite un fragment de texte : l'ajoute au resultat,
     * re-arme le timeout et appelle le callback.
     */
    const emitPiece = (textPiece) => {
        if (!textPiece) return;
        result += textPiece;
        armTimeout();
        if (typeof onChunk === 'function') {
            try {
                onChunk(textPiece);
            } catch (e) {
                // Ignore les erreurs du callback
            }
        }
    };

    /**
     * Decoupe un bloc de texte en lignes et extrait
     * le contenu utile de chacune.
     */
    const processChunkText = (chunkText) => {
        const lines = String(chunkText).split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            emitPiece(extractTextPiece(line));
        }
    };

    try {
        if (res.body && typeof res.body.getReader === 'function') {
            /* --- Web Streams (fetch natif Node 18+) --- */
            const reader = res.body.getReader();
            let pending = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                armTimeout();
                pending += decoder.decode(value, { stream: true });

                const lines = pending.split(/\r?\n/);
                pending = lines.pop() || '';
                for (const line of lines) {
                    emitPiece(extractTextPiece(line));
                }
            }

            const tail = pending + decoder.decode();
            if (tail) processChunkText(tail);

        } else if (res.body && typeof res.body.on === 'function') {
            /* --- Node.js Readable stream (node-fetch) --- */
            await new Promise((resolve, reject) => {
                let pending = '';

                const removeListener = (eventName, handler) => {
                    if (typeof res.body.off === 'function') res.body.off(eventName, handler);
                    else if (typeof res.body.removeListener === 'function') res.body.removeListener(eventName, handler);
                };

                const cleanup = () => {
                    removeListener('data', onData);
                    removeListener('end', onEnd);
                    removeListener('error', onError);
                    if (signal) signal.removeEventListener('abort', onAbort);
                };

                const onData = (chunk) => {
                    try {
                        armTimeout();
                        pending += decoder.decode(chunk, { stream: true });
                        const lines = pending.split(/\r?\n/);
                        pending = lines.pop() || '';
                        for (const line of lines) {
                            emitPiece(extractTextPiece(line));
                        }
                    } catch (err) {
                        cleanup();
                        reject(err);
                    }
                };

                const onEnd = () => {
                    try {
                        const tail = pending + decoder.decode();
                        if (tail) processChunkText(tail);
                        cleanup();
                        resolve();
                    } catch (err) {
                        cleanup();
                        reject(err);
                    }
                };

                const onError = (err) => {
                    cleanup();
                    reject(err);
                };

                const onAbort = () => {
                    cleanup();
                    reject(new Error('Ollama request aborted (timeout)'));
                };

                res.body.on('data', onData);
                res.body.on('end', onEnd);
                res.body.on('error', onError);
                if (signal) signal.addEventListener('abort', onAbort, { once: true });
            });

        } else {
            /* --- Fallback : lecture complete du texte --- */
            const txt = await res.text().catch(() => '');
            processChunkText(txt);
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.message === 'AbortError') {
            const e = new Error('Ollama request aborted (timeout)');
            e.cause = err;
            logger.warn('Ollama request timeout', 'services/ollama.js');
            throw e;
        }
        throw err;
    } finally {
        clearTimeoutIfNeeded();
    }

    return result;
}

/**
 * Verifie la disponibilite du serveur Ollama en interrogeant /api/tags.
 *
 * @param {Object} options
 * @param {number} [options.timeoutMs=5000] - Timeout du health check en ms.
 * @returns {Promise<Object>} Objet { ok, url, model, ... } decrivant l'etat.
 */
async function getOllamaHealth({ timeoutMs = 5000 } = {}) {
    if (!fetchFn) {
        return {
            ok: false,
            url: ollamaBaseUrl,
            model: MODEL,
            error: 'No fetch implementation available. Install node-fetch or run on Node 18+',
        };
    }

    const controller = new AbortController();
    const { signal } = controller;
    const parsedTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0;
    let timeoutId;

    if (hasTimeout) {
        timeoutId = setTimeout(() => controller.abort(), parsedTimeout);
    }

    try {
        const res = await fetchFn(`${ollamaBaseUrl}/api/tags`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal,
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            return {
                ok: false,
                url: ollamaBaseUrl,
                model: MODEL,
                error: `HTTP ${res.status} ${res.statusText}`,
                details: txt,
            };
        }

        const data = await res.json().catch(() => ({}));
        const models = Array.isArray(data.models)
            ? data.models.map((entry) => entry.name).filter(Boolean)
            : [];

        return {
            ok: true,
            url: ollamaBaseUrl,
            model: MODEL,
            modelAvailable: models.includes(MODEL),
            models,
        };
    } catch (err) {
        return {
            ok: false,
            url: ollamaBaseUrl,
            model: MODEL,
            error: err.name === 'AbortError' ? 'Health check timeout' : err.message,
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

module.exports = {
    generateOllamaResponse,
    getOllamaHealth,
};
