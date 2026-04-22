import { readFile } from "node:fs/promises";
import { relative, extname, basename } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { walkVaultFiles } from "../vault/walker.js";

import { renderMarkdown } from "../vault/markdown.js";
import type { VaultNote } from "../types.js";

export const readObsidianSchema = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe("Specific file paths relative to the vault root. If omitted, scans the entire vault."),
  filter_type: z
    .string()
    .optional()
    .describe('Filter by frontmatter type: "journal", "actor", "npc", "item"'),
  include_content: z
    .boolean()
    .default(true)
    .describe("Whether to include rendered HTML content in results"),
});

export type ReadObsidianInput = z.infer<typeof readObsidianSchema>;

export async function readObsidianNotes(
  input: ReadObsidianInput,
  vaultPath: string,
  maxFiles: number,
  maxContentChars: number,
): Promise<VaultNote[]> {
  let filePaths: string[];

  if (input.paths && input.paths.length > 0) {
    const { join } = await import("node:path");
    filePaths = input.paths.map((p) => join(vaultPath, p));
  } else {
    filePaths = await walkVaultFiles(vaultPath, maxFiles);
  }

  const results: VaultNote[] = [];

  for (const filePath of filePaths) {
    try {
      const raw = await readFile(filePath, "utf-8");
      const { data, content: bodyContent } = matter(raw);
      const type = String(data.type || "journal").toLowerCase();

      if (input.filter_type && type !== input.filter_type.toLowerCase()) {
        continue;
      }

      const ext = extname(filePath);
      const name = (data.title as string) || (data.name as string) || basename(filePath, ext);
      const relPath = relative(vaultPath, filePath);

      const note: VaultNote = {
        path: relPath,
        name,
        type,
        frontmatter: data,
      };

      if (input.include_content) {
        const clipped =
          bodyContent.length > maxContentChars
            ? bodyContent.slice(0, maxContentChars) + "\n…[truncated]"
            : bodyContent;
        note.content = renderMarkdown(clipped);
      }

      results.push(note);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[foundry-mcp] Skipping ${filePath}: ${msg}`);
    }
  }

  return results;
}
