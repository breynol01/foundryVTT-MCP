export interface FoundryDocument {
  type: "JournalEntry" | "Actor" | "Item";
  pack?: string;
  data: Record<string, unknown>;
}

export interface ImportPayload {
  compendiums?: CompendiumDef[];
  documents: FoundryDocument[];
  assets?: AssetDef[];
}

export interface CompendiumDef {
  name: string;
  label: string;
  type: string;
  package?: string;
}

export interface AssetDef {
  filename: string;
  data: string;
  folder?: string;
}

export interface VaultNote {
  path: string;
  name: string;
  type: string;
  frontmatter: Record<string, unknown>;
  content?: string;
}
