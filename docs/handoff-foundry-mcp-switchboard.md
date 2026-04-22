# Handoff: Foundry MCP Server + Switchboard Integration

**Goal:** Wire the Foundry VTT MCP server into the OpenClaw MCP switchboard so that a Claude Code session can read Obsidian Honkonomicon vault notes and create them as journal entries in Foundry on The Forge.

---

## Current State (verified 2026-04-21)

### What exists

| Component | Path | Status |
|---|---|---|
| REST proxy (OpenAI relay) | `foundryVTT-MCP/src/index.js` | Exists, Express, port 3000 |
| Foundry module (client) | `foundryVTT-MCP/foundry-mcp/` | Exists, installed in Forge world |
| Obsidian vault scanner | `foundryVTT-MCP/obsidian-agent/src/index.js` | Exists, Express, port 8790 |
| MCP switchboard | `~/Documents/Codex/mcp-switchboard/` | Live, routing 6 servers |
| Honkonomicon vault | `~/Documents/Obsidian/Honkonomicon/` | Exists, structured |

### What does NOT exist

- An MCP server (Model Context Protocol) for Foundry — **this is the missing piece**
- A "push to Foundry" pathway — current architecture is **Foundry pulls** from the proxy
- `foundry` entry in `~/.config/opencode/opencode.json`
- `foundry` in `SWITCHBOARD_INCLUDE` in `~/.openclaw/openclaw.json`

---

## Architecture

### Current flow (Foundry pulls)
```
Foundry module → HTTP POST /v1/payload → obsidian-agent → returns JSON → Foundry imports
```

### Target flow (MCP pushes)
```
Claude (via switchboard) → foundry MCP server → Forge REST API → creates JournalEntry in world
```

The new MCP server is a **push** model: it uses The Forge's REST API to create documents directly, rather than waiting for Foundry to pull.

---

## What Needs to Be Built

### 1. New MCP server: `foundryVTT-MCP/mcp-server/`

A Node.js service using `@modelcontextprotocol/sdk` (stdio transport) that exposes these tools:

#### Tool: `foundry_read_obsidian_notes`
- Input: `paths` (string[], optional), `filter_type` (string, optional: `"journal"`, `"actor"`, etc.)
- Behavior: reads `.md` files from `~/Documents/Obsidian/Honkonomicon/`, parses frontmatter, returns file list with content
- Implementation: reuse logic from `obsidian-agent/src/index.js` (gray-matter, walkVaultFiles) — but as a function, not HTTP

#### Tool: `foundry_create_journal_entries`
- Input: `documents` (array of `{ name, content, folder? }`)
- Behavior: calls The Forge REST API to create JournalEntry documents in the active world
- Returns: created document IDs

#### Tool: `foundry_list_journals`
- Input: none
- Behavior: queries Forge API for existing JournalEntry list in world
- Returns: array of `{ id, name }`

### 2. Forge API connectivity

The Forge exposes Foundry's REST API at:
```
https://forge-vtt.com/api/
```
or via the game URL (e.g., `https://{userId}.forge-vtt.com`).

**Auth:** The Forge API key — check 1Password (Tantalus vault). If not there, generate one at forge-vtt.com → Account → API Key.

Foundry v13 REST API endpoints used:
- `POST /api/document/JournalEntry` — create journal entry
- `GET /api/document/JournalEntry` — list journal entries

The `foundry-mcp` module (already installed in the world) exposes `window.FoundryMCP.importPayload()` as a fallback but the REST API is the cleaner path from outside.

### 3. Register in opencode.json

Add to `~/.config/opencode/opencode.json` under `mcp`:

```json
"foundry": {
  "command": ["node", "/Users/benjaminreynolds/Documents/Codex/foundryVTT-MCP/mcp-server/dist/server.js"],
  "enabled": true,
  "environment": {
    "FORGE_API_KEY": "op://Tantalus/The Forge/api_key",
    "FORGE_GAME_URL": "op://Tantalus/The Forge/game_url"
  },
  "type": "local"
}
```

### 4. Add to switchboard SWITCHBOARD_INCLUDE

In `~/.openclaw/openclaw.json`, update the `mcp-switchboard` entry:
```
"SWITCHBOARD_INCLUDE": "context7,fabric-lakehouse-files,foundry,google-mcp,mgrep,pencil,powerbi-semantic-model"
```

Same update in `~/.config/opencode/opencode.json` → `mcp.mcp-switchboard.environment.SWITCHBOARD_INCLUDE`.

---

## Honkonomicon Vault Structure

```
~/Documents/Obsidian/Honkonomicon/
├── 00_Campaign/
├── 00_System/
├── 01_Sessions/
├── 02_PCs/
├── 03_NPCs/
├── 04_Locations/
├── 05_Factions/
├── 06_Quests/
├── 07_Items/
├── 08_Monsters/
├── 09_Rules/
├── 10_Maps_Assets/
├── 11_Reference/
├── AGENTS.md
└── MEMORY.md
```

Notes use standard Markdown with optional YAML frontmatter. The obsidian-agent already maps frontmatter `type:` to Foundry document types.

---

## Implementation Plan

**Repo:** `~/Documents/Codex/foundryVTT-MCP/`  
**New directory:** `mcp-server/`

```
mcp-server/
  package.json          (@modelcontextprotocol/sdk, node-fetch)
  src/
    server.ts           entry point, stdio MCP server
    tools/
      readObsidian.ts   read vault notes (port logic from obsidian-agent)
      createJournals.ts push to Forge REST API
      listJournals.ts   query Forge REST API
    forge-api.ts        thin wrapper for Forge REST calls (auth, base URL)
  tsconfig.json
  dist/                 compiled output
```

**Build command:** `npm run build` → `tsc`  
**Run command:** `node dist/server.js` (stdio, no port)

---

## Pre-flight Checklist for the Implementing Session

- [ ] Confirm The Forge API key is in 1Password (Tantalus vault → "The Forge")
- [ ] Confirm `foundry-mcp` module is enabled in the active Forge world
- [ ] Confirm Foundry v13 REST API is accessible (test: `GET {game_url}/api/` with API key)
- [ ] Build and smoke-test the MCP server locally before registering
- [ ] After registration, run `switchboard.search("foundry")` to verify routing

---

## 1Password References

- Forge API key: look for "The Forge" or "forge-vtt.com" in Tantalus vault
- Proxy token: `foundryVTT-MCP` project uses `PROXY_TOKEN` — may be in Tantalus vault as well

---

## Related Files

- `foundryVTT-MCP/AGENTS.md` — project governance
- `foundryVTT-MCP/obsidian-agent/src/index.js` — vault walker logic to reuse
- `foundryVTT-MCP/foundry-mcp/scripts/foundry-mcp.js` — module API surface (importPayload pattern)
- `~/.config/opencode/opencode.json` — MCP registry
- `~/.openclaw/openclaw.json` — OpenClaw MCP config + SWITCHBOARD_INCLUDE
- `~/Documents/Codex/mcp-switchboard/` — switchboard source (reference for how other servers are registered)
