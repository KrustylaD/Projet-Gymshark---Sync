# 🎯 Mon plan Backend — Ce que j'ai à faire

## S1 J1 — Init du projet

- [ ] Créer le repo GitHub
- [ ] Créer la structure de dossiers
- [ ] `cd backend` → `npm init -y`
- [ ] `npm install express cors`
- [ ] Créer `server.js` → Express sur le port 3000
- [ ] Tester : `node server.js` → le serveur démarre

✅ **Fini quand** : le serveur démarre sans erreur

---

## S1 J2 — Route API

- [ ] Créer `routes/chat.js`
- [ ] Créer une route POST `/api/chat`
- [ ] Elle répond `{ reply: "Réponse test" }` pour l'instant
- [ ] Brancher la route dans `server.js`
- [ ] Tester avec Postman → recevoir la réponse test

✅ **Fini quand** : Postman reçoit la réponse test

---

## S1 J3 — Connexion Ollama

- [ ] Installer Ollama sur ton PC (ollama.com)
- [ ] Télécharger le modèle : `ollama pull mistral`
- [ ] Tester en terminal : `ollama run mistral`
- [ ] Dans `chat.js` : faire un fetch vers Ollama
- [ ] Tester avec Postman → l'IA répond vraiment

✅ **Fini quand** : l'IA répond via ton API

---

## S1 J4 — Prompt système + historique

- [ ] Créer `config/prompt.js` avec le texte du rôle de l'IA
- [ ] Injecter ce prompt avant chaque message
- [ ] Créer un tableau historique en mémoire
- [ ] Envoyer l'historique complet à chaque requête
- [ ] Tester avec 2 questions liées → l'IA se souvient

✅ **Fini quand** : l'IA garde le contexte

---

## S1 J5 — Merge

- [ ] Récupérer le code de P2 et P3
- [ ] Assembler `frontend/` et `backend/`
- [ ] Vérifier le CORS dans `server.js`
- [ ] Tester de bout en bout : ouvrir le site → l'IA répond
- [ ] Fix les bugs

✅ **Fini quand** : le site marche complètement

---

## S2 J1 — Gestion d'erreurs

- [ ] Si Ollama est éteint → message d'erreur propre
- [ ] Si message vide → réponse d'erreur
- [ ] Ajouter un timeout de 30 secondes
- [ ] Mettre des try/catch partout
- [ ] Tester en coupant Ollama → le serveur ne crash pas

✅ **Fini quand** : rien ne fait crasher le serveur

---

## S2 J2 — Merge final

- [ ] Merge le code de tout le monde
- [ ] Tester ensemble
- [ ] Fix les derniers bugs

---

## S2 J3-J5 — Soutenance

- [ ] Préparer ma partie : expliquer le backend
- [ ] Préparer la démo live
- [ ] Répéter la présentation

---

## 📦 Ce que je donne à P2 dès J2

- [ ] Lui donner l'URL de l'API : `POST http://localhost:3000/api/chat`
- [ ] Lui expliquer le format : envoie `{ message: "..." }` → reçoit `{ reply: "..." }`
