# Foundry MCP Module

Minimal client-only Foundry VTT module that connects to the MCP proxy and imports JSON payloads into Foundry documents.

## Settings
- **Proxy URL**: Base URL of the proxy (e.g., `https://your-app.up.railway.app`).
- **Proxy Token**: Shared secret sent in `X-Foundry-Proxy-Token`.

## Import Payload Schema (MVP)
Paste JSON into the Import dialog using the following shapes.

### Single document
```json
{
  "document": {
    "type": "JournalEntry",
    "data": {
      "name": "MCP Journal",
      "content": "<p>Hello from Codex.</p>"
    }
  }
}
```

### Multiple documents
```json
{
  "documents": [
    {
      "type": "Item",
      "data": { "name": "MCP Potion", "type": "consumable" }
    },
    {
      "type": "JournalEntry",
      "data": { "name": "MCP Notes", "content": "<p>Notes...</p>" }
    }
  ]
}
```

### Create compendium then add documents
```json
{
  "compendiums": [
    {
      "name": "mcp-items",
      "label": "MCP Items",
      "type": "Item",
      "package": "world"
    }
  ],
  "documents": [
    {
      "type": "Item",
      "pack": "world.mcp-items",
      "data": { "name": "MCP Sword", "type": "weapon" }
    }
  ]
}
```

## Notes
- `type` should match Foundry document types (e.g., `JournalEntry`, `Item`, `Actor`, `Scene`).
- `data` should match the document schema for that type.
- `pack` must be the full pack key (e.g., `world.mcp-items`).
