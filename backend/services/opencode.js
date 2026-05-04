import { getSystemPrompt } from '../config/prompt.js';
import logger from '../logger.js';

let apiUrl = process.env.OPENCODE_API_URL;
if (!apiUrl) apiUrl = 'https://opencode.ai/zen/go/v1';
apiUrl = apiUrl.replace(/\/+$/, '');

const CHAT_URL = apiUrl + '/chat/completions';
const MODELS_URL = apiUrl + '/models';

let MODEL = process.env.OPENCODE_MODEL;
if (!MODEL) MODEL = 'deepseek-v4-flash';

let API_KEY = process.env.OPENCODE_API_KEY || '';

let MAX_TOKENS = Number(process.env.OPENCODE_MAX_TOKENS);
if (!Number.isFinite(MAX_TOKENS) || MAX_TOKENS < 1) MAX_TOKENS = 4096;

let TEMPERATURE = Number(process.env.OPENCODE_TEMPERATURE);
if (!Number.isFinite(TEMPERATURE)) TEMPERATURE = 0.6;

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
        // Dynamic import fallback — node-fetch may not be installed.
    }
    return null;
}

function createAbortTimeout(timeoutMs) {
    const controller = new AbortController();
    const parsedTimeout = Number(timeoutMs);
    const hasTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0;
    let timeoutId;

    const clear = () => {
        if (timeoutId != null) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    };

    const arm = () => {
        if (!hasTimeout) return;
        clear();
        timeoutId = setTimeout(() => controller.abort(), parsedTimeout);
    };

    return { controller, signal: controller.signal, arm, clear };
}

async function readWebStream(body, decoder, timeout, onLine) {
    const reader = body.getReader();
    let pending = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        timeout.arm();

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        const lastLine = lines.pop();
        pending = lastLine ?? '';

        for (const line of lines) {
            onLine(line);
        }
    }

    const tail = pending + decoder.decode();
    if (tail !== '') {
        const tailLines = tail.split(/\r?\n/).filter(Boolean);
        for (const line of tailLines) {
            onLine(line);
        }
    }
}

async function readNodeStream(body, decoder, timeout, signal, onLine) {
    return new Promise((resolve, reject) => {
        let pending = '';

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
            if (signal != null) {
                signal.removeEventListener('abort', onAbort);
            }
        };

        const onData = (chunk) => {
            try {
                timeout.arm();
                pending += decoder.decode(chunk, { stream: true });
                const lines = pending.split(/\r?\n/);
                const lastLine = lines.pop();
                pending = lastLine ?? '';
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
            reject(new Error('OpenCode request aborted (timeout)'));
        };

        body.on('data', onData);
        body.on('end', onEnd);
        body.on('error', onError);
        if (signal != null) {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

export async function generateOpenCodeResponse(prompt, { onChunk, onReasoning, timeoutMs } = {}) {
    const resolvedFetch = await ensureFetch();
    if (resolvedFetch == null) {
        throw new Error('No fetch implementation available. Install node-fetch or run on Node 18+');
    }

    if (!API_KEY) {
        throw new Error('OPENCODE_API_KEY is not configured. Set it in your .env file.');
    }

    const timeout = createAbortTimeout(timeoutMs);
    timeout.arm();

    const systemPrompt = getSystemPrompt();
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
        model: MODEL,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
    };

    logger.systemInfo(`Requete OpenCode → ${MODEL}`);

    const res = await resolvedFetch(CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, text/plain, application/json',
            Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
    });

    if (res.ok === false) {
        timeout.clear();
        const txt = await res.text().catch(() => '');
        const err = new Error(`OpenCode API error: ${res.status} ${res.statusText} - ${txt}`);
        err.status = res.status;
        logger.fatal(`OpenCode HTTP ${res.status}: ${txt.slice(0, 100)}`, 'services/opencode.js');
        throw err;
    }

    const decoder = new TextDecoder();
    let result = '';
    let reasoningBuf = '';
    let hasSeenContent = false;

    const onLine = (line) => {
        let value = String(line ?? '');
        if (/^\s*data:\s*/.test(value)) value = value.replace(/^\s*data:\s*/, '');
        if (!value || value.trim() === '[DONE]') return;

        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed.choices)) {
                const delta = parsed.choices[0] && parsed.choices[0].delta;
                if (!delta) return;

                if (typeof delta.content === 'string') {
                    hasSeenContent = true;
                    result += delta.content;
                    timeout.arm();
                    if (typeof onChunk === 'function') {
                        try { onChunk(delta.content); } catch {
                            // Callback errors should not interrupt the stream.
                        }
                    }
                    return;
                }

                if (typeof delta.reasoning_content === 'string' && !hasSeenContent) {
                    if (!reasoningBuf && typeof onReasoning === 'function') {
                        try { onReasoning(); } catch {
                            // Callback errors should not interrupt the stream.
                        }
                    }
                    reasoningBuf += delta.reasoning_content;
                    timeout.arm();
                    return;
                }
            }
        } catch {
            // Ignore unparseable SSE lines (whitespace, comments, etc.).
        }
    };

    try {
        const hasBody = res.body != null;

        if (hasBody && typeof res.body.getReader === 'function') {
            await readWebStream(res.body, decoder, timeout, onLine);
        } else if (hasBody && typeof res.body.on === 'function') {
            await readNodeStream(res.body, decoder, timeout, timeout.signal, onLine);
        } else {
            const txt = await res.text().catch(() => '');
            const lines = txt.split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                onLine(line);
            }
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.message === 'AbortError') {
            const abortErr = new Error('OpenCode request aborted (timeout)');
            abortErr.cause = err;
            logger.warn('OpenCode request timeout', 'services/opencode.js');
            throw abortErr;
        }
        throw err;
    } finally {
        timeout.clear();
    }

    if (!hasSeenContent && reasoningBuf) {
        result = reasoningBuf;
        if (typeof onChunk === 'function') {
            try { onChunk(result); } catch {
                // Callback errors should not interrupt the stream.
            }
        }
    }

    return result;
}

const HEALTH_TIMEOUT_MS = 5000;

export async function getOpenCodeHealth({ timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
    const resolvedFetch = await ensureFetch();
    if (resolvedFetch == null) {
        return {
            ok: false,
            url: CHAT_URL,
            model: MODEL,
            error: 'No fetch implementation available. Install node-fetch or run on Node 18+',
        };
    }

    if (!API_KEY) {
        return {
            ok: false,
            url: CHAT_URL,
            model: MODEL,
            error: 'OPENCODE_API_KEY is not configured',
        };
    }

    const timeout = createAbortTimeout(timeoutMs);
    timeout.arm();

    try {
        const res = await resolvedFetch(MODELS_URL, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${API_KEY}`,
            },
            signal: timeout.signal,
        });

        if (res.ok === false) {
            const txt = await res.text().catch(() => '');
            return {
                ok: false,
                url: CHAT_URL,
                model: MODEL,
                error: `HTTP ${res.status} ${res.statusText}`,
                details: txt,
            };
        }

        const data = await res.json().catch(() => ({}));

        const models = [];
        if (Array.isArray(data.data)) {
            for (const entry of data.data) {
                if (entry.id) models.push(entry.id);
            }
        }

        return {
            ok: true,
            url: CHAT_URL,
            model: MODEL,
            modelAvailable: models.includes(MODEL),
            models,
            provider: 'opencode',
        };
    } catch (err) {
        let errorMessage = err.message;
        if (err.name === 'AbortError') {
            errorMessage = 'Health check timeout';
        }
        return {
            ok: false,
            url: CHAT_URL,
            model: MODEL,
            error: errorMessage,
        };
    } finally {
        timeout.clear();
    }
}
