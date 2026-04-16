# Gymshark Sync

Assistant IA interne pour améliorer la productivité et la coordination en entreprise. Gymshark Sync permet aux utilisateurs de dialoguer avec un LLM local (via Ollama) pour organiser leurs tâches, générer des synthèses, planifier des actions et automatiser des workflows.

## Stack technique

| Composant         | Technologie                                                          |
| ----------------- | -------------------------------------------------------------------- |
| **Frontend**      | HTML5, CSS3 (variables, grid, flexbox), JavaScript (vanilla ES2020+) |
| **Backend**       | Node.js, Express 5.2                                                 |
| **LLM**           | Ollama (modèle `phi3:mini` par défaut)                               |
| **Persistance**   | Fichier JSON (`data/conversations.json`)                             |
| **Communication** | SSE (Server-Sent Events) pour le streaming des réponses              |

## Structure du projet

```
Projet-Gymshark---Sync/
├── backend/
│   ├── config/
│   │   └── prompt.js            # Chargement du system prompt
│   ├── routes/
│   │   └── chat.js              # Routes API (chat, conversations, health)
│   ├── services/
│   │   ├── history.js           # Persistance des conversations (JSON)
│   │   └── ollama.js            # Communication streaming avec Ollama
│   ├── server.js                # Point d'entrée du serveur Express
│   ├── system_prompt            # Instructions système du LLM
│   ├── .env.example             # Variables d'environnement (template)
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── index.html               # Page principale (SPA)
│   ├── style.css                # Styles (design dark, glassmorphism)
│   └── app.js                   # Logique frontend (chat, navigation, SSE)
├── data/
│   └── conversations.json       # Stockage des conversations (auto-généré)
├── .gitignore
├── toRun.todo                   # Mémo d'installation Ollama
└── README.md
```

## Documentation du code

Pour comprendre rapidement l'architecture et les principaux flux techniques:

- Voir [docs/guide-technique.md](docs/guide-technique.md)

Ce guide couvre:

- le role de chaque module backend/frontend,
- le flux de chat en streaming SSE,
- la persistance des conversations,
- les points d'extension et de debug.

## Prérequis

- **Node.js** >= 18 (pour le `fetch` natif) ou Node.js >= 14 avec `node-fetch` installé
- **Ollama** installé et fonctionnel ([ollama.com](https://ollama.com))

## Installation et lancement

### 1. Installer Ollama et le modèle

```bash
# Installer Ollama (voir https://ollama.com pour les instructions selon l'OS)
# Démarrer le serveur Ollama
ollama serve

# Télécharger le modèle (dans un autre terminal)
ollama pull llama3
```

### 2. Configurer le backend

```bash
cd backend

# Installer les dépendances
npm install

# Copier et adapter le fichier d'environnement
cp .env.example .env
# Modifier .env si nécessaire (URL Ollama, modèle, timeout)
```

### 3. Lancer le serveur backend

```bash
cd backend
npm start
# Le serveur démarre sur http://localhost:3000
```

### 4. Ouvrir le frontend

Ouvrir le fichier `frontend/index.html` directement dans un navigateur, ou utiliser un serveur local :

```bash
# Exemple avec Python
cd frontend
python3 -m http.server 8080
# Puis ouvrir http://localhost:8080
```

## Lancement automatise (Linux/macOS + Windows)

Des scripts sont disponibles a la racine pour demarrer automatiquement :

- Ollama (`ollama serve`) seulement si necessaire
- Le backend (port `3000` par defaut)
- Le frontend (port `8080` par defaut)

### Linux / macOS

```bash
./start_project.sh
```

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\start_project.ps1
```

### Windows (CMD)

```bat
start_project.bat
```

Ports personnalisables via variables d'environnement :

- `OLLAMA_HOST`
- `OLLAMA_PORT`
- `BACKEND_PORT`
- `FRONTEND_PORT`

## Variables d'environnement

| Variable         | Description                                   | Valeur par défaut        |
| ---------------- | --------------------------------------------- | ------------------------ |
| `OLLAMA_URL`     | URL du serveur Ollama                         | `http://localhost:11434` |
| `OLLAMA_MODEL`   | Nom du modèle LLM à utiliser                  | `phi3:mini`              |
| `OLLAMA_TIMEOUT` | Timeout d'inactivité en ms (vide = désactivé) | `60000`                  |
| `PORT`           | Port du serveur Express                       | `3000`                   |

## Routes API

| Méthode  | Endpoint                          | Description                                               |
| -------- | --------------------------------- | --------------------------------------------------------- |
| `POST`   | `/api/chat`                       | Envoie un message et streame la réponse SSE               |
| `GET`    | `/api/conversations`              | Liste les conversations (filtres `q` et `limit`)          |
| `GET`    | `/api/conversations/:id`          | Récupère une conversation complète par ID                 |
| `PATCH`  | `/api/conversations/:id`          | Renomme une conversation (`{ title }`)                    |
| `PUT`    | `/api/conversations/:id/messages` | Remplace les messages d'une conversation (`{ messages }`) |
| `DELETE` | `/api/conversations/:id`          | Supprime une conversation                                 |
| `GET`    | `/api/llm/health`                 | Health check du serveur Ollama                            |
| `GET`    | `/api/test-stream`                | Test de streaming SSE avec un prompt simple               |

### Format du body `POST /api/chat`

```json
{
  "message": "Résume mes tâches de la semaine",
  "conversationId": "conv_1234567890"
}
```

Le `conversationId` est optionnel. S'il est omis, un nouvel ID est généré automatiquement.

## Fonctionnalités principales

- **Chat en streaming** : Les réponses du LLM s'affichent en temps réel grâce au protocole SSE
- **Historique des conversations** : Persistance sur disque, chargement et suppression depuis la sidebar
- **Historique amélioré** : recherche, renommage et métadonnées (dernier message, nombre de messages)
- **Édition de messages** : Possibilité de modifier un message utilisateur et de régénérer la réponse
- **Suggestions rapides** : Prompts pré-définis pour démarrer rapidement une conversation
- **Cartes d'action** : Synthèse, Organisation et Automatisation accessibles depuis l'accueil
- **Vues multiples** : Chat, Recherche, Raccourcis, Centre d'aide, Documentation
- **Effets visuels** : Spotlight suivant le curseur, animations d'entrée, effets ripple, halos
- **Design responsive** : Adapté aux écrans de bureau et mobiles
- **Accessibilité** : Support `prefers-reduced-motion`, `aria-label`, `focus-visible`
