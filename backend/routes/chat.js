const express = require('express');
const { generateOllamaResponse, getOllamaHealth } = require('../services/ollama');
const { getConversation, saveConversation, deleteConversation, listConversations } = require('../services/history');

const router = express.Router();

const MAX_HISTORY_TURNS = 8;

/**
 * normalizeChunk(chunk): extrait le texte utile d'un fragment reçu depuis Ollama.
 */
function normalizeChunk(chunk) {
    let value = String(chunk || '');
    if (value === '') return '';
    if (/^\s*data:\s*/.test(value)) value = value.replace(/^\s*data:\s*/, '');
    if (value.trim() === '[DONE]') return '';

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

/**
 * buildPromptFromHistory(history, userMessage): construit le prompt envoyé
 * au LLM en concaténant l'historique des tours et le message utilisateur.
 */
function buildPromptFromHistory(history, userMessage) {
    const lines = [];

    for (const entry of history) {
        if (!entry || !entry.content) continue;
        const speaker = entry.role === 'assistant' ? 'Assistant' : 'Utilisateur';
        lines.push(`${speaker}: ${entry.content}`);
    }

    lines.push(`Utilisateur: ${userMessage}`);
    lines.push('Assistant:');
    return lines.join('\n');
}

function trimHistory(history) {
    const maxMessages = MAX_HISTORY_TURNS * 2;
    if (history.length <= maxMessages) return history;
    return history.slice(history.length - maxMessages);
}

// Route principale de chat: reçoit `{ message, conversationId }` et stream la réponse SSE
router.post('/api/chat', async (req, res) => {
    const { message, conversationId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const convId = typeof conversationId === 'string' && conversationId.trim()
        ? conversationId.trim()
        : `conv_${Date.now()}`;

    // Charger l'historique depuis le fichier
    const saved = getConversation(convId);
    const history = saved ? saved.messages : [];
    const prompt = buildPromptFromHistory(trimHistory(history), message);

    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    // Envoyer l'ID de conversation au client
    res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);

    let finished = false;
    let assistantReply = '';

    try {
        await generateOllamaResponse(prompt, {
            timeoutMs,
            onChunk: (chunk) => {
                try {
                    const normalized = normalizeChunk(chunk);
                    if (!normalized) return;
                    assistantReply += normalized;
                    const safe = normalized.replace(/\r?\n/g, '\\n');
                    res.write(`data: ${safe}\n\n`);
                } catch (e) {
                    // ignorer les erreurs d'écriture vers la socket
                }
            },
        });

        if (!finished) {
            res.write('data: [DONE]\n\n');
            finished = true;
        }

        // Sauvegarder l'historique complet sur disque
        const nextHistory = [
            ...history,
            { role: 'user', content: message },
            { role: 'assistant', content: assistantReply.trim() },
        ];
        saveConversation(convId, nextHistory);

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

// Lister toutes les conversations
router.get('/api/conversations', (req, res) => {
    res.json(listConversations());
});

// Récupérer une conversation par ID
router.get('/api/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
});

// Supprimer une conversation
router.delete('/api/conversations/:id', (req, res) => {
    const deleted = deleteConversation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

// Route de health check du LLM
router.get('/api/llm/health', async (req, res) => {
    const health = await getOllamaHealth({ timeoutMs: 5000 });
    if (!health.ok) {
        return res.status(503).json(health);
    }
    return res.status(200).json(health);
});

module.exports = router;
