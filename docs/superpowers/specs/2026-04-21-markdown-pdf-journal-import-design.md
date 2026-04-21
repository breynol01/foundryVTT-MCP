# Markdown & PDF to Journal Entry Import

## Context

The foundryVTT-MCP project has an obsidian-agent that scans an Obsidian vault and emits Foundry-compatible payloads. Currently, markdown content is HTML-escaped and wrapped in `<pre>` tags — no real rendering. PDFs are not supported at all. This spec adds proper markdown rendering (including Obsidian-flavored syntax) and PDF parsing with image extraction, so vault content arrives in Foundry as rich journal entries.

## Scope

- **Source:** Obsidian vault only (files under `VAULT_PATH`)
- **Markdown:** CommonMark + Obsidian extensions (wikilinks, callouts, embeds)
- **PDF:** Text extraction + page image rendering, extracted images saved to Foundry's data directory
- **Target:** JournalEntry documents in Foundry VTT

## Architecture

All changes extend the existing obsidian-agent and Foundry module. No new services.

```
Obsidian Vault (.md, .pdf)
        │
   obsidian-agent
   ├── src/markdown.js   ← NEW: markdown→HTML rendering
   ├── src/pdf.js         ← NEW: PDF text + image extraction
   └── src/index.js       ← MODIFIED: walk both file types, use new modules
        │
   JSON payload { documents, assets }
        │
   Foundry module (foundry-mcp.js)
   └── importPayload()    ← MODIFIED: upload assets before creating documents
```

## Obsidian-Agent Changes

### 1. Markdown Rendering (`obsidian-agent/src/markdown.js`)

**New file.** Exports `renderMarkdown(content): string`.

- Uses `marked` for CommonMark→HTML
- Custom `marked` extensions for Obsidian syntax:
  - `[[Page Name]]` → `<a class="foundry-mcp-wikilink" data-target="Page Name">Page Name</a>`
  - `[[Page Name|Display Text]]` → `<a class="foundry-mcp-wikilink" data-target="Page Name">Display Text</a>`
  - `> [!note]`, `> [!warning]`, `> [!tip]`, etc. → `<div class="foundry-mcp-callout callout-{type}"><p class="callout-title">{Type}</p>...content...</div>`
  - `![[Embed Name]]` → `<div class="foundry-mcp-embed" data-target="Embed Name">[Embedded: Embed Name]</div>`

**Dependency:** `marked` (add to package.json)

### 2. PDF Parsing (`obsidian-agent/src/pdf.js`)

**New file.** Exports `parsePdf(filePath): { html: string, images: Asset[] }`.

- Uses `pdfjs-dist` for text extraction and page rendering
- Text extraction: iterates pages, extracts text items, joins into paragraphs, wraps in `<h2>Page N</h2>` sections
- Image extraction: renders each page to canvas (via `canvas` npm package for Node), exports as PNG buffer
- Returns images as `{ filename: "<basename>-page-N.png", buffer: Buffer }`
- Image placeholders in HTML: `<img src="__ASSET__/<basename>-page-N.png" />`

**Dependencies:** `pdfjs-dist`, `canvas` (add to package.json)

**Note:** The `canvas` package requires native build tools (Python 3, C++ compiler). If this causes deployment issues, we can fall back to extracting embedded images directly from the PDF structure (pdfjs-dist can enumerate image objects per page) instead of rendering full pages to canvas. Text extraction works without `canvas`.

### 3. File Walker & Payload Changes (`obsidian-agent/src/index.js`)

- Rename `walkMarkdownFiles` → `walkFiles`
- Walk picks up both `.md` and `.pdf` files
- `loadPayload` dispatches to `renderMarkdown()` or `parsePdf()` based on extension
- PDF sidecar metadata: if `<filename>.yml` exists next to a PDF, parse it for `title`, `type`, `compendium`, `foundryId` (same fields as markdown frontmatter)
- Response payload gains an `assets` array:
  ```json
  {
    "documents": [...],
    "assets": [
      {
        "filename": "dragon-lair-page-1.png",
        "data": "<base64>",
        "folder": "foundry-mcp/imports/Dragon Lair"
      }
    ]
  }
  ```

## Foundry Module Changes (`foundry-mcp/scripts/foundry-mcp.js`)

### `importPayload()` — Asset Upload Step

Before creating documents:

1. Check if `payload.assets` exists and has entries
2. For each asset:
   - Decode base64 data to a `File` object
   - Call `FilePicker.upload("data", asset.folder, file)` to save to Foundry's data directory
   - Record the resulting file path
3. In each document's `content` HTML, replace `__ASSET__/<filename>` placeholders with the actual Foundry file paths
4. Proceed with existing document creation flow

### Asset Folder Convention

Images are saved to `Data/foundry-mcp/imports/<journal-entry-name>/` to avoid filename collisions between different imports.

## Payload Format

### Current

```json
{
  "documents": [
    {
      "type": "JournalEntry",
      "data": { "name": "Session Notes", "content": "<pre>escaped markdown</pre>" }
    }
  ]
}
```

### New

```json
{
  "documents": [
    {
      "type": "JournalEntry",
      "data": { "name": "Session Notes", "content": "<h1>Session Notes</h1><p>Rendered HTML...</p>" }
    }
  ],
  "assets": [
    {
      "filename": "dragon-map-page-1.png",
      "data": "iVBORw0KGgo...",
      "folder": "foundry-mcp/imports/Dragon Map"
    }
  ]
}
```

Backward compatible — `assets` is optional. Existing payloads without it work unchanged.

## PDF Sidecar Metadata

Optional YAML file alongside a PDF to control import behavior:

```yaml
# dragon-lair.yml (next to dragon-lair.pdf)
title: The Dragon's Lair
type: journal
compendium: world.campaign-locations
```

If no sidecar exists, defaults: `name` = filename without extension, `type` = JournalEntry, no compendium.

## Verification

1. **Markdown rendering:**
   - Create a test `.md` file in the vault with headings, bold, links, wikilinks, callouts
   - Hit `POST /v1/payload` and verify the response contains rendered HTML (not `<pre>` wrapped)
   - Import into Foundry and confirm the journal entry displays rich formatting

2. **PDF import:**
   - Place a test PDF in the vault
   - Hit `POST /v1/payload` and verify the response contains HTML text content + `assets` array with base64 PNGs
   - Import into Foundry, confirm journal entry has text content and images load from the data directory

3. **Backward compatibility:**
   - Existing `.md` files with frontmatter still import correctly
   - Payloads without `assets` still work in the Foundry module

4. **Edge cases:**
   - Large PDF (50+ pages) — verify `MAX_CONTENT_CHARS` and `MAX_FILES` limits are respected
   - PDF with no extractable text (scanned/image-only) — produces page images but minimal text
   - Markdown with deeply nested Obsidian syntax — renders without errors
