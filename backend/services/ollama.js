const fs = require('fs');
const path = require('path');

const api_url = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '') + '/api/generate';
const model = process.env.OLLAMA_MODEL || 'phi3:mini';
const systemprompt = fs.readFileSync(path.join(__dirname, '..', 'system_prompt'), 'utf8');

let fetchFn = global.fetch;
if (!fetchFn) {
    try {
        fetchFn = require('node-fetch');
    } catch (e) {
        // fetch may be available at runtime; we'll surface a helpful error later
    }
}

function extractTextPiece(line) {
    let value = String(line || '').trim();
    if (!value) return '';

    if (value.startsWith('data:')) {
        value = value.replace(/^data:\s*/, '');
    }
    if (value === '[DONE]') return '';

    try {
        const parsed = JSON.parse(value);

        // /api/generate (Ollama) format: { response: "...", done: false }
        if (typeof parsed.response === 'string') return parsed.response;

        // /api/chat style responses
        if (parsed.message && typeof parsed.message.content === 'string') return parsed.message.content;

        // Compatibility fallbacks
        if (typeof parsed.output_text === 'string') return parsed.output_text;
        if (typeof parsed.text === 'string') return parsed.text;
        if (parsed?.output && Array.isArray(parsed.output)) {
            const first = parsed.output[0];
            if (first && typeof first.content === 'string') return first.content;
        }

        // Metadata/object chunks (done, durations, etc.) are ignored.
        return '';
    } catch (e) {
        // If it's not JSON, treat it as plain text.
        return value;
    }
}

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

    // Timeout d'inactivite: re-arme a chaque chunk recu.
    armTimeout();

    const payload = {
        model,
        prompt: systemprompt + '\n\n' + prompt,
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

    // Read the response stream and emit chunks via onChunk if provided.
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
        // Support both Web Streams (Node 18+ global fetch) and Node Readable streams (node-fetch)
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
            // Fallback: try to read full text
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

module.exports = { generateOllamaResponse };

