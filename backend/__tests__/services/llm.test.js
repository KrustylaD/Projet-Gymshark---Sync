import { jest } from '@jest/globals';

const ollamaMock = {
    generateOllamaResponse: jest.fn(),
    getOllamaHealth: jest.fn(),
};

const opencodeMock = {
    generateOpenCodeResponse: jest.fn(),
    getOpenCodeHealth: jest.fn(),
};

const loggerMock = {
    systemInfo: jest.fn(),
    warn: jest.fn(),
};

jest.unstable_mockModule('../../services/ollama.js', () => ({
    generateOllamaResponse: ollamaMock.generateOllamaResponse,
    getOllamaHealth: ollamaMock.getOllamaHealth,
}));

jest.unstable_mockModule('../../services/opencode.js', () => ({
    generateOpenCodeResponse: opencodeMock.generateOpenCodeResponse,
    getOpenCodeHealth: opencodeMock.getOpenCodeHealth,
}));

jest.unstable_mockModule('../../logger.js', () => ({
    default: loggerMock,
}));

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.LLM_PROVIDER;
});

describe('LLM provider selector', () => {

    test('doit router vers Ollama par defaut', async () => {
        const { generateResponse, getHealth } = await import('../../services/llm.js');
        ollamaMock.generateOllamaResponse.mockResolvedValue('reponse ollama');
        ollamaMock.getOllamaHealth.mockResolvedValue({ ok: true, provider: 'ollama' });

        const result = await generateResponse('test');
        const health = await getHealth();

        expect(result).toBe('reponse ollama');
        expect(health.provider).toBe('ollama');
        expect(opencodeMock.generateOpenCodeResponse).not.toHaveBeenCalled();
    });

    test('doit router vers OpenCode si LLM_PROVIDER=opencode', async () => {
        process.env.LLM_PROVIDER = 'opencode';
        const { generateResponse, getHealth } = await import('../../services/llm.js');
        opencodeMock.generateOpenCodeResponse.mockResolvedValue('reponse opencode');
        opencodeMock.getOpenCodeHealth.mockResolvedValue({ ok: true, provider: 'opencode' });

        const result = await generateResponse('test');
        const health = await getHealth();

        expect(result).toBe('reponse opencode');
        expect(health.provider).toBe('opencode');
        expect(ollamaMock.generateOllamaResponse).not.toHaveBeenCalled();
    });

    test('doit logger un avertissement pour un fournisseur invalide et utiliser Ollama', async () => {
        process.env.LLM_PROVIDER = 'invalide';
        const { generateResponse } = await import('../../services/llm.js');
        ollamaMock.generateOllamaResponse.mockResolvedValue('reponse ollama');

        const result = await generateResponse('test');

        expect(result).toBe('reponse ollama');
        expect(loggerMock.warn).toHaveBeenCalled();
    });

    test('doit passer les options (onReasoning, onChunk) au fournisseur', async () => {
        process.env.LLM_PROVIDER = 'opencode';
        const { generateResponse } = await import('../../services/llm.js');
        opencodeMock.generateOpenCodeResponse.mockResolvedValue('ok');

        const onReasoning = jest.fn();
        const onChunk = jest.fn();
        await generateResponse('test', { onReasoning, onChunk, timeoutMs: 5000 });

        expect(opencodeMock.generateOpenCodeResponse).toHaveBeenCalledWith(
            'test',
            expect.objectContaining({ onReasoning, onChunk, timeoutMs: 5000 })
        );
    });

});
