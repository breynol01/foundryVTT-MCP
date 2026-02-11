# foundryVTT-MCP

Railway-ready proxy service for Foundry VTT LLM workflows. This service accepts requests from a Foundry module and forwards them to OpenAI Responses API, keeping API keys on the server side.

## Foundry module (client)

The `foundry-mcp/` directory contains a minimal Foundry VTT module that stores proxy settings and provides a JSON import dialog for creating Foundry documents from Codex output.

### Install (manifest URL)

1. Create a GitHub release that includes a zip named `foundry-mcp.zip` containing the `foundry-mcp/` folder at the top level.
2. Upload the module manifest as `module.json` (use `foundry-mcp/module.json`).
3. Install in Foundry using the manifest URL:

```
https://github.com/breynol01/foundryVTT-MCP/releases/latest/download/module.json
```

### Build the module zip

```
./scripts/build-module.sh
```

This writes `dist/foundry-mcp.zip` and `dist/module.json` for release uploads.

### Release checklist

1. Update version in `foundry-mcp/module.json`.
2. Commit and push changes.
3. Create a GitHub release (tagged). The workflow will build and attach:
   - `dist/foundry-mcp.zip`
   - `dist/module.json`
4. Install using the manifest URL:

```
https://github.com/breynol01/foundryVTT-MCP/releases/latest/download/module.json
```

### Usage (MVP)

- Configure **Runner URL** and **Runner Token** in Foundry module settings.
- Open **Prompt Panel** to send a prompt to the runner and import returned JSON.
- Or open **Import JSON** to paste payloads manually.
- Paste a payload like:

```
{
  "documents": [
    {
      "type": "JournalEntry",
      "data": { "name": "MCP Journal", "content": "<p>Hello from Codex.</p>" }
    }
  ]
}
```

### Local MCP + Cloudflare Tunnel (no Railway)

If you run your MCP server locally, you can expose it to Forge using a tunnel.

1. Start your MCP server locally (port `8787` assumed).
2. Start the tunnel:

```
./scripts/start-tunnel.sh
```

3. Copy the public URL printed by `cloudflared`.
4. Set **Runner URL** in Foundry to that public URL.
5. Set **Runner Token** to the same token your MCP server expects in `X-Foundry-Runner-Token`.

## Obsidian agent (local)

The `obsidian-agent/` directory contains a local service that scans your Obsidian vault and returns Foundry payloads.

### Obsidian agent setup

```bash
cd obsidian-agent
npm install
npm start
```

### Obsidian agent environment variables

- `VAULT_PATH` (required): Absolute path to your Obsidian vault.
- `RUNNER_TOKEN` (required): Shared secret sent in `X-Foundry-Runner-Token`.
- `PORT` (optional): Default `8790`.

### Obsidian payload endpoint

`POST /v1/payload` returns a Foundry payload based on frontmatter in your notes.

```json
{
  \"paths\": [\"NPCs/Gandrel.md\"],
  \"type\": \"npc\"
}
```

### Foundry prompt panel (Obsidian)

Select provider **obsidian** in the prompt panel and optionally set paths/type to fetch payloads from the local agent.

## Runner service (CLI)

The `runner/` directory contains a Railway-hosted runner that invokes Codex/Claude CLIs and returns Foundry JSON payloads.

### Runner setup

```bash
cd runner
npm install
npm start
```

### Runner CLI installs

The runner executes installed CLIs. You can install these globally or use the provided Dockerfile.

- Codex CLI: `npm i -g @openai/codex`
- Claude CLI: `npm i -g @anthropic-ai/claude-code`

### Runner environment variables

- `RUNNER_TOKEN` (required): Shared secret sent in `X-Foundry-Runner-Token`.
- `ALLOWED_ORIGINS` (optional): Comma-separated list of allowed browser origins for CORS.
- `REQUEST_TIMEOUT_MS` (optional): Request timeout in ms (default: `60000`).
- `MAX_OUTPUT_BYTES` (optional): Max stdout+stderr bytes (default: `1000000`).
- `MAX_PROMPT_CHARS` (optional): Max prompt length (default: `8000`).
- `MAX_COST_USD` (optional): Cost ceiling (default: `0.5`).
- `COST_PER_1K_TOKENS_CODEX` / `COST_PER_1K_TOKENS_CLAUDE` (optional): Cost estimation.
- `TOKEN_CHARS_PER_TOKEN` (optional): Token estimate divisor (default: `4`).
- `CODEX_COMMAND` / `CLAUDE_COMMAND` (optional): CLI command names.
- `CODEX_ARGS` / `CLAUDE_ARGS` (optional): Args list. Use `{{prompt}}` to inline the prompt or omit to send via stdin. Use `{{model}}` to substitute the model.

### Railway deploy (runner)

Use `runner/Dockerfile` as the service build to ensure the CLIs are installed in the image.

## Setup

```bash
npm install
npm start
```

### Environment variables

- `PROXY_TOKEN` (required): Shared secret that the Foundry module sends in `X-Foundry-Proxy-Token`.
- `OPENAI_API_KEY` (required): OpenAI API key stored on the Railway service.
- `OPENAI_BASE_URL` (optional): Override OpenAI base URL.
- `DEFAULT_MODEL` (optional): Default model name (default: `gpt-4o-mini`).
- `PORT` (optional): Port to listen on (default: `3000`).
- `ALLOWED_ORIGINS` (optional): Comma-separated list of allowed browser origins for CORS.
- `REQUEST_TIMEOUT_MS` (optional): Request timeout in ms (default: `30000`).
- `MAX_PROMPT_CHARS` (optional): Maximum prompt size in characters (default: `8000`).
- `RATE_LIMIT_WINDOW_MS` (optional): In-memory rate-limit window (default: `60000`).
- `RATE_LIMIT_MAX_REQUESTS` (optional): Max requests per client/IP per window (default: `30`). Set `0` to disable.
- `TOKEN_CHARS_PER_TOKEN` (optional): Char-to-token estimate divisor for budget checks (default: `4`).
- `MAX_ESTIMATED_TOKENS` (optional): Reject requests above estimated input+output token total. Set `0` to disable.
- `MAX_ESTIMATED_COST_USD` (optional): Reject requests above estimated cost. Set `0` to disable.
- `COST_PER_1K_TOKENS_USD` (optional): Cost estimate input used with `MAX_ESTIMATED_COST_USD`.

## Request example

```bash
curl -X POST https://your-railway-app.up.railway.app/v1/generate \
  -H "Content-Type: application/json" \
  -H "X-Foundry-Proxy-Token: your-shared-token" \
  -d '{
    "taskType": "npc",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "system": "You are a helpful RPG assistant.",
    "prompt": "Create a level 3 NPC bard with a secret.",
    "options": {
      "temperature": 0.7,
      "maxTokens": 800,
      "responseFormat": "json"
    }
  }'
```

## Health check

```bash
curl https://your-railway-app.up.railway.app/health
```

## Provider info

```bash
curl https://your-railway-app.up.railway.app/v1/providers
```
