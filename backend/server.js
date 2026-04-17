require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./logger');

/* ============================================================
   POINT D'ENTREE DU SERVEUR EXPRESS
   Charge la configuration, applique les middlewares globaux,
   monte les routes API puis demarre l'ecoute HTTP.
   ============================================================ */

const app = express();

// Port configurable via variable d'environnement, 3000 par defaut.
let PORT = process.env.PORT;
if (PORT === undefined || PORT === null || PORT === '') {
    PORT = 3000;
}

// Ordre des middlewares important : CORS → JSON parser → logger HTTP.
app.use(cors());
app.use(express.json());
app.use(logger.morganMiddleware());

// Montage des routes API.
const chatRoutes = require('./routes/chat');
app.use(chatRoutes);

// Demarrage du serveur.
app.listen(PORT, () => {
    logger.systemStart(`Serveur demarre sur :${PORT}`);
});

/**
 * Centralise l'arret propre de l'application sur reception d'un signal systeme.
 */
function handleShutdown(signal) {
    logger.systemStop(`Arret du serveur (${signal})`);
    process.exit(0);
}

// Arret propre en dev (Ctrl+C) et en execution conteneurisee.
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
