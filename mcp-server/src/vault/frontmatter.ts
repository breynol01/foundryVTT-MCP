import { basename, extname } from "node:path";
import type { FoundryDocument } from "../types.js";

interface FrontmatterInput {
  filePath: string;
  data: Record<string, unknown>;
  content: string;
}

export function mapFrontmatterToDocument({
  filePath,
  data,
  content,
}: FrontmatterInput): FoundryDocument | null {
  const type = String(data.type || "journal").toLowerCase();
  const ext = extname(filePath);
  const name =
    (data.title as string) || (data.name as string) || basename(filePath, ext);
  const pack =
    (data.compendium as string) || (data.pack as string) || undefined;
  const foundryId = (data.foundryId as string) || (data._id as string);

  if (type === "npc" || type === "actor") {
    return {
      type: "Actor",
      pack,
      data: {
        _id: foundryId,
        name,
        type: "npc",
        system: data.system || {},
        notes: { value: content },
      },
    };
  }

  if (type === "item") {
    return {
      type: "Item",
      pack,
      data: {
        _id: foundryId,
        name,
        type: (data.itemType as string) || "loot",
        system: data.system || {},
        description: { value: content },
      },
    };
  }

  if (type === "journal" || type === "journalentry") {
    return {
      type: "JournalEntry",
      pack,
      data: {
        _id: foundryId,
        name,
        pages: [
          {
            name,
            type: "text",
            text: { content, format: 1 }, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
          },
        ],
      },
    };
  }

  return null;
}
