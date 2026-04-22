import { z } from "zod";

export const listJournalsSchema = z.object({});

export const LIST_JOURNALS_UNAVAILABLE =
  "Listing existing journal entries requires a running Foundry VTT game session. " +
  "The Forge does not expose Foundry's document API from outside the browser.\n\n" +
  "To see existing journals:\n" +
  "1. Open your Foundry world in the browser\n" +
  "2. Use the Journal tab in the sidebar\n" +
  "3. Or run `game.journal.contents.map(j => ({ id: j.id, name: j.name }))` in the browser console";
