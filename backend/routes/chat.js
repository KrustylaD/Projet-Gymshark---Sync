const express = require('express');
const { generateOllamaResponse, getOllamaHealth } = require('../services/ollama');
const {
    getConversation,
    saveConversation,
    replaceConversationMessages,
    renameConversation,
    deleteConversation,
    listConversations,
} = require('../services/history');
const logger = require('../logger');

const router = express.Router();

/** Nombre maximum de tours (paires user/assistant) conserves dans le prompt. */
const MAX_HISTORY_TURNS = 8;

/* ============================================================
   FONCTIONS UTILITAIRES
   ============================================================ */

/**
 * Normalise un fragment brut recu depuis Ollama en extrayant
 * uniquement la partie texte lisible.
 *
 * @param {*} chunk - Fragment brut (string, Buffer, JSON...).
 * @returns {string} Texte extrait, ou chaine vide.
 */
function normalizeChunk(chunk) {
    let value = String(chunk || '');
    if (value === '') return '';

    // Supprime le prefixe SSE "data:" eventuel
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
 * Construit le prompt envoye au LLM en concatenant l'historique
 * des tours precedents et le nouveau message utilisateur.
 *
 * @param {Array}  history     - Messages precedents { role, content }.
 * @param {string} userMessage - Dernier message de l'utilisateur.
 * @returns {string} Prompt formate.
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

/**
 * Tronque l'historique pour ne garder que les N derniers tours.
 *
 * @param {Array} history - Historique complet des messages.
 * @returns {Array} Historique tronque.
 */
function trimHistory(history) {
    const maxMessages = MAX_HISTORY_TURNS * 2;
    if (history.length <= maxMessages) return history;
    return history.slice(history.length - maxMessages);
}

/**
 * Configure les headers SSE (Server-Sent Events) sur la reponse.
 *
 * @param {import('express').Response} res - Objet reponse Express.
 */
function setupSSEHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();
}

/* ============================================================
   ROUTES API
   ============================================================ */

/**
 * POST /api/chat
 * Route principale de chat. Recoit { message, conversationId }
 * et streame la reponse du LLM via SSE.
 */
router.post('/api/chat', async (req, res) => {
    const { message, conversationId } = req.body || {};
    const messageText = typeof message === 'string' ? message.trim() : '';
    logger.info(`Message recu: ${messageText.slice(0, 50)}`);

    if (!messageText) return res.status(400).json({ error: 'Missing message' });

    // Determiner ou creer l'identifiant de conversation
    const convId = typeof conversationId === 'string' && conversationId.trim()
        ? conversationId.trim()
        : `conv_${Date.now()}`;

    // Charger l'historique existant depuis le fichier
    const saved = getConversation(convId);
    const history = saved ? saved.messages : [];
    const prompt = buildPromptFromHistory(trimHistory(history), messageText);

    // Timeout d'inactivite configurable via variable d'environnement
    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;

    setupSSEHeaders(res);

    // Envoyer l'ID de conversation au client en premier evenement
    res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);
    logger.systemInfo('En attente de reponse Ollama...');

    let finished = false;
    let assistantReply = '';
    let chunkCount = 0;

    try {
        await generateOllamaResponse(prompt, {
            timeoutMs,
            onChunk: (chunk) => {
                try {
                    chunkCount++;
                    const normalized = normalizeChunk(chunk);
                    if (!normalized) return;
                    assistantReply += normalized;
                    // Echappe les retours a la ligne pour le format SSE
                    const safe = normalized.replace(/\r?\n/g, '\\n');
                    res.write(`data: ${safe}\n\n`);
                } catch (e) {
                    logger.warn(`Erreur chunk: ${e.message}`, 'routes/chat.js');
                }
            },
        });
        logger.systemInfo(`Reponse Ollama recue, chunks: ${chunkCount}`);

        if (!finished) {
            res.write('data: [DONE]\n\n');
            finished = true;
        }

        // Sauvegarder l'historique complet sur disque
        const nextHistory = [
            ...history,
            { role: 'user', content: messageText },
            { role: 'assistant', content: assistantReply.trim() },
        ];
        saveConversation(convId, nextHistory);

        res.end();
    } catch (err) {
        logger.fatal(`Error in /api/chat: ${err.message || err}`, 'routes/chat.js');
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

/**
 * GET /api/conversations
 * Retourne la liste de toutes les conversations (sans les messages),
 * triees par date de mise a jour decroissante.
 */
router.get('/api/conversations', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = req.query.limit;
    res.json(listConversations({ query, limit }));
});

/**
 * GET /api/conversations/:id
 * Retourne une conversation complete (avec messages) par son ID.
 */
router.get('/api/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
});

/**
 * PATCH /api/conversations/:id
 * Met a jour les metadonnees d'une conversation (actuellement: titre).
 */
router.patch('/api/conversations/:id', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    if (!title.trim()) {
        return res.status(400).json({ error: 'Missing title' });
    }

    const updated = renameConversation(req.params.id, title);
    if (!updated) {
        return res.status(404).json({ error: 'Not found' });
    }

    return res.json(updated);
});

/**
 * PUT /api/conversations/:id/messages
 * Remplace completement les messages d'une conversation.
 * Utilise lors d'une edition/regeneration cote frontend.
 */
router.put('/api/conversations/:id/messages', (req, res) => {
    const payloadMessages = req.body?.messages;
    const payloadTitle = req.body?.title;

    if (!Array.isArray(payloadMessages)) {
        return res.status(400).json({ error: 'Missing messages array' });
    }

    try {
        const updated = replaceConversationMessages(req.params.id, payloadMessages, payloadTitle);
        return res.json(updated);
    } catch (err) {
        logger.warn(`Sync messages failed: ${err.message}`, 'routes/chat.js');
        return res.status(400).json({ error: err.message || 'Invalid payload' });
    }
});

/**
 * DELETE /api/conversations/:id
 * Supprime une conversation par son ID.
 */
router.delete('/api/conversations/:id', (req, res) => {
    const deleted = deleteConversation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

/**
 * GET /api/llm/health
 * Health check du serveur Ollama. Retourne 200 si OK, 503 sinon.
 */
router.get('/api/llm/health', async (req, res) => {
    const health = await getOllamaHealth({ timeoutMs: 5000 });
    if (!health.ok) {
        logger.warn(`Ollama health check failed: ${health.error || 'unknown'}`, 'routes/chat.js');
        return res.status(503).json(health);
    }
    logger.systemInfo('Ollama health check OK');
    return res.status(200).json(health);
});

/**
 * GET /api/test-stream
 * Route de test pour verifier que le streaming SSE fonctionne
 * avec un prompt simple.
 */
router.get('/api/test-stream', async (req, res) => {
    logger.systemInfo('Debut du test streaming');
    setupSSEHeaders(res);

    let chunkCount = 0;
    const prompt = "Say hello in 5 words";

    try {
        await generateOllamaResponse(prompt, {
            timeoutMs: 15000,
            onChunk: (chunk) => {
                chunkCount++;
                res.write(`data: ${chunk}\n\n`);
            },
        });
        logger.systemInfo(`Streaming complete, totalChunks: ${chunkCount}`);
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        logger.fatal(`Test streaming error: ${err.message}`, 'routes/chat.js');
        res.write(`data: ERROR: ${err.message}\n\n`);
        res.end();
    }
});

module.exports = router;
