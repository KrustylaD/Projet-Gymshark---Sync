// Mock fs avant tout require pour intercepter les appels disque.
jest.mock('fs');

// Mock le logger pour eviter le bruit dans la sortie des tests.
jest.mock('../../logger', () => ({
    warn: jest.fn(),
}));

// -------------------------------------------------------------------
// Utilitaire : re-require les modules apres un resetModules.
// Necessaire car cachedPrompt et cachedPromptMtimeMs sont des variables
// module-level : resetModules() est le seul moyen de les reinitialiser.
// -------------------------------------------------------------------
function freshRequire() {
    const fs = require('fs');
    const { getSystemPrompt } = require('../../config/prompt');
    return { fs, getSystemPrompt };
}

describe('getSystemPrompt', () => {

    beforeEach(() => {
        // Remet le registre de modules a zero pour reinitialiser le cache interne.
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('doit retourner le contenu du fichier system_prompt quand il est lisible', () => {
        const { fs, getSystemPrompt } = freshRequire();

        // Simuler un fichier avec une date de modification et un contenu.
        fs.statSync.mockReturnValue({ mtimeMs: 1000 });
        fs.readFileSync.mockReturnValue('  Tu es SYNC  ');

        const result = getSystemPrompt();

        // Le contenu doit etre retourne sans les espaces en debut/fin (trim).
        expect(result).toBe('Tu es SYNC');
    });

    test('doit retourner une chaine vide si le fichier est absent', () => {
        const { fs, getSystemPrompt } = freshRequire();

        // Simuler une erreur de lecture (fichier introuvable).
        fs.statSync.mockImplementation(() => {
            throw new Error('ENOENT: no such file or directory');
        });

        const result = getSystemPrompt();

        // En cas d'erreur, le fallback est une chaine vide.
        expect(result).toBe('');
    });

    test('doit utiliser le cache si le fichier n\'a pas change', () => {
        const { fs, getSystemPrompt } = freshRequire();

        fs.statSync.mockReturnValue({ mtimeMs: 1000 });
        fs.readFileSync.mockReturnValue('Contenu du prompt');

        // Premier appel : lit le fichier.
        getSystemPrompt();
        // Deuxieme appel : le mtime est identique, le cache doit etre utilise.
        getSystemPrompt();

        // readFileSync ne doit avoir ete appele qu'une seule fois.
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    test('doit recharger le fichier si la date de modification a change', () => {
        const { fs, getSystemPrompt } = freshRequire();

        // Premier appel : mtime = 1000, contenu = "Version 1".
        fs.statSync.mockReturnValueOnce({ mtimeMs: 1000 });
        fs.readFileSync.mockReturnValueOnce('Version 1');

        // Deuxieme appel : mtime = 2000 (fichier modifie sur disque).
        fs.statSync.mockReturnValueOnce({ mtimeMs: 2000 });
        fs.readFileSync.mockReturnValueOnce('Version 2');

        const premierResultat = getSystemPrompt();
        const deuxiemeResultat = getSystemPrompt();

        // Les deux appels doivent retourner des contenus differents.
        expect(premierResultat).toBe('Version 1');
        expect(deuxiemeResultat).toBe('Version 2');
        // readFileSync doit avoir ete appele deux fois (une par version).
        expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

});
