# Documentation Technique — Gymshark Sync

> Documentation générée automatiquement. Détaille chaque fichier, son rôle et ses fonctions.

---

## Table des matières

- [Backend](#backend)
  - [Point d'entrée](#point-dentrée)
  - [Configuration](#configuration)
  - [Routes](#routes)
  - [Services](#services)
  - [Utilitaires](#utilitaires)
  - [Fichiers de données](#fichiers-de-données)
  - [Tests](#tests-backend)
- [Frontend](#frontend)
  - [Point d'entrée & HTML](#point-dentrée--html)
  - [Configuration & State](#configuration--state)
  - [Services](#services-frontend)
  - [Composants](#composants)
  - [Utilitaires](#utilitaires-frontend)
  - [Styles](#styles)

---

## Backend

### Point d'entrée

#### `backend/server.js`

**Rôle :** Point d'entrée du serveur Express HTTP. Charge les variables d'environnement via `dotenv`, applique les middlewares globaux (CORS, JSON body parser, Morgan HTTP logger), monte les endpoints Swagger, monte toutes les routes API, et démarre l'écoute sur un port configurable. Gère l'arrêt gracieux sur SIGINT/SIGTERM.

| Fonction | Description |
|---|---|
| `default: app` | Application Express exportée pour les tests ou modules externes |

**Comportement interne :**
- Lit `PORT` depuis `process.env.PORT` (défaut : `3000`)
- Monte Swagger UI sur `GET /api/docs`
- Sert le JSON OpenAPI brut sur `GET /api/docs.json`
- Monte les routes chat depuis `routes/chat.js`
- Sur `SIGINT`/`SIGTERM`, ferme le serveur HTTP avec un délai de sécurité de 5 secondes

---

### Configuration

#### `backend/config/prompt.js`

**Rôle :** Charge et met en cache le system prompt depuis le fichier `system_prompt` sur le disque. Utilise un cache basé sur le `mtime` (date de modification) — ne relit le fichier que s'il a changé. Si le fichier est illisible, log un avertissement et retourne une chaîne vide (pas de crash).

| Export | Description |
|---|---|
| `getSystemPrompt()` | Retourne le contenu du system prompt (string trimmée). Utilise un cache au niveau module (`cachedPrompt`, `cachedPromptMtimeMs`). Si le `mtime` a changé depuis la dernière lecture, relit depuis le disque. En cas d'erreur (fichier manquant, permissions, etc.), log un avertissement et retourne `""` |
| `SYSTEM_PROMPT_PATH` | Chemin absolu résolu vers le fichier `system_prompt` |

**Fonctions internes (non exportées) :**
- Utilise `fs.statSync()` pour vérifier le `mtime`
- Utilise `fs.readFileSync()` pour lire le contenu du fichier

---

#### `backend/config/swagger.js`

**Rôle :** Définition de la spécification OpenAPI 3.0.3 pour l'API Gymshark Sync. Définit tous les schémas et endpoints pour la documentation Swagger. Utilise `swagger-jsdoc` pour générer la spec.

| Export | Description |
|---|---|
| `swaggerSpec` | Objet de spécification OpenAPI généré. Utilisé par `server.js` pour servir Swagger UI et le JSON brut |

**Schémas définis :**
- `ChatRequest` — `{ message: string, conversationId?: string }`
- `ConversationSummary` — `{ id, title, createdAt, updatedAt }`
- `ConversationMessage` — `{ role: 'user'\|'assistant', content: string }`
- `Conversation` — `{ id, title, createdAt, updatedAt, messages: ConversationMessage[] }`
- `ErrorResponse` — `{ error: string }`
- `OllamaHealth` — `{ ok, url, model, modelAvailable, models, error?, details? }`

**Endpoints documentés :**
- `POST /api/chat` — Chat streaming SSE
- `GET /api/conversations` — Liste des conversations
- `GET /api/conversations/{id}` — Détail d'une conversation
- `DELETE /api/conversations/{id}` — Suppression d'une conversation
- `GET /api/llm/health` — Health check LLM
- `GET /api/test-stream` — Test stream SSE

---

### Routes

#### `backend/routes/chat.js`

**Rôle :** Module de routage central. Définit toutes les routes API pour le backend : chat streaming (SSE), CRUD conversations, health checks, et endpoint de test stream. Construit comme un Router Express.

| Export | Description |
|---|---|
| `default: router` | Router Express contenant tous les endpoints |

**Fonctions internes (non exportées) :**

| Fonction | Description |
|---|---|
| `buildPromptFromHistory(history, userMessage)` | Construit le prompt envoyé au LLM en concaténant l'historique (préfixé `Utilisateur:` / `Assistant:`) suivi du message courant et d'un prompt `Assistant:` |
| `trimHistory(history)` | Tronque l'historique aux `MAX_HISTORY_TURNS` (8) dernières paires utilisateur/assistant (16 messages max) |
| `setupSSEHeaders(res)` | Définit les headers SSE sur la réponse : `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Appelle `flushHeaders()` si disponible (Express 5) |
| `resolveConversationId(conversationId)` | Retourne l'ID fourni par le client si valide, sinon génère un nouvel ID au format `conv_{Date.now()}` |
| `loadConversationHistory(convId)` | Charge l'historique complet d'une conversation depuis la persistance. Retourne `[]` si la conversation n'existe pas encore |
| `saveUpdatedHistory(convId, history, userMessage, assistantReply)` | Ajoute le message utilisateur et la réponse assistant à l'historique et sauvegarde |

**Routes :**

| Route | Description |
|---|---|
| `POST /api/chat` | Endpoint de chat streaming SSE. Accepte `{ message, conversationId }`. Retourne 400 si `message` absent/vide. Résout/réutilise le `conversationId`, charge l'historique, construit le prompt. Premier event SSE : `data: {"type":"meta","conversationId":"..."}`. Chaque chunk est streamé via SSE. Dernier event : `data: [DONE]`. En cas d'erreur : `event: error\ndata: {"message":"..."}` |
| `GET /api/conversations` | Liste toutes les conversations (sans messages), triées par `updatedAt` décroissant |
| `GET /api/conversations/:id` | Récupère une conversation avec tous ses messages. 404 si non trouvée |
| `DELETE /api/conversations/:id` | Supprime une conversation. Retourne `{ ok: true }` ou 404 |
| `GET /api/llm/health` | Proxy vers le health check du fournisseur LLM. 200 si OK, 503 si indisponible |
| `GET /api/test-stream` | Test stream avec un prompt simple ("Say hello in 5 words") et timeout de 15 secondes |

**Constantes :**
- `MAX_HISTORY_TURNS = 8`
- `MESSAGE_PREVIEW_MAX_LENGTH = 50`
- `TEST_STREAM_TIMEOUT_MS = 15000`

---

### Services

#### `backend/services/llm.js`

**Rôle :** Sélecteur/dispatcheur de fournisseur LLM. Lit la variable d'environnement `LLM_PROVIDER` et route les appels vers le service Ollama ou OpenCode. Agit comme une façade qui abstrait le choix du fournisseur.

| Export | Description |
|---|---|
| `generateResponse(prompt, options?)` | Route le prompt vers la fonction de streaming du fournisseur approprié (`ollama` ou `opencode` selon `LLM_PROVIDER`). Passe l'objet `options` directement au fournisseur (`onChunk`, `onReasoning`, `timeoutMs`) |
| `getHealth(options?)` | Route le health check vers le fournisseur approprié |

**Comportement interne :**
- Lit `process.env.LLM_PROVIDER`, trimmé et mis en minuscules. Défaut : `"ollama"`
- Si la valeur n'est ni `"ollama"` ni `"opencode"`, log un avertissement et fallback vers `"ollama"`
- Log le fournisseur effectif au démarrage

---

#### `backend/services/ollama.js`

**Rôle :** Service de communication avec un serveur Ollama local. Gère le streaming des réponses, l'extraction de texte depuis divers formats JSON/SSE, le timeout d'inactivité via AbortController, et les health checks. Supporte à la fois le `fetch` natif Node 18+ (Web Streams API) et `node-fetch` (Readable streams) en fallback.

| Export | Description |
|---|---|
| `generateOllamaResponse(prompt, { onChunk, timeoutMs }?)` | Fonction de streaming principale. Envoie un prompt à `/api/generate` d'Ollama. Appelle `onChunk(textPiece)` pour chaque fragment reçu. Supporte un timeout d'inactivité ré-armable (reset à chaque chunk). Retourne la réponse complète |
| `getOllamaHealth({ timeoutMs }?)` | Vérifie la disponibilité d'Ollama via `/api/tags`. Retourne `{ ok, url, model, modelAvailable, models, error?, details? }`. Timeout par défaut : 5000ms |

**Fonctions internes :**

| Fonction | Description |
|---|---|
| `ensureFetch()` | Résout l'implémentation `fetch`. Préfère `globalThis.fetch` (Node 18+), fallback `node-fetch`. Retourne `null` si indisponible |
| `extractTextPiece(line)` | Parse une ligne brute du stream Ollama et extrait le texte. Gère les formats JSON : `{"response":"..."}`, `{"message":{"content":"..."}}`, `{"output_text":"..."}`, `{"text":"..."}`, `{"output":[{"content":"..."}]}`. Ignore `[DONE]`. Fallback : retourne la ligne brute si non JSON |
| `createAbortTimeout(timeoutMs)` | Crée un AbortController avec un timeout d'inactivité ré-armable. Retourne `{ controller, signal, arm, clear }`. `arm()` reset le timer |
| `buildOllamaPayload(prompt)` | Construit le payload JSON pour `/api/generate`. Préfixe le system prompt au prompt utilisateur. Paramètres : `num_predict: 400`, `temperature: 0.6`, `top_k: 40`, `top_p: 0.85`, `repeat_penalty: 1.1`, `stream: true` |
| `readWebStream(body, decoder, timeout, onLine)` | Lit un stream Web ligne par ligne. Ré-arme le timeout à chaque chunk |
| `readNodeStream(body, decoder, timeout, signal, onLine)` | Lit un stream Node.js via event listeners (`data`, `end`, `error`, `abort`). Nettoie les listeners après utilisation |

**Configuration :**
- `ollamaBaseUrl` — depuis `OLLAMA_URL` (défaut : `http://localhost:11434`)
- `MODEL` — depuis `OLLAMA_MODEL` (défaut : `phi3:mini`)
- `API_URL` — `{ollamaBaseUrl}/api/generate`
- `HEALTH_TIMEOUT_MS = 5000`

---

#### `backend/services/opencode.js`

**Rôle :** Service de communication avec l'API cloud OpenCode (compatible OpenAI chat completions). Gère le streaming via SSE, le buffering du contenu de raisonnement, le timeout d'inactivité, et les health checks.

| Export | Description |
|---|---|
| `generateOpenCodeResponse(prompt, { onChunk, onReasoning, timeoutMs }?)` | Envoie un prompt à `/chat/completions` d'OpenCode. Appelle `onChunk(textPiece)` pour chaque `delta.content`. Appelle `onReasoning()` au premier `delta.reasoning_content`. Si le stream ne contient que du reasoning, l'émet comme contenu à la fin. Nécessite `OPENCODE_API_KEY` |
| `getOpenCodeHealth({ timeoutMs }?)` | Vérifie la disponibilité d'OpenCode via `/models`. Même format de retour qu'Ollama avec `provider: 'opencode'` en plus. Nécessite `OPENCODE_API_KEY` |

**Fonctions internes :**

| Fonction | Description |
|---|---|
| `ensureFetch()` | Même pattern qu'Ollama : résout `fetch` |
| `createAbortTimeout(timeoutMs)` | Même pattern qu'Ollama : timeout ré-armable |
| `buildChatPayload(prompt)` | Construit le payload pour l'API chat completion. Tableau `messages` : message système (system prompt si non vide) + message utilisateur. Inclut `model`, `stream: true`, `max_tokens`, `temperature` |
| `readWebStream(body, decoder, timeout, onLine)` | Même pattern qu'Ollama |
| `readNodeStream(body, decoder, timeout, signal, onLine)` | Même pattern qu'Ollama |
| `createOpenCodeLineHandler(timeout, onChunk, onReasoning)` | Crée un handler de ligne pour le format SSE OpenCode. Parse chaque ligne `data:` en JSON. Extrait `delta.content` (appelle `onChunk`) et `delta.reasoning_content` (appelle `onReasoning` une fois, bufferise). Retourne `{ handler, ctx }` |
| `streamResponseBody(res, decoder, timeout, onLine)` | Dispatche entre Web Streams, Node.js streams, et fallback texte |

**Configuration :**
- `apiUrl` — depuis `OPENCODE_API_URL` (défaut : `https://opencode.ai/zen/go/v1`)
- `CHAT_URL` — `{apiUrl}/chat/completions`
- `MODELS_URL` — `{apiUrl}/models`
- `MODEL` — depuis `OPENCODE_MODEL` (défaut : `deepseek-v4-flash`)
- `API_KEY` — depuis `OPENCODE_API_KEY`
- `MAX_TOKENS` — depuis `OPENCODE_MAX_TOKENS` (défaut : `4096`)
- `TEMPERATURE` — depuis `OPENCODE_TEMPERATURE` (défaut : `0.6`)

---

#### `backend/services/history.js`

**Rôle :** Service de persistance des conversations. Gère la lecture/écriture d'un fichier JSON (`data/conversations.json`) contenant toutes les conversations. Crée automatiquement le répertoire `data/`, génère les titres, et fournit les opérations CRUD.

| Export | Description |
|---|---|
| `getConversation(id)` | Récupère une conversation par son ID. Retourne `null` si non trouvée |
| `saveConversation(id, messages, title?)` | Crée ou met à jour une conversation. Si `title` non fourni, le génère à partir du premier message utilisateur. Préserve le `createdAt` original. Met toujours à jour `updatedAt` |
| `deleteConversation(id)` | Supprime une conversation par ID. Retourne `true` si supprimée, `false` si inexistante |
| `listConversations()` | Retourne toutes les conversations **sans** le champ `messages` (résumé uniquement), triées par `updatedAt` décroissant |

**Fonctions internes :**

| Fonction | Description |
|---|---|
| `ensureDataDir()` | Crée le dossier `data/` s'il n'existe pas (idempotent) |
| `loadAll()` | Lit et parse `conversations.json`. Retourne `{}` si fichier inexistant (`ENOENT`) ou JSON corrompu |
| `saveAll(data)` | Écrit l'objet conversations complet dans `conversations.json` (pretty-print, 2 espaces) |
| `extractTitle(messages)` | Génère un titre à partir du premier message `user`. Tronqué à 60 caractères avec `...`. Fallback : `"Nouvelle conversation"` |

**Constantes :**
- `DATA_DIR` — `data/` à la racine du projet
- `HISTORY_FILE` — `data/conversations.json`
- `TITLE_MAX_LENGTH = 60`

---

### Utilitaires

#### `backend/logger.js`

**Rôle :** Système de logging structuré et coloré pour le backend. Utilise `chalk` pour le coloriage terminal et `morgan` pour le logging HTTP. Supporte plusieurs catégories : HTTP, database, erreur, warning, info, événements système. Toutes les fonctions de log sont "safe" — elles ne font jamais crasher le processus.

| Export | Description |
|---|---|
| `timestamp()` | Interne. Retourne l'heure formatée `[HH:MM:SS]` |
| `colorMethod(method)` | Interne. Colore les méthodes HTTP (GET=bleu, POST=vert, PUT=jaune, DELETE=rouge) |
| `colorStatus(status)` | Interne. Colore les codes HTTP (2xx=vert, 4xx=jaune, 5xx=rouge) |
| `formatLocation(file, line)` | Interne. Formate un suffixe `file:line` pour les logs d'erreur/warning |
| `emit(method, tag, segments)` | Cœur interne. Émet une ligne de log avec timestamp, tag, et segments séparés par `\|`. Fallback vers `console.log` si la méthode demandée n'existe pas |
| `http(method, endpoint, status, durationMs)` | Log une requête HTTP avec méthode colorée, endpoint, statut, et durée |
| `dbSuccess(action, collection, result)` | Log une opération DB réussie |
| `dbError(action, collection, errorMsg)` | Log une opération DB échouée |
| `dbConnection(message)` | Log un message de connexion DB |
| `fatal(message, file, line)` | Log une erreur critique (`console.error`) |
| `warn(message, file, line)` | Log un avertissement non bloquant (`console.warn`) |
| `info(message)` | Log une information générale |
| `systemStart(message)` | Log un démarrage de service (vert) |
| `systemStop(message)` | Log un arrêt de service (rouge) |
| `systemInfo(message)` | Log une information système (cyan) |
| `morganMiddleware()` | Retourne un middleware Express intégrant Morgan avec le logger HTTP custom. Appelle `http()` pour chaque requête |
| `default: logger` | Objet contenant toutes les fonctions ci-dessus comme méthodes |

---

### Fichiers de données

#### `backend/system_prompt`

**Rôle :** Fichier texte brut (269 lignes) contenant les instructions du system prompt pour le LLM. Définit l'identité, les objectifs, le format de sortie, la chaîne de raisonnement, les règles de sécurité, et des exemples few-shot pour l'assistant "SYNC". Rédigé entièrement en français.

**Sections clés :**
- Identité : SYNC, assistant interne Gymshark, expert en gestion de salle, coordination d'équipe, expérience client, optimisation des processus
- Format de sortie : titre (`##`), synthèse rapide, développement structuré, plan d'action, bonus optionnel
- Adaptation contextuelle : 5 cas (question simple, plan/stratégie, processus, planning, urgence)
- Chaîne de raisonnement interne obligatoire (7 étapes)
- Règles de sécurité
- Exemples few-shot (3 exemples : plan, urgence, processus)
- Règle finale : chaque réponse doit être utilisable directement en environnement professionnel

---

### Tests (Backend)

#### `backend/__tests__/routes/chat.test.js`

Tests d'intégration pour les routes chat. Démarre un vrai serveur Express sur un port aléatoire, mock les services LLM et history via `jest.unstable_mockModule()`, teste tous les endpoints avec `fetch` natif.

**Cas de test :**
- `POST /api/chat` : 400 si message absent ou vide, headers SSE corrects, event `meta` avec conversationId, réutilisation du `conversationId` client, `[DONE]` en fin de stream, event SSE `error` si le LLM lance une erreur
- `GET /api/conversations` : retourne la liste mockée
- `GET /api/conversations/:id` : 404 si inexistant, retourne la conversation si elle existe
- `DELETE /api/conversations/:id` : 404 si inexistant, `{ ok: true }` si supprimé
- `GET /api/llm/health` : 200 si OK, 503 si indisponible

---

#### `backend/__tests__/services/opencode.test.js`

Tests unitaires pour le service OpenCode. Mock `globalThis.fetch`, `config/prompt.js`, et le logger.

**Cas de test :**
- `generateOpenCodeResponse` : erreur si `OPENCODE_API_KEY` absent, assemblage correct des chunks `delta.content`, appel de `onChunk` pour chaque fragment, erreur HTTP 500, buffering du `reasoning_content` émis à la fin, appel de `onReasoning`, header `Authorization` correct
- `getOpenCodeHealth` : `ok: false` si clé absente, `ok: true` avec liste de modèles, `ok: false` avec HTTP 401

---

#### `backend/__tests__/services/ollama.test.js`

Tests unitaires pour le service Ollama. Mock `globalThis.fetch`, `config/prompt.js`, et le logger.

**Cas de test :**
- `generateOllamaResponse` : erreur HTTP 500, assemblage correct des chunks JSON, appel de `onChunk`, gestion du préfixe `data:` (format SSE), ignore `[DONE]`
- `getOllamaHealth` : `ok: true` avec modèles, `ok: false` HTTP 503, `modelAvailable: true/false` selon présence du modèle configuré

---

#### `backend/__tests__/services/llm.test.js`

Tests unitaires pour le sélecteur de fournisseur LLM. Mock les services Ollama et OpenCode.

**Cas de test :**
- Routing vers Ollama par défaut
- Routing vers OpenCode avec `LLM_PROVIDER=opencode`
- Log d'avertissement + fallback Ollama pour valeur invalide
- Transmission des options (`onReasoning`, `onChunk`, `timeoutMs`)

---

#### `backend/__tests__/services/history.test.js`

Tests unitaires pour le service de persistance. Mock `fs/promises`, `fs`, et le logger.

**Cas de test :**
- `getConversation` : `null` si inexistant, objet complet si existe
- `saveConversation` : création avec titre auto-généré, troncation du titre à 60 caractères, titre "Nouvelle conversation" si pas de message user, préservation du `createdAt` à la mise à jour, utilisation d'un titre explicite
- `deleteConversation` : `false` si inexistant, `true` et suppression si existe
- `listConversations` : tableau vide si pas de conversations, sans champ `messages`, trié par `updatedAt` décroissant

---

#### `backend/__tests__/config/prompt.test.js`

Tests unitaires pour le chargeur de system prompt. Mock `fs` et le logger.

**Cas de test :**
- Retourne le contenu trimmé du fichier
- Retourne `""` si le fichier est absent (fallback gracieux)
- Utilise le cache quand le fichier n'a pas changé
- Recharge le fichier quand le `mtime` a changé

---

## Frontend

### Point d'entrée & HTML

#### `frontend/index.html`

**Rôle :** Page HTML unique de la SPA. Charge Font Awesome CDN, tous les CSS, le script logger, et le module `app.js`. Contient trois couches structurelles principales :

1. **Écran de chargement** (`ecran-chargement`) — Animation de rideau théâtral avec branding GYMSHARK SYNC, lettres animées, titre "Puissance calme", logo SVG, barre de progression
2. **Transition de page** (`transition-page`) — Overlay pour transitions fluides entre vues
3. **Conteneur principal** (`conteneur-principal`) :
   - **Sidebar** : logo, navigation (Nouveau Chat, Recherche, Raccourcis), historique, zone d'aide audio
   - **Contenu principal** : header avec dropdown + partage + audio + avatar, zone de statut, vues multiples (chat, recherche, raccourcis, aide, docs)
   - **Modale audio** — dialogue caché pour sélection micro, test micro, test haut-parleur

Aucune fonction — markup HTML pur.

---

#### `frontend/app.js`

**Rôle :** Point d'entrée du module ES. Importe `initPage` depuis `bindings.js` et l'appelle immédiatement.

```js
import { initPage } from './components/bindings.js';
initPage();
```

Aucune fonction définie localement.

---

### Configuration & State

#### `frontend/constants/config.js`

**Rôle :** Module centralisé de configuration et d'état. Exporte toutes les constantes, références DOM, et l'état global de l'application.

| Export | Description |
|---|---|
| `API_BASE` | `'http://localhost:3000'` — URL du backend |
| `STORAGE_KEYS` | Objet avec clés : `conversationId` (localStorage), `snapshot` (sessionStorage), `draft` (sessionStorage) |
| `dom` | Large objet mappant des sélecteurs CSS vers des références d'éléments DOM (inputs, boutons, vues, modales, etc.) |
| `initialConversationMarkup` | HTML original du fil de conversation (pour reset) |
| `SpeechRecognitionAPI` | `window.SpeechRecognition` ou `window.webkitSpeechRecognition` ou `null` |
| `state` | État global : `statusTimer`, `conversationId`, `isResponding`, `audioModalOpen`, `speechRecognition`, `speechActive`, `speechShouldRestart`, `speechErrored`, `speechInput`, `speechBaseText`, `speechFinalText`, `micTestActive`, `micStream`, `micContext`, `micAnalyser`, `micSource`, `micFrame`, `selectedAudioInputId`, `speakerContext`, `lastFocusedElement`, `activeView`, `viewSwitchTimer` |

---

### Services (Frontend)

#### `frontend/services/chat.js`

**Rôle :** Gère l'envoi de messages au backend via SSE streaming. Parse les événements SSE de manière incrémentale, met à jour le DOM du message assistant en temps réel, gère l'indicateur de frappe.

| Fonction | Description |
|---|---|
| `_getRefreshHistory()` | Retourne la référence cachée de `_refreshHistory` |
| `setRefreshHistory(fn)` | Définit la fonction `refreshHistory` (appelé par `bindings.js` pour résoudre la dépendance circulaire) |
| `processSSEEventBlock(block, ctx)` | Parse un bloc d'événements SSE complet, gère `event:` et `data:`. Traite `error` (throw), `[DONE]`, `meta` (conversationId), `reasoning` ("SYNC reflechit..."), et les chunks de réponse. Met à jour le DOM du message assistant en temps réel |
| `readSSEStream(response, assistantArticle)` | Lit le `ReadableStream` de la réponse fetch, décode les chunks, split en blocs SSE, délègue à `processSSEEventBlock`. Retourne le texte complet de la réponse |
| `sendAndStream(message, successStatus)` | Définit `isResponding=true`, désactive les inputs, crée un placeholder assistant avec points de frappe. Fetch `POST /api/chat`. Attend 2s (visibilité de l'indicateur de frappe), puis appelle `readSSEStream`. En cas de succès : statut + refresh historique. En cas d'erreur : message d'erreur dans le DOM |
| `sendMessage(event)` | Handler de soumission du formulaire. Vérifie si déjà en train de répondre, arrête la reconnaissance vocale. Valide le texte non vide, active le mode conversation, flash le bouton d'envoi, ajoute le message utilisateur au DOM, vide les inputs, appelle `sendAndStream` |

---

#### `frontend/services/history.js`

**Rôle :** Gère la liste d'historique des conversations dans la sidebar — récupération, affichage, chargement et suppression via l'API backend.

| Fonction | Description |
|---|---|
| `createHistoryDeleteButton(conversation)` | Crée un bouton icône poubelle qui ouvre une modale de confirmation puis envoie `DELETE /api/conversations/:id`. Reset la conversation si c'était la conversation active |
| `createEmptyHistoryState()` | Crée un élément "Aucune conversation" stylisé |
| `createHistoryItem(conversation)` | Crée un bouton d'historique dans la sidebar avec le titre et le bouton de suppression. Surbrillance si conversation active. Le clic charge la conversation |
| `refreshHistory()` | Fetch `GET /api/conversations`, vide la liste, peuple avec des items ou l'état vide, anime l'entrée avec `animateElementBatch` |
| `loadConversation(id)` | Fetch `GET /api/conversations/:id`, vide le fil, définit l'ID de conversation, ajoute tous les messages, active la vue chat, scroll en bas, sauvegarde le snapshot |

---

#### `frontend/services/speech.js`

**Rôle :** Reconnaissance vocale (Speech-to-Text) utilisant la Web Speech API (langue française). Gère le cycle de vie de la reconnaissance, met à jour les champs de saisie avec les résultats intermédiaires/finaux.

| Fonction | Description |
|---|---|
| `updateMicButtons(active)` | Bascule la classe `.est-en-ecoute`, `aria-pressed`, title et aria-label sur tous les boutons micro |
| `normalizeSpeechText(text)` | Réduit les espaces multiples et trim |
| `getSpeechInput()` | Détermine quel input utiliser : l'input focusé, le secondaire si en mode conversation, ou le primaire |
| `mergeSpeechText(prefix, text)` | Concatène le texte de base et le nouveau texte vocal avec un espace |
| `resetSpeechState()` | Réinitialise tous les flags d'état de la reconnaissance vocale |
| `getSpeechErrorMessage(code)` | Mappe les codes d'erreur Web Speech API vers des messages utilisateur en français |
| `ensureSpeechRecognition()` | Crée ou retourne l'instance `SpeechRecognition` en cache. Configure `lang='fr-FR'`, `continuous=true`, `interimResults=true`. Définit les handlers `onstart`, `onresult`, `onerror`, `onend` |
| `stopSpeechInput(silent)` | Arrête la reconnaissance active, définit `shouldRestart=false` |
| `toggleSpeechInput()` | Démarre ou arrête la reconnaissance vocale |

---

#### `frontend/services/audio.js`

**Rôle :** Outils de diagnostic audio — test de niveau micro via Web Audio API et génération de tonalité de test haut-parleur. Gère aussi l'ouverture/fermeture de la modale audio.

| Fonction | Description |
|---|---|
| `setAudioMeter(bar, label, value, prefix)` | Met à jour une barre de progression et son label (valeur clampée 0-100) |
| `resetMicMeter()` | Remet le niveau micro à 0% |
| `resetSpeakerMeter()` | Remet le niveau haut-parleur à 0% et "inactif" |
| `stopMicTest()` | Arrête le test micro actif : annule l'animation frame, déconnecte les nœuds audio, arrête les pistes media, ferme l'AudioContext |
| `animateMicLevel()` | Lit les données temporelles de l'`AnalyserNode`, calcule le niveau RMS, met à jour le meter. Boucle via `requestAnimationFrame` |
| `loadAudioDevices()` | Énumère les périphériques media, peuple le `<select>` avec les entrées audio |
| `prepareAudioDevices()` | Demande la permission micro avec `getUserMedia({audio:true})`, arrête immédiatement le stream, puis appelle `loadAudioDevices()` |
| `toggleMicTest()` | Démarre/arrête le test micro. Crée AudioContext + AnalyserNode, connecte le stream, lance la boucle d'animation |
| `playSpeakerTest()` | Crée un AudioContext, génère un oscillateur sinusoïdal 880Hz avec enveloppe exponentielle (0.6s). Anime la barre de niveau |
| `openAudioModal()` | Affiche la modale audio, définit `body.modale-ouverte` |
| `closeAudioModal()` | Cache la modale audio, arrête le test micro, restaure le focus |

---

#### `frontend/services/search.js`

**Rôle :** Implémente la fonctionnalité de vue recherche — affiche les suggestions, filtre les résultats en temps réel avec debounce, affiche un état vide si aucun résultat.

| Fonction | Description |
|---|---|
| `buildSuggestions(container)` | Peuple le conteneur de suggestions avec des pills cliquables. Le clic remplit l'input de recherche |
| `filterResults(query)` | Compare le terme de recherche avec le contenu texte de chaque `.element-liste` (case-insensitive). Affiche/cache les items. Appelle `showEmptyState` si aucun résultat |
| `showEmptyState(container, show)` | Crée paresseusement un élément "Aucun résultat", l'insère/retire du DOM |
| `initSearch()` | Fonction de bootstrap exportée. Bind les événements `input` (debounce 120ms), `keydown` (Escape), et bouton clear. Appelle `buildSuggestions` |

---

### Composants

#### `frontend/components/bindings.js`

**Rôle :** Couche d'orchestration — connecte tous les event listeners, initialise les animations, et bootstrappe l'application. Importe depuis de nombreux modules et configure les handlers DOM.

| Fonction | Description |
|---|---|
| `createRipple(button, event)` | Crée un `<span class="ripple">` temporaire à la position du clic, supprimé après 520ms |
| `initAnimations()` | Ajoute `.animable` aux éléments ; définit des délais de transition staggered ; crée un `IntersectionObserver` pour ajouter `.est-visible` ; anime la sidebar et le panneau de contenu avec `Element.animate()` (sauf `prefers-reduced-motion`) |
| `bindGlobalEvents()` | Ajoute ripple sur `pointerdown` des boutons ; `mousemove` pour le spotlight ; `visibilitychange` arrête speech/mic/modales ; `beforeunload` cleanup ; `Escape` ferme la modale audio |
| `handleViewTargetSource(source, opts)` | Gère le clic sur `data-view-target` : active la vue cible, réinitialise optionnellement la conversation, injecte `data-prompt`. Arrête la reconnaissance vocale |
| `handleAppAction(action)` | Route les clics `data-action` : `"share"`, `"attach"`, `"voice"` (toggle speech), `"audio-settings"` (ouvre modale) |
| `bindNavigation()` | Bind les handlers de clic pour les boutons nav, suggestions, cartes d'action, boutons d'action |
| `bindAudioModal()` | Bind le bouton de fermeture, clic backdrop, changement de sélecteur audio, refresh devices, test micro, test haut-parleur |
| `bindInputs()` | Bind `submit` du formulaire vers `sendMessage` ; `input`/`focus`/`blur` vers sync inputs ; Enter soumet le formulaire |
| `initPage()` | Bootstrap principal exporté : résout la dépendance circulaire (donne `refreshHistory` à chat.js), appelle `initSearch()`, `initAnimations()`, `bindGlobalEvents()`, `bindNavigation()`, `bindAudioModal()`, `bindInputs()`, `syncInputBoxesState()`. Au `window.load` : cache l'écran de chargement après 2.2s, active la vue chat, restaure le snapshot et le brouillon, rafraîchit l'historique, charge la conversation active |

---

#### `frontend/components/input.js`

**Rôle :** Gère les inputs texte — détermine quel input est actif, synchronise les états visuels des boîtes de saisie (lueur active), injecte des prompts, et réinitialise la conversation.

| Fonction | Description |
|---|---|
| `getActiveInput()` | Retourne l'input secondaire s'il est focusé ou si en mode conversation, sinon l'input primaire |
| `syncInputBoxesState()` | Bascule `.est-active` sur les boîtes de saisie selon contenu et focus |
| `pulseInput(box)` | Joue une animation de rebond vertical subtile sur une boîte de saisie |
| `injectPrompt(text)` | Remplit tous les inputs avec le texte, focus l'input primaire, active la vue chat, pulse la boîte. Arrête la reconnaissance vocale |
| `resetConversation()` | Arrête la reconnaissance vocale, désactive le mode conversation, restaure le markup initial du fil, vide tous les inputs, reset l'ID de conversation, efface le snapshot |

---

#### `frontend/components/input-sync.js`

**Rôle :** Module utilitaire (extrait pour éviter les dépendances circulaires) pour synchroniser les valeurs entre les inputs primaire et secondaire, et sauvegarder/supprimer les brouillons.

| Fonction | Description |
|---|---|
| `saveDraft(value)` | Sauvegarde les valeurs non vides dans sessionStorage, supprime la clé si vide |
| `syncAllInputs(value)` | Définit `.value` sur tous les inputs texte, sauvegarde le brouillon, met à jour les états des boîtes |
| `syncInputBoxesState()` | (local) Bascule `.est-active` sur les boîtes primaire/secondaire |

---

#### `frontend/components/message-dom.js`

**Rôle :** Manipulation DOM pour les messages de chat — construction des shells de message, ajout de messages utilisateur/assistant, création de placeholders assistant, sauvegarde/restauration de snapshots de conversation dans sessionStorage.

| Fonction | Description |
|---|---|
| `setInputsDisabled(disabled)` | Active/désactive tous les inputs texte et boutons d'envoi |
| `scrollConversationToBottom(behavior)` | Scroll le fil de conversation en bas (smooth ou auto) |
| `setMessageContent(article, contentNode, content, role)` | Définit le contenu d'un message. Pour l'assistant : rendu markdown. Stocke le contenu brut dans `dataset.rawContent` |
| `mountConversationShell(shell, actionBar)` | Ajoute la barre d'action au shell, bind la visibilité au hover, ajoute le shell au fil, scroll et sauvegarde le snapshot |
| `buildMessageShell(content, role)` | Crée la structure `div.message-shell > article.message > div.message-body`. Retourne `{shell, article, contentNode}` |
| `appendMessage(content, role)` | Construit le shell, crée la barre d'action (copie + édition optionnelle), monte dans le fil. Retourne l'élément article |
| `createAssistantPlaceholder()` | Comme `appendMessage` mais avec contenu vide (utilisé avant le début du streaming) |
| `collectMessagesFromDom()` | Lit tous les `.message` du fil, extrait rôle et contenu brut, retourne un tableau `{role, content}` |
| `saveConversationSnapshot()` | Collecte les messages, construit un snapshot avec conversationId et mode, stocke en JSON dans sessionStorage |
| `clearConversationSnapshot()` | Supprime le snapshot du sessionStorage |
| `restoreConversationSnapshot()` | Lit le snapshot, vide le fil, re-rend tous les messages, active le mode conversation. Retourne un booléen de succès |
| `restoreDraft()` | Lit le brouillon du sessionStorage et le sync à tous les inputs |
| `setConversationId(id)` | Met à jour `state.conversationId` et persiste dans localStorage (ou supprime si null). Sauvegarde le snapshot |

---

#### `frontend/components/message-actions.js`

**Rôle :** Construit la barre d'action qui apparaît au survol des messages (boutons copier et éditer).

| Fonction | Description |
|---|---|
| `createIconActionButton(iconClass, title, onClick, extraClass)` | Crée un `<button>` avec une icône Font Awesome, labels ARIA, handler clic |
| `createMessageActionBar()` | Crée un conteneur `div.message-action-bar` |
| `bindHoverActionBar(container, actionBar)` | Ajoute des listeners `mouseenter`/`mouseleave` pour afficher/cacher la barre d'action |
| `copyTextToClipboard(getText)` | Copie le texte (depuis une fonction ou string) vers le presse-papier, affiche le statut succès/erreur |
| `buildMessageActionBar({getCopyContent, onEdit})` | Construit une barre d'action complète avec bouton copie (toujours) et bouton édition (messages utilisateur seulement) |

---

#### `frontend/components/modals.js`

**Rôle :** Crée et gère les dialogues modaux : modale de confirmation (pour suppression) et modale d'édition de message.

| Fonction | Description |
|---|---|
| `createModalBackdrop(extraClass)` | Crée un overlay `div.modale-overlay` |
| `createModalCard(extraClass)` | Crée un conteneur `div.modale-confirmation` |
| `createModalButton(label, variantClass)` | Crée un `<button>` stylisé |
| `bindModalDismiss(backdrop, close)` | Bind Escape et clic backdrop pour fermer la modale. Retourne une fonction de cleanup |
| `openConfirmModal({title, message, confirmLabel, danger})` | Retourne une Promise. Crée une modale de confirmation avec titre, message, boutons annuler/confirmer. Résout `true` si confirmé, `false` si annulé |
| `openEditMessageModal(originalContent, article, shell)` | (async) Crée une modale avec un textarea pré-rempli. À la sauvegarde : met à jour le contenu dans le DOM, supprime le message assistant suivant, sauvegarde le snapshot, puis importe `chat.js` et appelle `sendAndStream` pour régénérer la réponse |

---

#### `frontend/components/feedback.js`

**Rôle :** Utilitaires de feedback UI — messages dans la barre de statut, mise à jour des textes de diagnostic, activation de vues avec transitions animées, animations d'entrée de vue, animations par lot d'éléments, bascule du mode conversation.

| Fonction | Description |
|---|---|
| `showStatus(message)` | Affiche un message temporaire dans `.zone-statut`, auto-caché après 2.2s |
| `setDiagnosticStatus(element, message)` | Définit le contenu texte d'un élément (utilisé pour les statuts audio) |
| `syncActiveNav(viewName)` | Bascule `.est-actif` sur les boutons nav de la sidebar correspondant à la vue active |
| `pulsePageTransition()` | Déclenche une brève animation flash sur l'overlay de transition de page (sauf reduced-motion) |
| `getViewMotionTargets(view)` | Collecte jusqu'à 14 enfants DOM uniques depuis des sélecteurs dans une vue pour les animations staggered |
| `animateViewEntrance(view)` | Anime les éléments de vue avec des keyframes opacity/translateY/scale/blur, staggered de 42ms, délai max 220ms |
| `animateElementBatch(elements, opts)` | Anime un tableau d'éléments avec des keyframes d'entrée, pas de délai configurable |
| `activateView(viewName, opts)` | Change la vue visible. Si `immediate` ou reduced-motion : switch instantané. Sinon : pulse la transition, ajoute classe de sortie, puis après 170ms échange les vues et lance l'animation d'entrée |
| `setConversationMode(enabled)` | Bascule `.est-en-conversation` sur la vue chat |

---

### Utilitaires (Frontend)

#### `frontend/utils/markdown.js`

**Rôle :** Parser et renderer markdown léger et custom pour les messages de l'assistant. Convertit les réponses LLM (avec titres, listes, tableaux, blocs de code, citations, formatage inline) en HTML. Détecte et formate aussi les erreurs de transport du LLM.

| Fonction | Description |
|---|---|
| `escapeHtml(value)` | Échappe `&`, `<`, `>`, `"`, `'` en entités HTML |
| `normalizeAssistantLine(line)` | Normalise les caractères de puce (•,-,*, etc.) vers `-`, les formats numériques vers `N.`, tabs vers espaces |
| `normalizeAssistantContent(content)` | Normalise les fins de ligne, applique `normalizeAssistantLine` à chaque ligne, réduit 3+ sauts de ligne à 2 |
| `autoFormatInlineText(text)` | Auto-formate les patterns `Key : value` en `**Key** : value` si le texte ne commence pas par `**` |
| `renderInlineMarkdown(text)` | Convertit le markdown inline en HTML : code backtick, gras (`**`/`__`), italique (`*`/`_`), barré (`~~`), liens, images. Approche tokenisée pour protéger le code du traitement gras/italique |
| `getListItemDescriptor(line)` | Parse les items de liste ordonnée (`1.`) et non ordonnée (`- * +`). Retourne `{type, content}` ou `null` |
| `isTableSeparator(line)` | Vérifie si une ligne est une ligne de séparation de tableau markdown |
| `parseTableRow(line)` | Split une ligne de tableau par `\|` et trim les cellules |
| `canStartTable(line, nextLine)` | Vérifie si deux lignes pourraient débuter un tableau markdown |
| `collectTable(lines, startIndex)` | Collecte les lignes consécutives d'un tableau depuis un index |
| `isCodeBlockFence(line)` | Vérifie si une ligne correspond à la syntaxe ` ``` ` |
| `collectCodeBlock(lines, startIndex)` | Collecte les lignes d'un bloc de code entre fences, extrait le langage |
| `collectBlockquote(lines, startIndex)` | Collecte les lignes consécutives préfixées par `>` |
| `getMarkdownHeading(line)` | Parse les titres `#` à `####`, retourne `{level, text}` |
| `isLikelySectionTitle(line, nextLine)` | Détection heuristique de titres de section (termine par `:`, suivi d'items de liste, ligne courte, etc.) |
| `isStandaloneQuestion(line)` | Vérifie si une ligne termine par `?` et fait ≤ 120 caractères |
| `renderAssistantNodes(nodes)` | Rend un tableau de nœuds AST (heading, hr, list, table, code, blockquote, paragraph) en HTML |
| `tryParseSpecialBlock(line, nextLine, lines, index)` | Tente de parser des blocs spéciaux (code, citation, tableau, règle horizontale) à la position courante |
| `renderAssistantMessage(content)` | Fonction principale exportée. Normalise le contenu, découpe en lignes, construit un AST, appelle `renderAssistantNodes` |
| `tryExtractAssistantTransportError(content)` | Vérifie si le contenu contient un message d'erreur de transport/backend (Ollama HTTP, réseau, etc.) |
| `formatAssistantErrorMessage(message)` | Mappe les patterns d'erreur vers des messages utilisateur en français |
| `getAssistantDisplayContent(content)` | Exporté. Vérifie les erreurs de transport ; si trouvées, retourne le message d'erreur formaté ; sinon retourne le contenu brut |

---

#### `frontend/utils/storage.js`

**Rôle :** Wrapper simple autour de `sessionStorage` avec try/catch pour les environnements où le storage est indisponible.

| Fonction | Description |
|---|---|
| `storageGet(key, fallback)` | Retourne `sessionStorage.getItem(key)` ou `fallback` (défaut `null`) |
| `storageSet(key, value)` | Appelle `sessionStorage.setItem(key, value)` |
| `storageRemove(key)` | Appelle `sessionStorage.removeItem(key)` |

---

#### `frontend/logger.client.js`

**Rôle :** Fonction auto-invoquée qui installe un système de logging structuré côté navigateur. Intercepte `window.fetch` et `history.pushState/replaceState` pour logger automatiquement les appels API, changements de route, erreurs JS, rejets de promesses non gérées, et erreurs de chargement de ressources. Expose `window.Logger` pour le logging manuel.

| Fonction | Description |
|---|---|
| `timestamp()` | Retourne l'heure formatée `[HH:MM:SS]` |
| `emit(method, tag, tagStyle, segments)` | Fonction cœur de logging ; appelle `console.log` avec une chaîne formatée stylisée |
| `formatMethod(method)` | Pad les méthodes HTTP à 6 caractères en majuscules |
| `resolveRequestMeta(args)` | Extrait l'URL et la méthode des arguments de `fetch()` |
| `logApiStart(request)` | Log le début d'une requête API (tag `API`, bleu) |
| `logApiResult(request, status, duration, errorMessage)` | Log le résultat d'une API (vert pour succès, rouge pour erreur) |
| `logRoute(from, to)` | Log les changements de route (tag `ROUTE`, violet) |
| `logClientError(message, file, line)` | Log les erreurs JS (tag `ERREUR`, rouge) |
| `logResourceError(tagName, source)` | Log les échecs de chargement de ressources (tag `ERREUR`, orange) |
| `logInfo(message)` | Log les messages informatifs (tag `INFO`, bleu) |
| `patchHistoryMethod(methodName)` | Wrappe `history.pushState`/`replaceState` pour logger les changements de route |

Écoute aussi les événements : `popstate`, `hashchange`, `error` (JS + ressource), `unhandledrejection`.

---

### Styles

#### `frontend/style.css`

**Rôle :** Feuille de style globale chargée en premier. Importe Google Fonts (Manrope, Plus Jakarta Sans), définit toutes les propriétés CSS custom (`--bg-page`, `--text-main`, `--accent`, etc.), reset CSS, styles de base pour `html`/`body` (dégradés sombres, transitions d'opacité), éléments décoratifs (grille de fond, halos flottants, spotlight), styles de base pour icônes SVG, écran de chargement, transition de page, conteneur principal avec animations d'entrée.

Aucune fonction — CSS pur.

---

#### `frontend/components/layout.css`

**Rôle :** Styles du panneau de contenu principal avec ses dégradés de fond, décorations pseudo-éléments. Styles du header (bouton dropdown, boutons d'action, avatar). Styles de la zone de statut. Implémente le **système de vues** : `.vue` (caché par défaut), `.vue-active`, classes de transition (`.vue-transition-sortie`, `.vue-transition-entree`). Styles spéciaux pour la vue chat et la barre de saisie fixe en mode conversation.

---

#### `frontend/components/views.css`

**Rôle :** Styles pour les vues secondaires (Recherche, Raccourcis). Inclut le header de vue, la boîte de saisie de recherche avec ligne de lueur, le champ de recherche, le bouton d'effacement, les pills de suggestions dynamiques, l'état vide "aucun résultat", la grille de cartes de raccourcis, les éléments de liste génériques.

---

#### `frontend/components/sidebar.css`

**Rôle :** Styles de la sidebar : fond, bordure, blur, logo (dégradé d'icône, pile de texte), navigation, zone d'aide, boutons latéraux avec effet hover sweep shine via `::before`, effet ripple, état actif, section historique avec scroll, liste d'historique, état vide, items d'historique avec barre d'accent gauche.

---

#### `frontend/components/chat-home.css`

**Rôle :** Styles de l'écran d'accueil du chat : section de salutation centrée avec badge ("Assistant interne"), titre, description. Badge de bienvenue avec indicateur animé. Zone de saisie avec glass-morphism et ligne de lueur active. Barre de saisie fixe pour le mode conversation. Boutons d'action (attach, micro avec pulse d'écoute, envoi avec dégradé). Pills de suggestions rapides. Grille de cartes d'action 3 colonnes avec badges, effets hover, overlays en dégradé radial. Classes d'animation staggered.

---

#### `frontend/components/chat-messages.css`

**Rôle :** Styles du fil de conversation avec scrollbar custom. Shells de message (alignement utilisateur/assistant). Article de message complet avec bordures, fonds, ombres, animation d'entrée. Styles spécifiques : message utilisateur (aligné à droite, fond en dégradé), message assistant (aligné à gauche, glass morphism, barre d'accent gauche). Contenu riche dans les messages assistant : titres (h1-h4), paragraphes, listes (ul/ol avec marqueurs d'accent), gras, italique, barré, liens, images, code inline, règles horizontales, questions standalone, tableaux (wrapper, header, lignes, hover), blocs de code (label de langage, fond sombre), citations. Barre d'action de message (visible au hover, pill en verre). Boutons d'action icône.

---

#### `frontend/components/modals.css`

**Rôle :** Styles pour les modales : overlay backdrop avec blur, carte de confirmation, modale audio (header, bouton de fermeture, sélecteur de périphérique, boutons de diagnostic, meters/level audio), modale d'édition (textarea), boutons d'action (primaire, secondaire, danger). Styles pour les vues secondaires, éléments de liste, cartes de diagnostic audio, outlines focus-visible pour l'accessibilité.

---

#### `frontend/components/animations.css`

**Rôle :** Définit toutes les keyframes `@keyframes` utilisées dans l'application.

| Keyframe | Usage |
|---|---|
| `progression-loader` | Barre de chargement 0% à 100% |
| `entree-loader` | Entrée du contenu du loader (opacity, translateY, scale, rotateX 3D, blur) |
| `camera-loader` | Zoom arrière caméra pour la scène du loader |
| `aura-loader` | Lueur radiale scale + fade in |
| `rideau-gauche` / `rideau-droit` | Tirer les rideaux (translateX ±101%) |
| `entree-logo-loader` | Entrée du logo avec rotation et blur |
| `logo-pulse` | Pulse d'échelle subtil sur le logo |
| `balayage-loader` | Effet de lumière qui balaie le loader |
| `apparition-vue` | Apparition simple de vue |
| `bascule-vue-premium` | Switch de vue premium avec blur, scale, translate |
| `revele-lettre` | Révélation lettre par lettre avec blur |
| `revele-texte-loader` | Révélation de texte avec blur |
| `revele-barre-loader` | Révélation de barre avec scale horizontal |
| `apparition-message` | Entrée de bulle de message |
| `apparition-panneau-gauche` | Slide-in sidebar depuis la gauche avec blur |
| `apparition-panneau-principal` | Slide-up panneau principal avec blur |
| `halo-flotte` | Animation flottante des halos ambiants |
| `voile-page` / `lueur-page` | Effets flash de transition de page |
| `ripple-expand` | Effet ripple au clic sur les boutons |
| `pulse-micro` | Pulse du bouton micro pendant l'enregistrement |
| `pulse-sortie` | Pulse de la barre de sortie haut-parleur |
| `typing-dots` | Rebond des trois points de l'indicateur de frappe |
| `reasoning-pulse` | Pulse d'opacité "SYNC reflechit..." |

---

#### `frontend/components/responsive.css`

**Rôle :** Contient trois sections majeures :

1. **Breakpoints responsives** (max-width: 960px et 640px) : Empilement vertical du layout, réduction de la sidebar, réorganisation des cartes en colonne unique, ajustement des paddings et tailles de police.

2. **Override visuel "version chat propre"** : Bloc massif de surcharges CSS qui re-thématise toute l'application vers une apparence plus minimaliste façon ChatGPT en redéfinissant les variables `:root` et en surchargeant presque tous les composants (supprime les décorations, simplifie les boutons, aplatit les ombres).

3. **Accessibilité `prefers-reduced-motion`** : Désactive TOUTES les animations et transitions, force les éléments `.animable` à être visibles.

---

## Architecture globale

```
Projet-Gymshark---Sync/
├── backend/                     # Serveur Node.js Express (ESM)
│   ├── server.js                # Point d'entrée Express
│   ├── logger.js                # Logging structuré (chalk + morgan)
│   ├── system_prompt            # Fichier texte du system prompt
│   ├── config/
│   │   ├── prompt.js            # Chargeur de system prompt avec cache mtime
│   │   └── swagger.js           # Spécification OpenAPI 3.0.3
│   ├── routes/
│   │   └── chat.js              # Router Express : POST /api/chat (SSE), CRUD conversations, health, test-stream
│   └── services/
│       ├── llm.js               # Sélecteur de fournisseur LLM (ollama | opencode)
│       ├── ollama.js            # Service Ollama : streaming, timeout, health
│       ├── opencode.js          # Service OpenCode : streaming, reasoning, health
│       └── history.js           # Persistance JSON (data/conversations.json)
│
└── frontend/                    # SPA Vanilla HTML/CSS/JS
    ├── index.html               # Page HTML unique
    ├── app.js                   # Point d'entrée ES module
    ├── style.css                # Variables CSS, reset, base
    ├── logger.client.js         # Logging structuré côté navigateur
    ├── constants/
    │   └── config.js            # API_BASE, STORAGE_KEYS, dom, state
    ├── services/
    │   ├── chat.js              # Envoi SSE, parsing, streaming temps réel
    │   ├── history.js           # Historique sidebar (CRUD conversations)
    │   ├── speech.js            # Reconnaissance vocale (Web Speech API)
    │   ├── audio.js             # Diagnostic audio (micro + haut-parleur)
    │   └── search.js            # Vue recherche avec suggestions et filtrage
    ├── components/
    │   ├── bindings.js          # Orchestration : event listeners, animations, bootstrap
    │   ├── feedback.js          # Feedback UI : status bar, transitions de vues
    │   ├── input.js             # Gestion des inputs, injection de prompt, reset
    │   ├── input-sync.js        # Synchronisation des inputs et brouillons
    │   ├── message-dom.js       # Construction DOM des messages, snapshots
    │   ├── message-actions.js   # Barre d'action (copie, édition) au hover
    │   ├── modals.js            # Modales de confirmation et d'édition
    │   ├── animations.css       # Toutes les keyframes @keyframes
    │   ├── chat-home.css        # Styles écran d'accueil chat
    │   ├── chat-messages.css    # Styles fil de conversation
    │   ├── layout.css           # Layout principal, header, vues
    │   ├── modals.css           # Styles des modales
    │   ├── responsive.css       # Breakpoints + override visuel + reduced-motion
    │   ├── sidebar.css          # Styles sidebar
    │   └── views.css            # Styles vues secondaires (recherche, raccourcis)
    └── utils/
        ├── markdown.js          # Parser markdown custom pour réponses assistant
        └── storage.js           # Wrapper sessionStorage

```

### Flux de données pour une requête de chat

```
Frontend                                    Backend
───────                                     ───────
1. sendMessage()                        
   → validation du texte
   → appendMessage(user, texte) au DOM   
   → sendAndStream(texte)               
                                         
2. fetch POST /api/chat ───────────────→  3. routes/chat.js
   { message, conversationId }              → resolveConversationId()
                                            → loadConversationHistory()
                                            → trimHistory()
                                            → buildPromptFromHistory()
                                            → setupSSEHeaders()
                                         
4. SSE stream ←──────────────────────────  5. llm.js → ollama.js / opencode.js
   data: {"type":"meta",...}                   → fetch Ollama/OpenCode
   data: "Bonjour"                             → stream chunks via onChunk
   data: " comment"                         
   data: " vas-tu ?"                       
   data: [DONE]                           → saveUpdatedHistory()
                                         
6. processSSEEventBlock()                
   → mise à jour DOM assistant           
7. refreshHistory()                      
   → sidebar mise à jour                 
```

---
