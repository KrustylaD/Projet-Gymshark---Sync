import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import logger from './logger.js';
import chatRoutes from './routes/chat.js';
import { swaggerSpec } from './config/swagger.js';

/* ============================================================
   POINT D'ENTREE DU SERVEUR EXPRESS
   Charge la configuration, applique les middlewares globaux,
   monte les routes API puis demarre l'ecoute HTTP.
   ============================================================ */

const app = express();

// Port configurable via variable d'environnement, 3000 par defaut.
const parsedPort = Number(process.env.PORT);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

// Ordre des middlewares important : CORS → JSON parser → logger HTTP.
app.use(cors());
app.use(express.json());
app.use(logger.morganMiddleware());

const docsSpec = {
    ...swaggerSpec,
    servers: [{ url: `http://localhost:${PORT}` }],
};

app.get('/api/docs.json', (req, res) => {
    res.json(docsSpec);
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(docsSpec, { explorer: true }));

// Montage des routes API.
app.use(chatRoutes);

// Demarrage du serveur.
const server = app.listen(PORT, () => {
    logger.systemStart(`Serveur demarre sur :${PORT}`);
});

/**
 * Centralise l'arret propre de l'application sur reception d'un signal systeme.
 */
function handleShutdown(signal) {
    logger.systemStop(`Arret du serveur (${signal})`);

    server.close(() => {
        process.exit(0);
    });

    // Securite: forcer l'arret si une connexion bloque la fermeture.
    setTimeout(() => {
        process.exit(0);
    }, 5000).unref();
}

// Arret propre en dev (Ctrl+C) et en execution conteneurisee.
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export default app;
