// Les jest.mock() sont hisses avant tous les require : les services
// seront deja mockes quand le router sera charge.
jest.mock('../../services/ollama');
jest.mock('../../services/history');
jest.mock('../../logger', () => ({
    info: jest.fn(),
    systemInfo: jest.fn(),
    fatal: jest.fn(),
    warn: jest.fn(),
}));

const http = require('http');
const express = require('express');
const chatRouter = require('../../routes/chat');
const { generateOllamaResponse, getOllamaHealth } = require('../../services/ollama');
const { getConversation, saveConversation, deleteConversation, listConversations } = require('../../services/history');

// -------------------------------------------------------------------
// Serveur de test : demarre une vraie instance Express sur un port
// aleatoire pour tester les routes en conditions reelles.
// -------------------------------------------------------------------
let server;
let baseUrl;

beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use(chatRouter);
    server = http.createServer(app);
    // Port 0 = OS choisit un port libre automatiquement.
    server.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        done();
    });
});

afterAll((done) => {
    server.close(done);
});

beforeEach(() => {
    jest.clearAllMocks();

    // Valeurs par defaut des mocks de services pour chaque test.
    getConversation.mockReturnValue(null);
    saveConversation.mockImplementation(() => {});
    listConversations.mockReturnValue([]);
    deleteConversation.mockReturnValue(true);

    // generateOllamaResponse appelle onChunk avec un fragment, puis se termine.
    generateOllamaResponse.mockImplementation(async (prompt, options = {}) => {
        if (typeof options.onChunk === 'function') {
            options.onChunk('Reponse test');
        }
        return 'Reponse test';
    });

    getOllamaHealth.mockResolvedValue({
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
        getConversation.mockReturnValue({ id: 'mon_id', messages: [] });

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
        generateOllamaResponse.mockRejectedValue(new Error('LLM indisponible'));

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
        listConversations.mockReturnValue([
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
        getConversation.mockReturnValue(null);

        const response = await fetch(`${baseUrl}/api/conversations/inexistant`);

        expect(response.status).toBe(404);
        await response.json();
    });

    test('doit retourner la conversation si elle existe', async () => {
        const conversation = { id: 'conv_1', title: 'Test', messages: [] };
        getConversation.mockReturnValue(conversation);

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
        deleteConversation.mockReturnValue(false);

        const response = await fetch(`${baseUrl}/api/conversations/inexistant`, { method: 'DELETE' });

        expect(response.status).toBe(404);
        await response.json();
    });

    test('doit retourner { ok: true } si la suppression reussit', async () => {
        deleteConversation.mockReturnValue(true);

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
        getOllamaHealth.mockResolvedValue({ ok: true, url: 'http://localhost:11434', model: 'phi3:mini' });

        const response = await fetch(`${baseUrl}/api/llm/health`);

        expect(response.status).toBe(200);
        await response.json();
    });

    test('doit retourner 503 si Ollama est indisponible', async () => {
        getOllamaHealth.mockResolvedValue({ ok: false, error: 'Connection refused' });

        const response = await fetch(`${baseUrl}/api/llm/health`);

        expect(response.status).toBe(503);
        await response.json();
    });

});
