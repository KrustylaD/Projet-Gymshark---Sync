# AGENTS.md — Gymshark Sync

## Project overview

Two independent apps, no shared tooling:
- **`backend/`** — Node.js Express server (ESM), SSE streaming to Ollama LLM
- **`frontend/`** — Vanilla HTML/CSS/JS SPA, served as static files

Backend depends on a **running Ollama instance** (default `http://localhost:11434`, model `phi3:mini`).

## Quick start

```bash
./start_project.sh   # auto-starts Ollama, backend, frontend
```

Manual:
```bash
cd backend && cp .env.example .env && npm install && npm start   # → :3000
cd frontend && python3 -m http.server 8080                       # → :8080
```

## Environment

Copy `backend/.env.example` to `backend/.env` before first run. `.env` is gitignored.

| Variable | Default |
|---|---|
| `OLLAMA_URL` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `phi3:mini` |
| `OLLAMA_TIMEOUT` | `60000` (inactivity timeout, ms) |
| `PORT` | `3000` |

## Commands

```bash
cd backend && npm test
```

Tests use Node 18+ native `fetch`. All test files live under `backend/__tests__/`.

## Architecture notes

- **ESM modules**: `package.json` has `"type": "module"`. All imports use `.js` extensions.
- **SSE streaming**: `POST /api/chat` returns `text/event-stream`. The first SSE event is a `meta` JSON with `conversationId`. Stream ends with `data: [DONE]`.
- **System prompt**: loaded from `backend/system_prompt` (plain text file). Cached by mtime. If unreadable, the service continues with an empty prompt — no crash.
- **History**: `MAX_HISTORY_TURNS = 8` (last 8 user/assistant pairs). Persisted to `data/conversations.json` (gitignored, auto-created).
- **Ollama service**: prepends system prompt to every user message before sending to Ollama. Supports both native `fetch` (Node 18+) and `node-fetch` fallback.
- **Frontend**: hardcodes `API_BASE = 'http://localhost:3000'` in `frontend/app.js:9`. Has a 2-second artificial delay before starting SSE read (for typing indicator visibility).

## Testing quirks

- Jest runs with `--experimental-vm-modules` flag (required for ESM).
- Mocking ESM modules uses `jest.unstable_mockModule()` — see existing tests for the pattern.
- **Module-level state reset**: any test that relies on module-level variables (e.g. the prompt cache in `config/prompt.js`) MUST use `jest.resetModules()` followed by a fresh dynamic `import()` — the `freshImport()` utility in tests is the canonical pattern.
- Route tests (`chat.test.js`) spin up a real Express server on port 0 (OS-assigned) — no supertest needed.

## Package manager ambiguity

`backend/` contains both `package-lock.json` (npm) and `pnpm-lock.yaml` (pnpm). The `start_project.sh` script uses `npm install`. Prefer `npm` for consistency unless the team has standardized on pnpm.
