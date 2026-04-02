const { getSystemPrompt } = require('../config/prompt');

const ollamaBaseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const api_url = ollamaBaseUrl + '/api/generate';
const model = process.env.OLLAMA_MODEL || 'phi3:mini';

// Préférer le fetch global si disponible (Node 18+). Sinon utiliser node-fetch si installé.
let fetchFn = global.fetch;
if (!fetchFn) {
    try {
        fetchFn = require('node-fetch');
    } catch (e) {
        // fetch peut être disponible à l'exécution; on lèvera une erreur utile plus tard si absent
    }
}

// extractTextPiece(line): à partir d'une ligne brute reçue (SSE/JSON/texte brut),
// extraire la portion de texte lisible par l'humain.
// Conserve les espaces significatifs (n'enlève pas les espaces entre mots).
function extractTextPiece(line) {
    let value = String(line || '');
    if (value === '') return '';

    // Supprime un éventuel préfixe SSE "data:" tout en préservant les autres espaces
    if (/^\s*data:\s*/.test(value)) {
        value = value.replace(/^\s*data:\s*/, '');
    }
    // Considère un "[DONE]" comme marqueur de fin de flux
    if (value.trim() === '[DONE]') return '';

    try {
        const parsed = JSON.parse(value);

        // Format courant d'Ollama /api/generate: { response: "...", done: false }
        if (typeof parsed.response === 'string') return parsed.response;

        // Certains endpoints envoient { message: { content: '...' } }
        if (parsed.message && typeof parsed.message.content === 'string') return parsed.message.content;

        // Raccourcis de compatibilité
        if (typeof parsed.output_text === 'string') return parsed.output_text;
        if (typeof parsed.text === 'string') return parsed.text;
        if (parsed?.output && Array.isArray(parsed.output)) {
            const first = parsed.output[0];
            if (first && typeof first.content === 'string') return first.content;
        }

        // Métadonnées seules -> ignorer
        return '';
    } catch (e) {
        // Pas du JSON -> renvoyer la valeur brute (préserve les espaces)
        return value;
    }
}

/**
 * generateOllamaResponse(prompt, { onChunk, timeoutMs })
 * - Envoie une requête en streaming vers /api/generate d'Ollama et appelle `onChunk(text)`
 *   pour chaque fragment textuel reçu.
 * - `timeoutMs` est traité comme un timeout d'inactivité ré-armé à chaque fragment.
 * - Retourne le texte assemblé une fois le flux terminé.
 */
async function generateOllamaResponse(prompt, { onChunk, timeoutMs } = {}) {
    const controller = new AbortController();
    const signal = controller.signal;

    const parsedTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0;
    let timeoutId;
    const armTimeout = () => {
        if (!hasTimeout) return;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), parsedTimeout);
    };
    const clearTimeoutIfNeeded = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    // Timeout d'inactivité : armer maintenant et ré-armer à chaque fragment reçu
    armTimeout();

    const systemPrompt = getSystemPrompt();
    const payload = {
        model,
        prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        stream: true,
    };

    if (!fetchFn) {
        throw new Error('No fetch implementation available. Install node-fetch or run on Node 18+');
    }

    const res = await fetchFn(api_url, {
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
        throw err;
    }

    // Lit le flux de réponse et émet les fragments via onChunk si fourni.
    const decoder = new TextDecoder();
    let result = '';

    const emitPiece = (textPiece) => {
        if (!textPiece) return;
        result += textPiece;
        armTimeout();
        if (typeof onChunk === 'function') {
            try {
                onChunk(textPiece);
            } catch (e) {
                // ignore callback errors
            }
        }
    };

    const processChunkText = (chunkText) => {
        const lines = String(chunkText).split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            emitPiece(extractTextPiece(line));
        }
    };

    try {
        // Prend en charge à la fois les Web Streams (fetch global Node 18+) et
        // les streams lisibles Node classiques (ex. node-fetch)
        if (res.body && typeof res.body.getReader === 'function') {
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
            // Repli : lire le texte complet si le flux n'est pas disponible
            const txt = await res.text().catch(() => '');
            processChunkText(txt);
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.message === 'AbortError') {
            const e = new Error('Ollama request aborted (timeout)');
            e.cause = err;
            throw e;
        }
        throw err;
    } finally {
        clearTimeoutIfNeeded();
    }

    return result;
}

/**
 * getOllamaHealth(): lightweight health check for Ollama server.
 * Attempts to GET /api/tags and returns a small object describing availability.
 */
async function getOllamaHealth({ timeoutMs = 5000 } = {}) {
    if (!fetchFn) {
        return {
            ok: false,
            url: ollamaBaseUrl,
            model,
            error: 'No fetch implementation available. Install node-fetch or run on Node 18+',
        };
    }

    const controller = new AbortController();
    const signal = controller.signal;
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
                model,
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
            model,
            modelAvailable: models.includes(model),
            models,
        };
    } catch (err) {
        return {
            ok: false,
            url: ollamaBaseUrl,
            model,
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

