const express = require('express');
const { generateOllamaResponse, getOllamaHealth } = require('../services/ollama');

const router = express.Router();

// Stockage en mémoire des historiques de session (clé: sessionId -> tableau de messages)
const sessionHistories = new Map();
const MAX_HISTORY_TURNS = 8;

/**
 * normalizeChunk(chunk): extrait le texte utile d'un fragment reçu depuis Ollama.
 * Gère les formats SSE (préfixe "data:"), JSON contenant des champs connus,
 * ou du texte brut. Retourne une chaîne (ou vide si le fragment ne contient
 * pas de contenu textuel utile).
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

// Raccourcit l'historique pour ne garder que les derniers tours pertinents
function trimHistory(history) {
    const maxMessages = MAX_HISTORY_TURNS * 2;
    if (history.length <= maxMessages) return history;
    return history.slice(history.length - maxMessages);
}

// Route principale de chat: reçoit `{ message, sessionId }` et stream la réponse SSE
router.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const sessionKey = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : 'default';
    const history = sessionHistories.get(sessionKey) || [];
    const prompt = buildPromptFromHistory(history, message);

    const envTimeout = Number(process.env.OLLAMA_TIMEOUT);
    const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;

    // Utilise Server-Sent Events (SSE) pour envoyer les fragments au client en continu
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    let finished = false;
    let assistantReply = '';

    try {
        await generateOllamaResponse(prompt, {
            timeoutMs,
            onChunk: (chunk) => {
                // Pour chaque fragment reçu, on normalise puis on l'envoie au client
                try {
                    const normalized = normalizeChunk(chunk);
                    if (!normalized) return;
                    assistantReply += normalized;
                    // Échapper les retours à la ligne pour ne pas casser l'encadrement SSE
                    const safe = normalized.replace(/\r?\n/g, '\\n');
                    res.write(`data: ${safe}\n\n`);
                } catch (e) {
                    // ignorer les erreurs d'écriture vers la socket
                }
            },
        });

        // Marque la fin du stream SSE
        if (!finished) {
            res.write('data: [DONE]\n\n');
            finished = true;
        }

        // Aide dev : envoie la réponse complète en une ligne (facile à retirer pour prod)
        res.write(`data: [FULL_REPLY] ${assistantReply.replace(/\r?\n/g, ' ')}\n\n`);

        const nextHistory = trimHistory([
            ...history,
            { role: 'user', content: message },
            { role: 'assistant', content: assistantReply.trim() },
        ]);
        sessionHistories.set(sessionKey, nextHistory);

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

// Route de health check du LLM (vérifie la disponibilité d'Ollama)
router.get('/api/llm/health', async (req, res) => {
    const health = await getOllamaHealth({ timeoutMs: 5000 });
    if (!health.ok) {
        return res.status(503).json(health);
    }
    return res.status(200).json(health);
});

module.exports = router;