import { jest } from '@jest/globals';

const fsPromisesMock = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
};

const fsMock = {
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
};

const loggerMock = {
    dbSuccess: jest.fn(),
    dbError: jest.fn(),
    dbConnection: jest.fn(),
};

jest.unstable_mockModule('fs/promises', () => ({
    default: fsPromisesMock,
}));

jest.unstable_mockModule('fs', () => fsMock);

jest.unstable_mockModule('../../logger.js', () => ({
    default: loggerMock,
}));

async function freshImport() {
    jest.resetModules();
    return import('../../services/history.js');
}

// -------------------------------------------------------------------
// Utilitaires pour simplifier la mise en place des tests
// -------------------------------------------------------------------

// Simule un fichier conversations.json avec le contenu fourni.
function mockFileWith(data) {
    fsMock.existsSync.mockReturnValue(true);
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify(data));
}

// Simule un fichier conversations.json vide (aucune conversation).
function mockEmptyFile() {
    fsMock.existsSync.mockReturnValue(true);
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({}));
}

// Recupere l'objet JSON ecrit lors du dernier appel a writeFile.
function getWrittenData() {
    const lastCall = fsPromisesMock.writeFile.mock.calls[0];
    return JSON.parse(lastCall[1]);
}

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
});

// ===================================================================
// getConversation
// ===================================================================

describe('getConversation', () => {

    test('doit retourner null si la conversation n\'existe pas', async () => {
        mockFileWith({ conv_autre: { id: 'conv_autre', messages: [] } });
        const { getConversation } = await freshImport();

        const result = await getConversation('conv_inexistante');

        expect(result).toBeNull();
    });

    test('doit retourner la conversation si elle existe', async () => {
        const conversation = {
            id: 'conv_1',
            title: 'Mon titre',
            messages: [{ role: 'user', content: 'Bonjour' }],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
        };
        mockFileWith({ conv_1: conversation });
        const { getConversation } = await freshImport();

        const result = await getConversation('conv_1');

        expect(result).toEqual(conversation);
    });

});

// ===================================================================
// saveConversation
// ===================================================================

describe('saveConversation', () => {

    test('doit creer une conversation avec un titre genere depuis le premier message user', async () => {
        mockEmptyFile();
        const { saveConversation } = await freshImport();

        const messages = [
            { role: 'user', content: 'Comment aller mieux ?' },
            { role: 'assistant', content: 'Voici mes conseils.' },
        ];
        await saveConversation('conv_1', messages);

        const written = getWrittenData();
        expect(written['conv_1'].title).toBe('Comment aller mieux ?');
    });

    test('doit tronquer le titre a 60 caracteres si le premier message est trop long', async () => {
        mockEmptyFile();
        const { saveConversation } = await freshImport();

        const messageLong = 'A'.repeat(80);
        const messages = [{ role: 'user', content: messageLong }];
        await saveConversation('conv_1', messages);

        const written = getWrittenData();
        const titre = written['conv_1'].title;

        expect(titre.length).toBe(60);
        expect(titre.endsWith('...')).toBe(true);
    });

    test('doit utiliser "Nouvelle conversation" si aucun message utilisateur n\'est present', async () => {
        mockEmptyFile();
        const { saveConversation } = await freshImport();

        const messages = [{ role: 'assistant', content: 'Je suis pret.' }];
        await saveConversation('conv_1', messages);

        const written = getWrittenData();
        expect(written['conv_1'].title).toBe('Nouvelle conversation');
    });

    test('doit conserver la date de creation d\'origine lors d\'une mise a jour', async () => {
        const dateCreation = '2024-01-01T10:00:00.000Z';
        const existante = {
            id: 'conv_1',
            title: 'Ancien titre',
            messages: [],
            createdAt: dateCreation,
            updatedAt: dateCreation,
        };
        mockFileWith({ conv_1: existante });
        const { saveConversation } = await freshImport();

        const nouveauxMessages = [{ role: 'user', content: 'Nouveau message' }];
        await saveConversation('conv_1', nouveauxMessages);

        const written = getWrittenData();
        expect(written['conv_1'].createdAt).toBe(dateCreation);
    });

    test('doit utiliser le titre explicite fourni en parametre', async () => {
        mockEmptyFile();
        const { saveConversation } = await freshImport();

        const messages = [{ role: 'user', content: 'Message ignore pour le titre' }];
        await saveConversation('conv_1', messages, 'Titre personnalise');

        const written = getWrittenData();
        expect(written['conv_1'].title).toBe('Titre personnalise');
    });

});

// ===================================================================
// deleteConversation
// ===================================================================

describe('deleteConversation', () => {

    test('doit retourner false si la conversation n\'existe pas', async () => {
        mockFileWith({ conv_autre: { id: 'conv_autre' } });
        const { deleteConversation } = await freshImport();

        const result = await deleteConversation('conv_inexistante');

        expect(result).toBe(false);
    });

    test('doit supprimer la conversation et retourner true si elle existe', async () => {
        mockFileWith({
            conv_1: { id: 'conv_1', title: 'A supprimer', messages: [] },
        });
        const { deleteConversation } = await freshImport();

        const result = await deleteConversation('conv_1');

        expect(result).toBe(true);

        const written = getWrittenData();
        expect(written['conv_1']).toBeUndefined();
    });

});

// ===================================================================
// listConversations
// ===================================================================

describe('listConversations', () => {

    test('doit retourner un tableau vide s\'il n\'y a aucune conversation', async () => {
        mockEmptyFile();
        const { listConversations } = await freshImport();

        const result = await listConversations();

        expect(result).toEqual([]);
    });

    test('doit retourner les conversations SANS le champ messages', async () => {
        mockFileWith({
            conv_1: {
                id: 'conv_1',
                title: 'Test',
                messages: [{ role: 'user', content: 'Ceci ne doit pas apparaitre' }],
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            },
        });
        const { listConversations } = await freshImport();

        const result = await listConversations();

        expect(result[0].messages).toBeUndefined();
        expect(result[0].id).toBe('conv_1');
        expect(result[0].title).toBe('Test');
    });

    test('doit trier les conversations de la plus recente a la plus ancienne', async () => {
        mockFileWith({
            conv_ancienne: {
                id: 'conv_ancienne',
                title: 'Ancienne',
                messages: [],
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            },
            conv_recente: {
                id: 'conv_recente',
                title: 'Recente',
                messages: [],
                createdAt: '2024-06-01T00:00:00.000Z',
                updatedAt: '2024-06-01T00:00:00.000Z',
            },
        });
        const { listConversations } = await freshImport();

        const result = await listConversations();

        expect(result[0].id).toBe('conv_recente');
        expect(result[1].id).toBe('conv_ancienne');
    });

});
