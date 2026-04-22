import { z } from "zod";
import type { ImportPayload, FoundryDocument } from "../types.js";

export const createJournalsSchema = z.object({
  documents: z
    .array(
      z.object({
        name: z.string().describe("Journal entry name"),
        content: z.string().describe("HTML content for the journal page"),
        folder: z.string().optional().describe("Foundry folder name"),
        pack: z.string().optional().describe("Target compendium pack ID"),
      }),
    )
    .describe("Array of journal entries to create"),
});

export type CreateJournalsInput = z.infer<typeof createJournalsSchema>;

export function buildImportPayload(input: CreateJournalsInput): ImportPayload {
  const documents: FoundryDocument[] = input.documents.map((doc) => ({
    type: "JournalEntry",
    pack: doc.pack,
    data: {
      name: doc.name,
      folder: doc.folder,
      pages: [
        {
          name: doc.name,
          type: "text",
          text: { content: doc.content, format: 1 },
        },
      ],
    },
  }));

  return { documents };
}
