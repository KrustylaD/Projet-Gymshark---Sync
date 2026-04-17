import { getSystemPrompt } from '../config/prompt.js';
import logger from '../logger.js';

/* ============================================================
   SERVICE OLLAMA
   Gere la communication avec le serveur Ollama (LLM local).
   Supporte le streaming et le health check.
   ============================================================ */

// URL de base Ollama, configurable via variable d'environnement.
let ollamaBaseUrl = process.env.OLLAMA_URL;
if (ollamaBaseUrl === undefined || ollamaBaseUrl === null || ollamaBaseUrl === '') {
    ollamaBaseUrl = 'http://localhost:11434';
}
ollamaBaseUrl = ollamaBaseUrl.replace(/\/$/, '');

const API_URL = ollamaBaseUrl + '/api/generate';

// Modele LLM a utiliser, configurable via variable d'environnement.
let MODEL = process.env.OLLAMA_MODEL;
if (MODEL === undefined || MODEL === null || MODEL === '') {
    MODEL = 'phi3:mini';
}

// Resolution du fetch : natif Node 18+, sinon node-fetch en fallback.
let fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

async function ensureFetch() {
    if (fetchFn) return fetchFn;

    try {
        const nodeFetch = await import('node-fetch');
        if (nodeFetch && typeof nodeFetch.default === 'function') {
            fetchFn = nodeFetch.default;
            return fetchFn;
        }
    } catch {
        // Ignore dynamic import errors.
    }

    return null;
}

/**
 * Extrait la portion de texte utile d'une ligne brute du stream Ollama.
 * Gere les formats SSE, JSON Ollama /api/generate, /api/chat, et texte brut.
 */
function extractTextPiece(line) {
    let value = String(line === undefined || line === null ? '' : line);
    if (value === '') return '';

    // Supprimer le prefixe SSE "data:" si present.
    if (/^\s*data:\s*/.test(value)) {
        value = value.replace(/^\s*data:\s*/, '');
    }

    if (value.trim() === '[DONE]') return '';

    try {
        const parsed = JSON.parse(value);

        // Format Ollama /api/generate : { response: "...", done: false }
        if (typeof parsed.response === 'string') return parsed.response;

        // Format /api/chat : { message: { content: '...' } }
        if (parsed.message !== undefined && parsed.message !== null && typeof parsed.message.content === 'string') {
            return parsed.message.content;
        }

        // Formats alternatifs de compatibilite.
        if (typeof parsed.output_text === 'string') return parsed.output_text;
        if (typeof parsed.text === 'string') return parsed.text;

        if (parsed.output !== undefined && parsed.output !== null && Array.isArray(parsed.output)) {
            const first = parsed.output[0];
            if (first !== undefined && first !== null && typeof first.content === 'string') {
                return first.content;
            }
        }

        // Metadonnees seules -> rien a extraire.
        return '';
    } catch (e) {
        // Pas du JSON : renvoyer la valeur brute (preserve les espaces).
        return value;
    }
}

/**
 * Cree un AbortController avec un timeout d'inactivite re-armable.
 * Le timer se remet a zero a chaque appel de arm(), implementant un timeout d'inactivite.
 */
function createAbortTimeout(timeoutMs) {
    const controller = new AbortController();
    const parsedTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0;
    let timeoutId;

    const clear = () => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    const arm = () => {
        if (hasTimeout === false) return;
        clear();
        timeoutId = setTimeout(() => controller.abort(), parsedTimeout);
    };

    return {
        controller,
        signal: controller.signal,
        arm,
        clear,
    };
}

/**
 * Construit le payload JSON a envoyer a l'API Ollama /api/generate.
 * Prefixe le system prompt au prompt utilisateur si disponible.
 */
function buildOllamaPayload(prompt) {
    const systemPrompt = getSystemPrompt();

    let fullPrompt = prompt;
    if (systemPrompt !== undefined && systemPrompt !== null && systemPrompt !== '') {
        fullPrompt = systemPrompt + '\n\n' + prompt;
    }

    return {
        model: MODEL,
        prompt: fullPrompt,
        stream: true,
        num_predict: 400,
        temperature: 0.6,
        top_k: 40,
        top_p: 0.85,
        repeat_penalty: 1.1,
    };
}

/**
 * Lit un flux Web Streams API (fetch natif Node 18+).
 * Appelle onLine pour chaque ligne complete recue depuis le stream.
 */
async function readWebStream(body, decoder, timeout, onLine) {
    const reader = body.getReader();
    let pending = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        timeout.arm();

        // Assembler les fragments reseau jusqu'aux separateurs de lignes.
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        const lastLine = lines.pop();
        pending = lastLine !== undefined ? lastLine : '';

        for (const line of lines) {
            onLine(line);
        }
    }

    // Vider les octets restants apres la fin du flux.
    const tail = pending + decoder.decode();
    if (tail !== '') {
        const tailLines = tail.split(/\r?\n/).filter(Boolean);
        for (const line of tailLines) {
            onLine(line);
        }
    }
}

/**
 * Lit un flux node-fetch (Readable stream Node.js via evenements).
 * Appelle onLine pour chaque ligne complete recue.
 * Cette fonction est plus longue car le pattern evenementiel necessite une gestion
 * explicite du cleanup pour eviter les fuites memoire.
 */
async function readNodeStream(body, decoder, timeout, signal, onLine) {
    return new Promise((resolve, reject) => {
        let pending = '';

        // Desabonner tous les listeners pour eviter les fuites memoire.
        const cleanup = () => {
            if (typeof body.off === 'function') {
                body.off('data', onData);
                body.off('end', onEnd);
                body.off('error', onError);
            } else if (typeof body.removeListener === 'function') {
                body.removeListener('data', onData);
                body.removeListener('end', onEnd);
                body.removeListener('error', onError);
            }
            if (signal !== undefined && signal !== null) {
                signal.removeEventListener('abort', onAbort);
            }
        };

        const onData = (chunk) => {
            try {
                timeout.arm();
                pending += decoder.decode(chunk, { stream: true });
                const lines = pending.split(/\r?\n/);
                const lastLine = lines.pop();
                pending = lastLine !== undefined ? lastLine : '';
                for (const line of lines) {
                    onLine(line);
                }
            } catch (err) {
                cleanup();
                reject(err);
            }
        };

        const onEnd = () => {
            try {
                const tail = pending + decoder.decode();
                if (tail !== '') {
                    const tailLines = tail.split(/\r?\n/).filter(Boolean);
                    for (const line of tailLines) {
                        onLine(line);
                    }
                }
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

        body.on('data', onData);
        body.on('end', onEnd);
        body.on('error', onError);
        if (signal !== undefined && signal !== null) {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

/**
 * Envoie un prompt a Ollama en streaming et appelle onChunk pour chaque fragment de texte.
 * Supporte les deux modes de stream : Web Streams API (Node 18+) et node-fetch.
 * Retourne le texte complet assemble une fois le flux termine.
 */
async function generateOllamaResponse(prompt, { onChunk, timeoutMs } = {}) {
    const resolvedFetch = await ensureFetch();
    if (resolvedFetch === undefined || resolvedFetch === null) {
        throw new Error('No fetch implementation available. Install node-fetch or run on Node 18+');
    }

    const timeout = createAbortTimeout(timeoutMs);
    const payload = buildOllamaPayload(prompt);
    timeout.arm();

    logger.systemInfo(`Requete Ollama → ${MODEL}`);

    const res = await resolvedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, text/plain, application/json' },
        body: JSON.stringify(payload),
        signal: timeout.signal,
    });

    if (res.ok === false) {
        timeout.clear();
        const txt = await res.text().catch(() => '');
        const err = new Error(`Ollama HTTP error: ${res.status} ${res.statusText} - ${txt}`);
        err.status = res.status;
        logger.fatal(`Ollama HTTP ${res.status}: ${txt.slice(0, 100)}`, 'services/ollama.js');
        throw err;
    }

    const decoder = new TextDecoder();
    let result = '';

    // Appele pour chaque ligne du flux : extrait le texte, l'accumule et appelle le callback.
    const onLine = (line) => {
        const textPiece = extractTextPiece(line);
        if (textPiece === undefined || textPiece === null || textPiece === '') return;
        result += textPiece;
        timeout.arm();
        if (typeof onChunk === 'function') {
            try {
                onChunk(textPiece);
            } catch (e) {
                // Ignorer les erreurs du callback pour ne pas interrompre le flux.
            }
        }
    };

    try {
        const bodyExists = res.body !== undefined && res.body !== null;

        if (bodyExists && typeof res.body.getReader === 'function') {
            // Branche Web Streams : fetch natif Node 18+.
            await readWebStream(res.body, decoder, timeout, onLine);

        } else if (bodyExists && typeof res.body.on === 'function') {
            // Branche node-fetch : Readable stream Node.js.
            await readNodeStream(res.body, decoder, timeout, timeout.signal, onLine);

        } else {
            // Fallback : lire tout le corps d'un coup.
            const txt = await res.text().catch(() => '');
            const lines = txt.split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                onLine(line);
            }
        }
    } catch (err) {
        // Normaliser les erreurs d'abandon pour que l'appelant les identifie facilement.
        if (err.name === 'AbortError' || err.message === 'AbortError') {
            const abortErr = new Error('Ollama request aborted (timeout)');
            abortErr.cause = err;
            logger.warn('Ollama request timeout', 'services/ollama.js');
            throw abortErr;
        }
        throw err;
    } finally {
        timeout.clear();
    }

    return result;
}

/**
 * Verifie la disponibilite du serveur Ollama en interrogeant /api/tags.
 * Retourne un objet { ok, url, model, ... } decrivant l'etat du serveur.
 */
async function getOllamaHealth({ timeoutMs = 5000 } = {}) {
    const resolvedFetch = await ensureFetch();
    if (resolvedFetch === undefined || resolvedFetch === null) {
        return {
            ok: false,
            url: ollamaBaseUrl,
            model: MODEL,
            error: 'No fetch implementation available. Install node-fetch or run on Node 18+',
        };
    }

    const timeout = createAbortTimeout(timeoutMs);
    timeout.arm();

    try {
        const res = await resolvedFetch(`${ollamaBaseUrl}/api/tags`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: timeout.signal,
        });

        if (res.ok === false) {
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

        // Extraire la liste des noms de modeles disponibles sur ce serveur Ollama.
        const models = [];
        if (Array.isArray(data.models)) {
            for (const entry of data.models) {
                if (entry.name !== undefined && entry.name !== null && entry.name !== '') {
                    models.push(entry.name);
                }
            }
        }

        return {
            ok: true,
            url: ollamaBaseUrl,
            model: MODEL,
            // Permet au front de detecter un modele absent sur ce serveur Ollama.
            modelAvailable: models.includes(MODEL),
            models,
        };
    } catch (err) {
        let errorMessage = err.message;
        if (err.name === 'AbortError') {
            errorMessage = 'Health check timeout';
        }
        return {
            ok: false,
            url: ollamaBaseUrl,
            model: MODEL,
            error: errorMessage,
        };
    } finally {
        timeout.clear();
    }
}

export {
    generateOllamaResponse,
    getOllamaHealth,
};
