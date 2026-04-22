import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readObsidianSchema, readObsidianNotes } from "./tools/readObsidian.js";
import { createJournalsSchema, buildImportPayload } from "./tools/createJournals.js";
import { listJournalsSchema, LIST_JOURNALS_UNAVAILABLE } from "./tools/listJournals.js";

const VAULT_PATH = process.env.VAULT_PATH || "";
const parsedMaxFiles = parseInt(process.env.MAX_FILES || "500", 10);
const parsedMaxContent = parseInt(process.env.MAX_CONTENT_CHARS || "20000", 10);
const MAX_FILES = Number.isNaN(parsedMaxFiles) || parsedMaxFiles <= 0 ? 500 : parsedMaxFiles;
const MAX_CONTENT_CHARS = Number.isNaN(parsedMaxContent) || parsedMaxContent <= 0 ? 20000 : parsedMaxContent;

if (!VAULT_PATH) {
  console.error("[foundry-mcp] WARNING: VAULT_PATH is not set. foundry_read_obsidian_notes will fail.");
}

const server = new McpServer({
  name: "foundry-mcp",
  version: "0.1.0",
});

server.tool(
  "foundry_read_obsidian_notes",
  "Read markdown notes from the configured Obsidian vault. Parses YAML frontmatter and renders content as HTML with Obsidian-flavored extensions (wikilinks, embeds, callouts). Use filter_type to narrow by document type (journal, actor, npc, item).",
  readObsidianSchema.shape,
  async (input) => {
    if (!VAULT_PATH) {
      return {
        content: [{ type: "text", text: "Error: VAULT_PATH environment variable is not set." }],
        isError: true,
      };
    }

    try {
      const { notes, skipped } = await readObsidianNotes(input, VAULT_PATH, MAX_FILES, MAX_CONTENT_CHARS);
      const summary = skipped > 0
        ? `\n\n---\n${skipped} file(s) skipped due to read/parse errors (see server stderr for details).`
        : "";
      return {
        content: [{ type: "text", text: JSON.stringify(notes, null, 2) + summary }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error reading vault at ${VAULT_PATH}: ${msg}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "foundry_create_journal_entries",
  "Generate a Foundry VTT import payload for journal entries. Returns JSON matching the foundry-mcp module's importPayload() schema. Feed the output to the foundry-mcp module's import function to create the entries.",
  createJournalsSchema.shape,
  async (input) => {
    const payload = buildImportPayload(input);
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  },
);

server.tool(
  "foundry_list_journals",
  "List existing journal entries in the Foundry VTT world. Currently a stub — requires a running game session.",
  listJournalsSchema.shape,
  async () => {
    return {
      content: [{ type: "text", text: LIST_JOURNALS_UNAVAILABLE }],
    };
  },
);

const transport = new StdioServerTransport();
try {
  await server.connect(transport);
} catch (err) {
  console.error(`[foundry-mcp] Failed to start MCP server: ${(err as Error).message}`);
  process.exit(1);
}
