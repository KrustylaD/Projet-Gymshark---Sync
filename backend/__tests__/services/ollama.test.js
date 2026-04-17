import { jest } from '@jest/globals';

// fetchFn est capture au chargement du module (fetchFn = global.fetch).
// On doit donc remplacer global.fetch PAR UN MOCK avant le premier import.
const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

const promptMock = {
    getSystemPrompt: jest.fn().mockReturnValue(''),
    SYSTEM_PROMPT_PATH: '/mock/system_prompt',
};

const loggerMock = {
    systemInfo: jest.fn(),
    fatal: jest.fn(),
    warn: jest.fn(),
};

// Mock config/prompt pour eviter la lecture du fichier system_prompt sur disque.
jest.unstable_mockModule('../../config/prompt.js', () => ({
    getSystemPrompt: promptMock.getSystemPrompt,
    SYSTEM_PROMPT_PATH: promptMock.SYSTEM_PROMPT_PATH,
}));

// Mock le logger pour eviter le bruit dans la sortie des tests.
jest.unstable_mockModule('../../logger.js', () => ({
    default: loggerMock,
}));

async function freshImport() {
    jest.resetModules();
    globalThis.fetch = fetchMock;
    return import('../../services/ollama.js');
}

// -------------------------------------------------------------------
// Utilitaires pour simuler les reponses Ollama
// -------------------------------------------------------------------

// Simule une reponse HTTP de streaming (chemin fallback : body = null).
// Ollama repond avec des lignes JSON, une par fragment de texte.
function mockOllamaStreamResponse(lignesJSON) {
    const texte = lignesJSON.join('\n');
    fetchMock.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: jest.fn().mockResolvedValue(texte),
    });
}

// Simule une reponse HTTP d'erreur d'Ollama.
function mockOllamaErrorResponse(status) {
    fetchMock.mockResolvedValueOnce({
        ok: false,
        status: status,
        statusText: 'Error',
        text: jest.fn().mockResolvedValue(''),
    });
}

// Simule la reponse du endpoint /api/tags (health check Ollama).
function mockOllamaTagsResponse(modeles) {
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ models: modeles }),
    });
}

beforeEach(() => {
    jest.resetModules();
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    promptMock.getSystemPrompt.mockReturnValue('');
    jest.clearAllMocks();
});

// ===================================================================
// generateOllamaResponse
// ===================================================================

describe('generateOllamaResponse', () => {

    test('doit lancer une erreur si Ollama repond avec un status HTTP 500', async () => {
        const { generateOllamaResponse } = await freshImport();
        mockOllamaErrorResponse(500);

        await expect(generateOllamaResponse('test')).rejects.toThrow('Ollama HTTP error');
    });

    test('doit retourner le texte assemble a partir des chunks JSON', async () => {
        const { generateOllamaResponse } = await freshImport();
        // Simuler deux fragments de texte puis un marqueur de fin.
        mockOllamaStreamResponse([
            '{"response":"Bonjour","done":false}',
            '{"response":" monde","done":false}',
            '{"response":"","done":true}',
        ]);

        const result = await generateOllamaResponse('Dis bonjour');

        expect(result).toBe('Bonjour monde');
    });

    test('doit appeler onChunk pour chaque fragment de texte recu', async () => {
        const { generateOllamaResponse } = await freshImport();
        mockOllamaStreamResponse([
            '{"response":"Premier","done":false}',
            '{"response":"Deuxieme","done":false}',
        ]);

        const onChunk = jest.fn();
        await generateOllamaResponse('test', { onChunk });

        // onChunk doit avoir ete appele une fois par fragment non vide.
        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk).toHaveBeenNthCalledWith(1, 'Premier');
        expect(onChunk).toHaveBeenNthCalledWith(2, 'Deuxieme');
    });

    test('doit gerer les lignes avec prefixe "data:" (format SSE)', async () => {
        const { generateOllamaResponse } = await freshImport();
        // Certaines implementations envoient les lignes prefixees par "data:".
        mockOllamaStreamResponse([
            'data: {"response":"Hello","done":false}',
        ]);

        const result = await generateOllamaResponse('test');

        expect(result).toBe('Hello');
    });

    test('doit ignorer les lignes [DONE]', async () => {
        const { generateOllamaResponse } = await freshImport();
        mockOllamaStreamResponse([
            '{"response":"Texte","done":false}',
            '[DONE]',
        ]);

        const result = await generateOllamaResponse('test');

        // [DONE] ne doit pas etre inclus dans le resultat final.
        expect(result).toBe('Texte');
        expect(result).not.toContain('[DONE]');
    });

});

// ===================================================================
// getOllamaHealth
// ===================================================================

describe('getOllamaHealth', () => {

    test('doit retourner ok: true avec la liste des modeles si Ollama est disponible', async () => {
        const { getOllamaHealth } = await freshImport();
        mockOllamaTagsResponse([
            { name: 'phi3:mini' },
            { name: 'llama2' },
        ]);

        const result = await getOllamaHealth();

        expect(result.ok).toBe(true);
        expect(result.models).toContain('phi3:mini');
        expect(result.models).toContain('llama2');
    });

    test('doit retourner ok: false si Ollama repond avec une erreur HTTP', async () => {
        const { getOllamaHealth } = await freshImport();
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: jest.fn().mockResolvedValue(''),
        });

        const result = await getOllamaHealth();

        expect(result.ok).toBe(false);
        expect(result.error).toContain('503');
    });

    test('doit indiquer modelAvailable: true si le modele configure est dans la liste', async () => {
        const { getOllamaHealth } = await freshImport();
        // Le modele par defaut est "phi3:mini" quand OLLAMA_MODEL n'est pas defini.
        mockOllamaTagsResponse([{ name: 'phi3:mini' }]);

        const result = await getOllamaHealth();

        expect(result.modelAvailable).toBe(true);
    });

    test('doit indiquer modelAvailable: false si le modele configure est absent', async () => {
        const { getOllamaHealth } = await freshImport();
        // La liste des modeles ne contient pas "phi3:mini".
        mockOllamaTagsResponse([{ name: 'llama2' }, { name: 'mistral' }]);

        const result = await getOllamaHealth();

        expect(result.modelAvailable).toBe(false);
    });

});
