const express = require('express');
const { generateOllamaResponse, getOllamaHealth } = require('../services/ollama');
const { getConversation, saveConversation, deleteConversation, listConversations } = require('../services/history');
const logger = require('../logger');

const router = express.Router();

// Nombre maximum de tours (paires user/assistant) conserves dans le prompt.
const MAX_HISTORY_TURNS = 8;

/* ============================================================
   FONCTIONS UTILITAIRES
   ============================================================ */

/**
 * Construit le prompt envoye au LLM en concatenant l'historique et le message utilisateur.
 */
function buildPromptFromHistory(history, userMessage) {
    const lines = [];

    for (const entry of history) {
        if (entry === undefined || entry === null || entry.content === undefined) continue;
        const speaker = entry.role === 'assistant' ? 'Assistant' : 'Utilisateur';
        lines.push(`${speaker}: ${entry.content}`);
    }

    lines.push(`Utilisateur: ${userMessage}`);
    lines.push('Assistant:');
    return lines.join('\n');
}

/**
 * Tronque l'historique pour ne garder que les N derniers tours.
 */
function trimHistory(history) {
    const maxMessages = MAX_HISTORY_TURNS * 2;
    if (history.length <= maxMessages) return history;
    return history.slice(history.length - maxMessages);
}

/**
 * Configure les headers SSE (Server-Sent Events) sur la reponse.
 */
function setupSSEHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();
}

/**
 * Determine l'identifiant de conversation a utiliser.
 * Utilise celui recu du client s'il est valide, sinon en genere un nouveau.
 */
function resolveConversationId(conversationId) {
    if (typeof conversationId === 'string' && conversationId.trim() !== '') {
        return conversationId.trim();
    }
    return `conv_${Date.now()}`;
}

/**
 * Charge l'historique complet d'une conversation depuis le fichier.
 * Retourne un tableau vide si la conversation n'existe pas encore.
 */
function loadConversationHistory(convId) {
    const saved = getConversation(convId);
    if (saved === undefined || saved === null) {
        return [];
    }
    return saved.messages;
}

/**
 * Ajoute le message utilisateur et la reponse assistant a l'historique, puis sauvegarde.
 */
function saveUpdatedHistory(convId, history, userMessage, assistantReply) {
    const nextHistory = history.slice();
    nextHistory.push({ role: 'user', content: userMessage });
    nextHistory.push({ role: 'assistant', content: assistantReply.trim() });
    saveConversation(convId, nextHistory);
}

/* ============================================================
   ROUTES API
   ============================================================ */

/**
 * POST /api/chat
 * Recoit { message, conversationId } et streame la reponse du LLM via SSE.
 */
router.post('/api/chat', async (req, res) => {
    // Extraire le corps de la requete en securite.
    const body = req.body;
    let message;
    let conversationId;
    if (body !== undefined && body !== null) {
        message = body.message;
        conversationId = body.conversationId;
    }

    // Construire un apercu du message pour les logs (sans exposer le contenu complet).
    let messagePreview = '';
    if (message !== undefined && message !== null) {
        messagePreview = String(message).slice(0, 50);
    }
    logger.info(`Message recu: ${messagePreview}`);

    // Sans message, impossible de solliciter le modele.
    if (message === undefined || message === null || message === '') {
        return res.status(400).json({ error: 'Missing message' });
    }

    const convId = resolveConversationId(conversationId);
    const history = loadConversationHistory(convId);
    const trimmedHistory = trimHistory(history);
    const prompt = buildPromptFromHistory(trimmedHistory, message);

    // Timeout d'inactivite configurable via variable d'environnement.
    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    let timeoutMs;
    if (Number.isFinite(envTimeout) && envTimeout > 0) {
        timeoutMs = envTimeout;
    }

    setupSSEHeaders(res);

    // Envoyer l'identifiant de conversation au client en premier evenement.
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
                    if (chunk === undefined || chunk === null || chunk === '') return;
                    assistantReply += chunk;
                    // Echapper les retours a la ligne pour garder un evenement SSE valide.
                    const safe = chunk.replace(/\r?\n/g, '\\n');
                    res.write(`data: ${safe}\n\n`);
                } catch (e) {
                    logger.warn(`Erreur chunk: ${e.message}`, 'routes/chat.js');
                }
            },
        });

        logger.systemInfo(`Reponse Ollama recue, chunks: ${chunkCount}`);

        if (finished === false) {
            res.write('data: [DONE]\n\n');
            finished = true;
        }

        // Sauvegarder l'echange complet (user + assistant) dans l'historique.
        saveUpdatedHistory(convId, history, message, assistantReply);
        res.end();

    } catch (err) {
        logger.fatal(`Error in /api/chat: ${err.message || err}`, 'routes/chat.js');

        if (finished === false) {
            let errorMessage = 'LLM error';
            if (err !== undefined && err !== null && err.message !== undefined && err.message !== '') {
                errorMessage = err.message;
            }
            res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
            finished = true;
        }

        try {
            res.end();
        } catch (e) {
            // noop : res.end() peut echouer si la connexion est deja fermee.
        }
    }
});

/**
 * GET /api/conversations
 * Retourne la liste de toutes les conversations sans leurs messages,
 * triees par date de mise a jour decroissante.
 */
router.get('/api/conversations', (req, res) => {
    res.json(listConversations());
});

/**
 * GET /api/conversations/:id
 * Retourne une conversation complete (avec messages) par son identifiant.
 */
router.get('/api/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (conv === undefined || conv === null) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json(conv);
});

/**
 * DELETE /api/conversations/:id
 * Supprime une conversation par son identifiant.
 */
router.delete('/api/conversations/:id', (req, res) => {
    const deleted = deleteConversation(req.params.id);
    if (deleted === false) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true });
});

/**
 * GET /api/llm/health
 * Health check du serveur Ollama. Retourne 200 si OK, 503 sinon.
 */
router.get('/api/llm/health', async (req, res) => {
    const health = await getOllamaHealth({ timeoutMs: 5000 });

    if (health.ok === false) {
        let healthError = 'unknown';
        if (health.error !== undefined && health.error !== null && health.error !== '') {
            healthError = health.error;
        }
        logger.warn(`Ollama health check failed: ${healthError}`, 'routes/chat.js');
        return res.status(503).json(health);
    }

    logger.systemInfo('Ollama health check OK');
    return res.status(200).json(health);
});

/**
 * GET /api/test-stream
 * Route de test pour verifier que le streaming SSE fonctionne avec un prompt simple.
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
