# foundryVTT-MCP

Railway-ready proxy service for Foundry VTT LLM workflows. This service accepts requests from a Foundry module and forwards them to OpenAI, keeping API keys on the server side.

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
