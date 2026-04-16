# Guide technique du code - Gymshark Sync

Ce document explique comment le projet est structure et comment le lire rapidement.
L'objectif est de faciliter la comprehension du code avant de le modifier.

## 1) Vue d'ensemble

Le projet est une application chat en deux parties :

- Frontend (SPA HTML/CSS/JS): interface utilisateur, streaming SSE, historique, saisie vocale.
- Backend (Node.js/Express): endpoints API, orchestration Ollama, persistance JSON locale.

Flux principal:

1. Le frontend envoie un message a `POST /api/chat`.
2. Le backend construit un prompt avec l'historique.
3. Le backend streame la reponse d'Ollama au frontend via SSE.
4. Le frontend reconstruit le texte en direct et met a jour l'UI.
5. Le backend sauvegarde la conversation dans `data/conversations.json`.

## 2) Cartographie backend

### `backend/server.js`

Responsabilites:

- Initialiser Express.
- Brancher les middlewares globaux (CORS, JSON parser, logger HTTP).
- Monter les routes API (`routes/chat.js`).
- Gerer les signaux d'arret (`SIGINT`, `SIGTERM`).

### `backend/routes/chat.js`

Responsabilites:

- Exposer les routes de chat et de gestion des conversations.
- Configurer les headers SSE.
- Relayer les morceaux de reponse Ollama vers le client.
- Declencher la sauvegarde d'historique en fin de flux.

Endpoints principaux:

- `POST /api/chat`: streaming SSE de la reponse.
- `GET /api/conversations`: liste des conversations.
- `GET /api/conversations/:id`: conversation complete.
- `DELETE /api/conversations/:id`: suppression d'une conversation.
- `GET /api/llm/health`: disponibilite Ollama.

### `backend/services/ollama.js`

Responsabilites:

- Construire le payload Ollama (`/api/generate`).
- Lire un flux en mode streaming (Web Streams ou Node Readable).
- Convertir les fragments en texte utile.
- Exposer un health check (`/api/tags`).

Points importants:

- Timeout d'inactivite configurable via `OLLAMA_TIMEOUT`.
- Compatible Node 18+ (fetch natif) et fallback `node-fetch`.

### `backend/services/history.js`

Responsabilites:

- Lire/ecrire le fichier `data/conversations.json`.
- Lister les conversations triees par `updatedAt`.
- Gerer la creation, mise a jour et suppression.

## 3) Cartographie frontend

### `frontend/app.js`

C'est l'orchestrateur principal de l'interface.

Blocs fonctionnels:

- Etat et references DOM (`dom`, `state`).
- Navigation et transitions de vues.
- Saisie utilisateur (champ principal + secondaire).
- Rendu des messages et actions (copier, modifier).
- Streaming SSE (`readSSEStream`, `sendAndStream`).
- Historique (chargement, suppression, restauration).
- Audio: diagnostic micro/haut-parleur.
- Saisie vocale: Web Speech API (dictation continue).
- Bootstrap (`initPage`) et branchement des evenements.

### `frontend/logger.client.js`

Responsabilites:

- Intercepter `fetch` et journaliser les appels API.
- Journaliser la navigation (History API).
- Capturer les erreurs globales navigateur.

## 4) Donnees et persistence

### Format simplifie de `data/conversations.json`

```json
{
  "conv_123": {
    "id": "conv_123",
    "title": "Titre derive du premier message utilisateur",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ],
    "updatedAt": "ISO-8601",
    "createdAt": "ISO-8601"
  }
}
```

## 5) Comment suivre un bug rapidement

1. Verifier le backend (`npm start`) et l'endpoint `GET /api/llm/health`.
2. Ouvrir la console navigateur (logs de `logger.client.js`).
3. Tester un prompt simple via l'UI.
4. Verifier les logs serveur (`logger.js`) pour la requete SSE.
5. Inspecter `data/conversations.json` pour confirmer la sauvegarde.

## 6) Extensions recommandees

- Ajouter des tests automatises pour `history.js` et `ollama.js`.
- Introduire une couche de validation schema pour les payloads API.
- Factoriser `frontend/app.js` en modules (chat, audio, speech, navigation).
