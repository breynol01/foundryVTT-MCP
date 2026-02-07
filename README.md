# foundryVTT-MCP

Railway-ready proxy service for Foundry VTT LLM workflows. This service accepts requests from a Foundry module and forwards them to OpenAI, keeping API keys on the server side.

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

- Configure **Proxy URL** and **Proxy Token** in Foundry module settings.
- Open **Import JSON** from the module settings menu.
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
