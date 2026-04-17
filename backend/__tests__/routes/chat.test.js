import { jest } from '@jest/globals';
import http from 'http';
import express from 'express';

const ollamaMock = {
    generateOllamaResponse: jest.fn(),
    getOllamaHealth: jest.fn(),
};

const historyMock = {
    getConversation: jest.fn(),
    saveConversation: jest.fn(),
    deleteConversation: jest.fn(),
    listConversations: jest.fn(),
};

const loggerMock = {
    info: jest.fn(),
    systemInfo: jest.fn(),
    fatal: jest.fn(),
    warn: jest.fn(),
};

// Les mocks sont definis avant l'import du routeur pour qu'ils soient appliques.
jest.unstable_mockModule('../../services/ollama.js', () => ({
    generateOllamaResponse: ollamaMock.generateOllamaResponse,
    getOllamaHealth: ollamaMock.getOllamaHealth,
}));

jest.unstable_mockModule('../../services/history.js', () => ({
    getConversation: historyMock.getConversation,
    saveConversation: historyMock.saveConversation,
    deleteConversation: historyMock.deleteConversation,
    listConversations: historyMock.listConversations,
}));

jest.unstable_mockModule('../../logger.js', () => ({
    default: loggerMock,
}));

// -------------------------------------------------------------------
// Serveur de test : demarre une vraie instance Express sur un port
// aleatoire pour tester les routes en conditions reelles.
// -------------------------------------------------------------------
let server;
let baseUrl;

beforeAll(async () => {
    const { default: chatRouter } = await import('../../routes/chat.js');

    const app = express();
    app.use(express.json());
    app.use(chatRouter);
    await new Promise((resolve) => {
        server = http.createServer(app);
        // Port 0 = OS choisit un port libre automatiquement.
        server.listen(0, () => {
            baseUrl = `http://localhost:${server.address().port}`;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise((resolve) => {
        server.close(() => resolve());
    });
});

beforeEach(() => {
    jest.clearAllMocks();

    // Valeurs par defaut des mocks de services pour chaque test.
    historyMock.getConversation.mockReturnValue(null);
    historyMock.saveConversation.mockImplementation(() => { });
    historyMock.listConversations.mockReturnValue([]);
    historyMock.deleteConversation.mockReturnValue(true);

    // generateOllamaResponse appelle onChunk avec un fragment, puis se termine.
    ollamaMock.generateOllamaResponse.mockImplementation(async (prompt, options = {}) => {
        if (typeof options.onChunk === 'function') {
            options.onChunk('Reponse test');
        }
        return 'Reponse test';
    });

    ollamaMock.getOllamaHealth.mockResolvedValue({
        ok: true,
        url: 'http://localhost:11434',
        model: 'phi3:mini',
    });
});

// -------------------------------------------------------------------
// Utilitaires pour les tests SSE
// -------------------------------------------------------------------

// Envoie une requete POST /api/chat et retourne la reponse.
function postChat(body) {
    return fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// Extrait le conversationId depuis le premier evenement meta SSE.
function extractConversationId(sseText) {
    const lignes = sseText.split('\n');
    for (const ligne of lignes) {
        const estMeta = ligne.startsWith('data: ') && ligne.includes('"type":"meta"');
        if (estMeta) {
            const json = JSON.parse(ligne.slice(6));
            return json.conversationId;
        }
    }
    return null;
}

// ===================================================================
// POST /api/chat
// ===================================================================

describe('POST /api/chat', () => {

    test('doit retourner 400 si le champ message est absent', async () => {
        const response = await postChat({});

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Missing message');
    });

    test('doit retourner 400 si message est une chaine vide', async () => {
        const response = await postChat({ message: '' });

        expect(response.status).toBe(400);
        await response.text();
    });

    test('doit envoyer les headers SSE corrects', async () => {
        const response = await postChat({ message: 'Bonjour' });

        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('cache-control')).toBe('no-cache');
        await response.text();
    });

    test('doit envoyer un evenement meta avec un ID de conversation genere', async () => {
        const response = await postChat({ message: 'Bonjour' });
        const text = await response.text();
        const convId = extractConversationId(text);

        // Un ID genere automatiquement commence toujours par "conv_".
        expect(convId).toMatch(/^conv_\d+$/);
    });

    test('doit utiliser l\'ID de conversation fourni par le client', async () => {
        historyMock.getConversation.mockReturnValue({ id: 'mon_id', messages: [] });

        const response = await postChat({ message: 'Bonjour', conversationId: 'mon_id' });
        const text = await response.text();
        const convId = extractConversationId(text);

        expect(convId).toBe('mon_id');
    });

    test('doit envoyer [DONE] a la fin du stream', async () => {
        const response = await postChat({ message: 'Bonjour' });
        const text = await response.text();

        expect(text).toContain('data: [DONE]');
    });

    test('doit envoyer un evenement error SSE si le LLM echoue', async () => {
        ollamaMock.generateOllamaResponse.mockRejectedValue(new Error('LLM indisponible'));

        const response = await postChat({ message: 'Bonjour' });
        const text = await response.text();

        expect(text).toContain('event: error');
        expect(text).toContain('LLM indisponible');
    });

});

// ===================================================================
// GET /api/conversations
// ===================================================================

describe('GET /api/conversations', () => {

    test('doit retourner la liste des conversations', async () => {
        historyMock.listConversations.mockReturnValue([
            { id: 'conv_1', title: 'Discussion 1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ]);

        const response = await fetch(`${baseUrl}/api/conversations`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe('conv_1');
    });

});

// ===================================================================
// GET /api/conversations/:id
// ===================================================================

describe('GET /api/conversations/:id', () => {

    test('doit retourner 404 si la conversation n\'existe pas', async () => {
        historyMock.getConversation.mockReturnValue(null);

        const response = await fetch(`${baseUrl}/api/conversations/inexistant`);

        expect(response.status).toBe(404);
        await response.json();
    });

    test('doit retourner la conversation si elle existe', async () => {
        const conversation = { id: 'conv_1', title: 'Test', messages: [] };
        historyMock.getConversation.mockReturnValue(conversation);

        const response = await fetch(`${baseUrl}/api/conversations/conv_1`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.id).toBe('conv_1');
    });

});

// ===================================================================
// DELETE /api/conversations/:id
// ===================================================================

describe('DELETE /api/conversations/:id', () => {

    test('doit retourner 404 si la conversation n\'existe pas', async () => {
        historyMock.deleteConversation.mockReturnValue(false);

        const response = await fetch(`${baseUrl}/api/conversations/inexistant`, { method: 'DELETE' });

        expect(response.status).toBe(404);
        await response.json();
    });

    test('doit retourner { ok: true } si la suppression reussit', async () => {
        historyMock.deleteConversation.mockReturnValue(true);

        const response = await fetch(`${baseUrl}/api/conversations/conv_1`, { method: 'DELETE' });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.ok).toBe(true);
    });

});

// ===================================================================
// GET /api/llm/health
// ===================================================================

describe('GET /api/llm/health', () => {

    test('doit retourner 200 si Ollama est disponible', async () => {
        ollamaMock.getOllamaHealth.mockResolvedValue({ ok: true, url: 'http://localhost:11434', model: 'phi3:mini' });

        const response = await fetch(`${baseUrl}/api/llm/health`);

        expect(response.status).toBe(200);
        await response.json();
    });

    test('doit retourner 503 si Ollama est indisponible', async () => {
        ollamaMock.getOllamaHealth.mockResolvedValue({ ok: false, error: 'Connection refused' });

        const response = await fetch(`${baseUrl}/api/llm/health`);

        expect(response.status).toBe(503);
        await response.json();
    });

});
