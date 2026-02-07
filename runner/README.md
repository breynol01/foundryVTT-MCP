# Foundry MCP Runner

Railway-hosted service that runs Codex and Claude CLIs, returning Foundry-ready JSON payloads.

## Install & Run

```bash
npm install
npm start
```

## Environment

Required:
- `RUNNER_TOKEN` – shared secret sent in `X-Foundry-Runner-Token`.

CLI auth (set according to your CLI):
- `OPENAI_API_KEY` – for Codex CLI.
- `ANTHROPIC_API_KEY` – for Claude CLI.

Optional guardrails:
- `REQUEST_TIMEOUT_MS` (default `60000`)
- `MAX_OUTPUT_BYTES` (default `1000000`)
- `MAX_PROMPT_CHARS` (default `8000`)
- `MAX_COST_USD` (default `0.5`)
- `COST_PER_1K_TOKENS_CODEX` / `COST_PER_1K_TOKENS_CLAUDE`
- `TOKEN_CHARS_PER_TOKEN` (default `4`)

CLI configuration:
- `CODEX_COMMAND` / `CLAUDE_COMMAND` (defaults: `codex`, `claude`)
- `CODEX_ARGS` / `CLAUDE_ARGS` – JSON array or space-separated args. Use `{{prompt}}` to inline the prompt, or omit it to send prompt via stdin. Use `{{model}}` to insert model.

## Docker (Railway)

Use the Dockerfile in this folder for Railway if you want to install the CLIs in the image.

## CLI installs

- Codex CLI: `npm i -g @openai/codex`
- Claude CLI: `npm i -g @anthropic-ai/claude-code`
