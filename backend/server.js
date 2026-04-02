const express = require('express');

// Point d'entrée du serveur Express
const app = express();
const PORT = 3000;

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
