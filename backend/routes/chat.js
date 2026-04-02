const express = require('express');
const { generateOllamaResponse } = require('../services/ollama');

const router = express.Router();

function normalizeChunk(chunk) {
    let value = String(chunk || '').trim();
    if (!value) return '';
    if (value.startsWith('data:')) value = value.replace(/^data:\s*/, '');
    if (value === '[DONE]') return '';

    try {
        const parsed = JSON.parse(value);
        if (typeof parsed.response === 'string') return parsed.response;
        if (parsed.message && typeof parsed.message.content === 'string') return parsed.message.content;
        if (typeof parsed.output_text === 'string') return parsed.output_text;
        if (typeof parsed.text === 'string') return parsed.text;
        return '';
    } catch (e) {
        return value;
    }
}

router.post('/api/chat', async (req, res) => {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;

    // Use Server-Sent Events to stream chunks to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    let finished = false;

    try {
        await generateOllamaResponse(message, {
            timeoutMs,
            onChunk: (chunk) => {
                // Send each chunk as an SSE data event
                try {
                    const normalized = normalizeChunk(chunk);
                    if (!normalized) return;
                    // Sanitize CRLF to avoid breaking SSE framing
                    const safe = normalized.replace(/\r?\n/g, '\\n');
                    res.write(`data: ${safe}\n\n`);
                } catch (e) {
                    // ignore write errors
                }
            },
        });

        // signal end of stream
        if (!finished) {
            res.write('data: [DONE]\n\n');
            finished = true;
        }
        res.end();
    } catch (err) {
        console.error('Error in /api/chat:', err);
        if (!finished) {
            const msg = err && err.message ? err.message : 'LLM error';
            res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
            finished = true;
        }
        try {
            res.end();
        } catch (e) {
            // noop
        }
    }
});

module.exports = router;