# Repository Guidelines

## Project Structure & Module Organization
This repo is a small Node.js proxy for Foundry VTT LLM workflows.
- `src/index.js` – Express server with the API routes and OpenAI proxy logic.
- `runner/` – Railway-hosted CLI runner (Codex/Claude) for prompt execution.
- `foundry-mcp/` – Foundry VTT module (client) with prompt panel and import dialog.
- No dedicated `tests/` or `assets/` directories yet; add them when the project grows.

If you add modules, keep feature groupings under `src/` (e.g., `src/routes/`, `src/services/`).

## Build, Test, and Development Commands
- `npm install` – install dependencies.
- `npm start` – run the proxy (uses `node src/index.js`).

Node 18+ is required (see `package.json`). There is no build step or test runner committed; if you add tooling, document new commands here.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (match `src/index.js`).
- Naming: `camelCase` for variables/functions, `PascalCase` for classes, `kebab-case` for filenames.
- Prefer small, single-purpose helpers (e.g., request validation, auth, normalization).

If you introduce a formatter or linter (Prettier/ESLint), add configs at the repo root and treat them as source of truth.

## Testing Guidelines
No tests are currently configured. When adding tests:
- Create a `tests/` directory.
- Use `*.test.js` naming.
- Document the runner (e.g., `npm test`), and any required env vars.

## Commit & Pull Request Guidelines
Git history uses concise, imperative messages (e.g., “Harden proxy with CORS…”). Keep commits scoped and readable.
PRs should include:
- Summary of changes
- Testing notes (even if “not run”)
- Any relevant logs or screenshots for behavior changes

## Security & Configuration Tips
This service depends on environment variables:
- `PROXY_TOKEN` – required for request auth.
- `OPENAI_API_KEY` – required for upstream calls.
- Optional: `OPENAI_BASE_URL`, `DEFAULT_MODEL`, `ALLOWED_ORIGINS`, `REQUEST_TIMEOUT_MS`, `MAX_PROMPT_CHARS`.

Do not commit secrets. Provide examples in `.env.example` if you add local config.

## API Surface (Quick Reference)
- `POST /v1/generate` – main generation endpoint for Foundry module requests.
- `GET /v1/providers` – provider/model metadata.
- `GET /health` – health check.

## Agent-Specific Instructions
Keep this document updated as structure, commands, and tooling evolve.
