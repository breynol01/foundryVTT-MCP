const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const app = express();
app.use(express.json({ limit: "2mb" }));

const {
  PORT = 8790,
  VAULT_PATH,
  RUNNER_TOKEN,
  ALLOWED_ORIGINS,
  MAX_FILES = 500,
  MAX_CONTENT_CHARS = 20000
} = process.env;

const corsOptions = (() => {
  if (!ALLOWED_ORIGINS) return { origin: true };
  const allowed = new Set(
    ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return {
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    }
  };
})();

app.use(cors(corsOptions));

function assertAuth(req, res) {
  if (!RUNNER_TOKEN) {
    res.status(500).json({ error: "Missing RUNNER_TOKEN on server." });
    return false;
  }
  const token = req.get("X-Foundry-Runner-Token");
  if (!token || token !== RUNNER_TOKEN) {
    res.status(401).json({ error: "Unauthorized." });
    return false;
  }
  return true;
}

function walkMarkdownFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length && results.length < Number(MAX_FILES)) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= Number(MAX_FILES)) break;
      const entryPath = path.join(current, entry.name);
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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mapFrontmatterToDocument({ filePath, data, content }) {
  const type = String(data.type || "journal").toLowerCase();
  const name = data.title || data.name || path.basename(filePath, ".md");
  const pack = data.compendium || data.pack || undefined;
  const foundryId = data.foundryId || data._id;

  if (type === "npc" || type === "actor") {
    return {
      type: "Actor",
      pack,
      data: {
        _id: foundryId,
        name,
        type: "npc",
        system: data.system || {},
        notes: { value: content }
      }
    };
  }

  if (type === "item") {
    return {
      type: "Item",
      pack,
      data: {
        _id: foundryId,
        name,
        type: data.itemType || "loot",
        system: data.system || {},
        description: { value: content }
      }
    };
  }

  if (type === "journal" || type === "journalentry") {
    return {
      type: "JournalEntry",
      pack,
      data: {
        _id: foundryId,
        name,
        content
      }
    };
  }

  return null;
}

function loadPayload({ filePaths, filterType }) {
  if (!VAULT_PATH) {
    throw new Error("VAULT_PATH is required.");
  }

  const allFiles = filePaths?.length
    ? filePaths.map((p) => path.resolve(VAULT_PATH, p))
    : walkMarkdownFiles(VAULT_PATH);

  const documents = [];

  for (const filePath of allFiles) {
    if (documents.length >= Number(MAX_FILES)) break;
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(raw);
    if (filterType && String(data.type || "").toLowerCase() !== filterType) {
      continue;
    }
    const clipped = content.slice(0, Number(MAX_CONTENT_CHARS));
    const html = `<pre>${escapeHtml(clipped)}</pre>`;
    const doc = mapFrontmatterToDocument({ filePath, data, content: html });
    if (doc) documents.push(doc);
  }

  return { documents };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/v1/payload", (req, res) => {
  if (!assertAuth(req, res)) return;

  try {
    const { paths, type } = req.body ?? {};
    const payload = loadPayload({
      filePaths: Array.isArray(paths) ? paths : null,
      filterType: type ? String(type).toLowerCase() : null
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Obsidian agent listening on ${PORT}`);
});
