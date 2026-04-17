import swaggerJsdoc from 'swagger-jsdoc';

const swaggerDefinition = {
    openapi: '3.0.3',
    info: {
        title: 'Gymshark Sync API',
        version: '1.0.0',
        description: 'API REST et SSE du backend Gymshark Sync.',
    },
    tags: [
        { name: 'Chat', description: 'Chat en streaming SSE avec Ollama' },
        { name: 'Conversations', description: 'Gestion des conversations stockees' },
        { name: 'Health', description: 'Etat du serveur Ollama' },
    ],
    components: {
        schemas: {
            ChatRequest: {
                type: 'object',
                required: ['message'],
                properties: {
                    message: { type: 'string', example: 'Resumer cette reunion en 5 points.' },
                    conversationId: { type: 'string', example: 'conv_1776418481108' },
                },
            },
            ConversationSummary: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            ConversationMessage: {
                type: 'object',
                properties: {
                    role: {
                        type: 'string',
                        enum: ['user', 'assistant'],
                    },
                    content: { type: 'string' },
                },
            },
            Conversation: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                    messages: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ConversationMessage' },
                    },
                },
            },
            ErrorResponse: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                },
            },
            OllamaHealth: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean' },
                    url: { type: 'string' },
                    model: { type: 'string' },
                    modelAvailable: { type: 'boolean' },
                    models: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    error: { type: 'string' },
                    details: { type: 'string' },
                },
            },
        },
    },
    paths: {
        '/api/chat': {
            post: {
                tags: ['Chat'],
                summary: 'Lance une reponse chat en streaming SSE',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ChatRequest' },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Flux SSE de la reponse du modele',
                        content: {
                            'text/event-stream': {
                                schema: {
                                    type: 'string',
                                    example: 'data: {"type":"meta","conversationId":"conv_123"}\\n\\ndata: Bonjour\\n\\ndata: [DONE]\\n\\n',
                                },
                            },
                        },
                    },
                    400: {
                        description: 'Message manquant',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/conversations': {
            get: {
                tags: ['Conversations'],
                summary: 'Liste les conversations',
                responses: {
                    200: {
                        description: 'Liste des conversations',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ConversationSummary' },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/conversations/{id}': {
            get: {
                tags: ['Conversations'],
                summary: 'Recupere une conversation par ID',
                parameters: [
                    {
                        in: 'path',
                        name: 'id',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    200: {
                        description: 'Conversation complete',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Conversation' },
                            },
                        },
                    },
                    404: {
                        description: 'Conversation introuvable',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
            delete: {
                tags: ['Conversations'],
                summary: 'Supprime une conversation par ID',
                parameters: [
                    {
                        in: 'path',
                        name: 'id',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    200: {
                        description: 'Suppression reussie',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        ok: { type: 'boolean', example: true },
                                    },
                                },
                            },
                        },
                    },
                    404: {
                        description: 'Conversation introuvable',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/llm/health': {
            get: {
                tags: ['Health'],
                summary: 'Etat du serveur Ollama',
                responses: {
                    200: {
                        description: 'Ollama disponible',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/OllamaHealth' },
                            },
                        },
                    },
                    503: {
                        description: 'Ollama indisponible',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/OllamaHealth' },
                            },
                        },
                    },
                },
            },
        },
        '/api/test-stream': {
            get: {
                tags: ['Chat'],
                summary: 'Route de test du streaming SSE',
                responses: {
                    200: {
                        description: 'Flux SSE de test',
                        content: {
                            'text/event-stream': {
                                schema: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

const swaggerOptions = {
    definition: swaggerDefinition,
    apis: [],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export {
    swaggerSpec,
};