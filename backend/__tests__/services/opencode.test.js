import { jest } from '@jest/globals';

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

jest.unstable_mockModule('../../config/prompt.js', () => ({
    getSystemPrompt: promptMock.getSystemPrompt,
    SYSTEM_PROMPT_PATH: promptMock.SYSTEM_PROMPT_PATH,
}));

jest.unstable_mockModule('../../logger.js', () => ({
    default: loggerMock,
}));

async function freshImport() {
    jest.resetModules();
    globalThis.fetch = fetchMock;
    const mod = await import('../../services/opencode.js');
    return mod;
}

function mockOpenCodeStreamResponse(chunks) {
    const lines = chunks.map(c => `data: ${JSON.stringify(c)}`).join('\n') + '\ndata: [DONE]\n';
    fetchMock.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: jest.fn().mockResolvedValue(lines),
    });
}

function mockOpenCodeErrorResponse(status) {
    fetchMock.mockResolvedValueOnce({
        ok: false,
        status,
        statusText: 'Error',
        text: jest.fn().mockResolvedValue(''),
    });
}

function mockOpenCodeModelsResponse(models) {
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: models.map(id => ({ id })) }),
    });
}

beforeEach(() => {
    jest.resetModules();
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    promptMock.getSystemPrompt.mockReturnValue('');
    jest.clearAllMocks();
    delete process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_MODEL;
    delete process.env.OPENCODE_API_URL;
});

describe('generateOpenCodeResponse', () => {

    test('doit lancer une erreur si OPENCODE_API_KEY est absent', async () => {
        const { generateOpenCodeResponse } = await freshImport();

        await expect(generateOpenCodeResponse('test')).rejects.toThrow('OPENCODE_API_KEY is not configured');
    });

    test('doit retourner le texte assemble a partir des chunks OpenAI SSE', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { generateOpenCodeResponse } = await freshImport();

        mockOpenCodeStreamResponse([
            { id: '1', object: 'chat.completion.chunk', choices: [{ delta: { content: 'Bonjour' }, index: 0 }] },
            { id: '2', object: 'chat.completion.chunk', choices: [{ delta: { content: ' monde' }, index: 0 }] },
            { id: '3', object: 'chat.completion.chunk', choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] },
        ]);

        const result = await generateOpenCodeResponse('Dis bonjour');

        expect(result).toBe('Bonjour monde');
    });

    test('doit appeler onChunk pour chaque fragment de texte', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { generateOpenCodeResponse } = await freshImport();

        mockOpenCodeStreamResponse([
            { id: '1', object: 'chat.completion.chunk', choices: [{ delta: { content: 'Premier' }, index: 0 }] },
            { id: '2', object: 'chat.completion.chunk', choices: [{ delta: { content: 'Deuxieme' }, index: 0 }] },
            { id: '3', object: 'chat.completion.chunk', choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] },
        ]);

        const onChunk = jest.fn();
        await generateOpenCodeResponse('test', { onChunk });

        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk).toHaveBeenNthCalledWith(1, 'Premier');
        expect(onChunk).toHaveBeenNthCalledWith(2, 'Deuxieme');
    });

    test('doit lancer une erreur si l API repond avec HTTP 500', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { generateOpenCodeResponse } = await freshImport();

        mockOpenCodeErrorResponse(500);

        await expect(generateOpenCodeResponse('test')).rejects.toThrow('OpenCode API error');
    });

    test('doit bufferiser reasoning_content et ne l emettre qu a la fin si content est absent', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { generateOpenCodeResponse } = await freshImport();

        const lines = [
            'data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":null,"reasoning_content":"Pensee"},"finish_reason":null}]}',
            'data: {"id":"2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":null,"reasoning_content":" profonde"},"finish_reason":null}]}',
            'data: [DONE]',
        ].join('\n');
        fetchMock.mockResolvedValueOnce({
            ok: true,
            body: null,
            text: jest.fn().mockResolvedValue(lines),
        });

        const onChunk = jest.fn();
        const result = await generateOpenCodeResponse('test', { onChunk });

        expect(result).toBe('Pensee profonde');
        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onChunk).toHaveBeenCalledWith('Pensee profonde');
    });

    test('doit appeler onReasoning au premier reasoning_content', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { generateOpenCodeResponse } = await freshImport();

        const lines = [
            'data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":null,"reasoning_content":"Pensee"},"finish_reason":null}]}',
            'data: {"id":"2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Reponse"},"finish_reason":null}]}',
            'data: [DONE]',
        ].join('\n');
        fetchMock.mockResolvedValueOnce({
            ok: true,
            body: null,
            text: jest.fn().mockResolvedValue(lines),
        });

        const onReasoning = jest.fn();
        await generateOpenCodeResponse('test', { onReasoning });

        expect(onReasoning).toHaveBeenCalledTimes(1);
    });

    test('doit envoyer les bons headers d authentification', async () => {
        process.env.OPENCODE_API_KEY = 'sk-secret-123';
        const { generateOpenCodeResponse } = await freshImport();

        mockOpenCodeStreamResponse([
            { id: '1', object: 'chat.completion.chunk', choices: [{ delta: { content: 'Hello' }, index: 0 }] },
        ]);

        await generateOpenCodeResponse('test');

        const callArgs = fetchMock.mock.calls[0];
        expect(callArgs[1].headers.Authorization).toBe('Bearer sk-secret-123');
    });

});

describe('getOpenCodeHealth', () => {

    test('doit retourner ok: false si OPENCODE_API_KEY est absent', async () => {
        const { getOpenCodeHealth } = await freshImport();

        const result = await getOpenCodeHealth();

        expect(result.ok).toBe(false);
        expect(result.error).toContain('OPENCODE_API_KEY');
    });

    test('doit retourner ok: true avec la liste des modeles', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { getOpenCodeHealth } = await freshImport();

        mockOpenCodeModelsResponse(['deepseek-v4-flash', 'kimi-k2.6']);

        const result = await getOpenCodeHealth();

        expect(result.ok).toBe(true);
        expect(result.models).toContain('deepseek-v4-flash');
        expect(result.provider).toBe('opencode');
    });

    test('doit retourner ok: false si l API repond avec une erreur', async () => {
        process.env.OPENCODE_API_KEY = 'sk-test-key';
        const { getOpenCodeHealth } = await freshImport();

        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: jest.fn().mockResolvedValue('Invalid API key'),
        });

        const result = await getOpenCodeHealth();

        expect(result.ok).toBe(false);
        expect(result.error).toContain('401');
    });

});
