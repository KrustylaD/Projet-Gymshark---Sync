const express = require('express');
const cors = require('cors');

// Point d'entrée du serveur Express
const app = express();
const PORT = 3000;

// Middleware: CORS pour autoriser les requêtes du frontend
app.use(cors());

// Middleware: parser JSON pour les corps de requête
app.use(express.json());

// Import des routes de l'API
const chatRoutes = require('./routes/chat');

// Montage des routes (les routes exportées gèrent leurs propres chemins)
app.use(chatRoutes);

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
