# Project Memory

## 2026-02-11
- Proxy `POST /v1/generate` now calls OpenAI `POST /v1/responses` instead of `chat/completions`.
- Added in-memory request throttling in `src/index.js` controlled by `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`.
- Added estimated token/cost request gating in `src/index.js` using `TOKEN_CHARS_PER_TOKEN`, `MAX_ESTIMATED_TOKENS`, `MAX_ESTIMATED_COST_USD`, and `COST_PER_1K_TOKENS_USD`.
- README environment variable docs were updated to include new throttling and budget controls.
