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
const PORT = process.env.PORT || 3000;

/*
 * Ordre middleware important :
 * 1) CORS pour autoriser l'UI locale
 * 2) JSON parser pour req.body
 * 3) logger HTTP pour tracer toutes les routes
 */
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

/**
 * Centralise l'arret propre de l'application.
 *
 * @param {string} signal - Signal systeme recu (ex: SIGINT, SIGTERM).
 */
function handleShutdown(signal) {
    logger.systemStop(`Arret du serveur (${signal})`);
    process.exit(0);
}

/*
 * Arret propre: utile en dev (Ctrl+C) et en execution conteneurisee.
 * Ici aucun pool DB n'est ouvert, mais ce hook centralise les logs
 * et simplifie une extension future (fermeture de ressources).
 */
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
