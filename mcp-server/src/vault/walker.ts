import { readdir } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_MAX_FILES = 500;

export async function walkVaultFiles(
  rootDir: string,
  maxFiles: number = DEFAULT_MAX_FILES
): Promise<string[]> {
  const results: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length > 0 && results.length < maxFiles) {
    const current = stack.pop()!;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      console.error(`[foundry-mcp] Cannot read directory ${current}: ${(err as Error).message}`);
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const entryPath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(entryPath);
      }
    }
  }

  return results;
}
