import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readObsidianSchema, readObsidianNotes } from "./tools/readObsidian.js";
import { createJournalsSchema, buildImportPayload } from "./tools/createJournals.js";
import { listJournalsSchema, LIST_JOURNALS_UNAVAILABLE } from "./tools/listJournals.js";

const VAULT_PATH = process.env.VAULT_PATH || "";
const MAX_FILES = parseInt(process.env.MAX_FILES || "500", 10);
const MAX_CONTENT_CHARS = parseInt(process.env.MAX_CONTENT_CHARS || "20000", 10);

const server = new McpServer({
  name: "foundry-mcp",
  version: "0.1.0",
});

server.tool(
  "foundry_read_obsidian_notes",
  "Read markdown notes from the Obsidian Honkonomicon vault. Parses YAML frontmatter and renders content as HTML with Obsidian-flavored extensions (wikilinks, embeds, callouts). Use filter_type to narrow by document type (journal, actor, npc, item).",
  readObsidianSchema.shape,
  async (input) => {
    if (!VAULT_PATH) {
      return {
        content: [{ type: "text", text: "Error: VAULT_PATH environment variable is not set." }],
        isError: true,
      };
    }

    const notes = await readObsidianNotes(input, VAULT_PATH, MAX_FILES, MAX_CONTENT_CHARS);
    return {
      content: [{ type: "text", text: JSON.stringify(notes, null, 2) }],
    };
  },
);

server.tool(
  "foundry_create_journal_entries",
  "Generate a Foundry VTT import payload for journal entries. Returns JSON matching the foundry-mcp module's importPayload() format. Paste the output into Foundry's import dialog to create the entries.",
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
await server.connect(transport);
