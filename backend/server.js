const express = require('express');
const cors = require('cors');
const logger = require('./logger');

/* ============================================================
   POINT D'ENTREE DU SERVEUR EXPRESS
   ============================================================ */

const app = express();
const PORT = process.env.PORT || 3000;

/* --- Middlewares globaux --- */
app.use(cors());
app.use(express.json());
app.use(logger.morganMiddleware());

/* --- Montage des routes API --- */
const chatRoutes = require('./routes/chat');
app.use(chatRoutes);

/* --- Demarrage du serveur --- */
app.listen(PORT, () => {
    logger.systemStart(`Serveur demarre sur :${PORT}`);
});

/* --- Arret propre --- */
process.on('SIGINT', () => {
    logger.systemStop('Arret du serveur (SIGINT)');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.systemStop('Arret du serveur (SIGTERM)');
    process.exit(0);
});
