const express = require('express');
const { generateOllamaResponse, getOllamaHealth } = require('../services/ollama');
const { getConversation, saveConversation, deleteConversation, listConversations } = require('../services/history');
const logger = require('../logger');

const router = express.Router();

/** Nombre maximum de tours (paires user/assistant) conserves dans le prompt. */
const MAX_HISTORY_TURNS = 8;

/* ============================================================
   FONCTIONS UTILITAIRES
   ============================================================ */

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
    // Le front envoie un message utilisateur et eventuellement un id de conversation existant.
    const { message, conversationId } = req.body || {};
    logger.info(`Message recu: ${(message || '').slice(0, 50)}`);

    // Validation minimale: sans message, impossible de solliciter le modele.
    if (!message) return res.status(400).json({ error: 'Missing message' });

    // Determiner ou creer l'identifiant de conversation
    const convId = typeof conversationId === 'string' && conversationId.trim()
        ? conversationId.trim()
        : `conv_${Date.now()}`;

    // Charger l'historique existant depuis le fichier
    const saved = getConversation(convId);
    const history = saved ? saved.messages : [];
    const prompt = buildPromptFromHistory(trimHistory(history), message);

    // Timeout d'inactivite configurable via variable d'environnement
    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;

    setupSSEHeaders(res);

    // Envoyer l'ID de conversation au client en premier evenement
    res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);
    logger.systemInfo('En attente de reponse Ollama...');

    // `finished` protege contre les doubles terminaisons du flux SSE.
    let finished = false;
    let assistantReply = '';
    let chunkCount = 0;

    try {
        await generateOllamaResponse(prompt, {
            timeoutMs,
            onChunk: (chunk) => {
                try {
                    chunkCount++;
                    if (!chunk) return;
                    assistantReply += chunk;
                    // Echappe les retours a la ligne pour garder un evenement SSE valide.
                    const safe = chunk.replace(/\r?\n/g, '\\n');
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

        // Sauvegarder l'historique complet (user + assistant) sur disque.
        const nextHistory = [
            ...history,
            { role: 'user', content: message },
            { role: 'assistant', content: assistantReply.trim() },
        ];
        saveConversation(convId, nextHistory);

        res.end();
    } catch (err) {
        // En cas d'erreur, on tente d'envoyer un evenement SSE d'erreur coherent.
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
    // Renvoie une vue "liste" pour l'ecran d'historique du front.
    res.json(listConversations());
});

/**
 * GET /api/conversations/:id
 * Retourne une conversation complete (avec messages) par son ID.
 */
router.get('/api/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    // Renvoie toute la conversation, messages inclus.
    res.json(conv);
});

/**
 * DELETE /api/conversations/:id
 * Supprime une conversation par son ID.
 */
router.delete('/api/conversations/:id', (req, res) => {
    const deleted = deleteConversation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    // Signature de reponse volontairement simple pour le front.
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
    // Prompt court pour verifier rapidement la chaine complete de streaming.
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
