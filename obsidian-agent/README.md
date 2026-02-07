# Obsidian Agent

Local agent that scans an Obsidian vault and produces Foundry-ready payloads.

## Install & Run

```bash
npm install
npm start
```

## Environment

Required:
- `VAULT_PATH` – absolute path to your Obsidian vault.
- `RUNNER_TOKEN` – shared secret sent in `X-Foundry-Runner-Token`.

Optional:
- `PORT` (default `8790`)
- `ALLOWED_ORIGINS` (CORS allowlist)
- `MAX_FILES` (default `500`)
- `MAX_CONTENT_CHARS` (default `20000`)

## Payload Endpoint

`POST /v1/payload`

Body:
```json
{
  "paths": ["NPCs/Gandrel.md"],
  "type": "npc"
}
```

- `paths` are relative to `VAULT_PATH`.
- `type` filters on frontmatter `type`.

## Frontmatter Conventions (MVP)

```yaml
---
type: npc
name: Gandrel
foundryId: abc123
compendium: world.mcp-npcs
---
```

Supported `type` values:
- `npc` / `actor`
- `item`
- `journal`

Note content is embedded as HTML inside `<pre>` for safety.
