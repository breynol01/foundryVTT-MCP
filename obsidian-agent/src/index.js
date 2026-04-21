const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const yaml = require("js-yaml");
const { renderMarkdown } = require("./markdown");
const { parsePdf } = require("./pdf");

const app = express();
app.use(express.json({ limit: "10mb" }));

const {
  PORT = 8790,
  VAULT_PATH,
  RUNNER_TOKEN,
  ALLOWED_ORIGINS
} = process.env;

const MAX_FILES = Math.max(1, parseInt(process.env.MAX_FILES, 10) || 500);
const MAX_CONTENT_CHARS = Math.max(1, parseInt(process.env.MAX_CONTENT_CHARS, 10) || 20000);

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

function walkVaultFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length && results.length < MAX_FILES) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= MAX_FILES) break;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        stack.push(entryPath);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".pdf"))) {
        results.push(entryPath);
      }
    }
  }

  return results;
}

function mapFrontmatterToDocument({ filePath, data, content }) {
  const type = String(data.type || "journal").toLowerCase();
  const ext = path.extname(filePath);
  const name = data.title || data.name || path.basename(filePath, ext);
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

async function loadPayload({ filePaths, filterType }) {
  if (!VAULT_PATH) {
    throw new Error("VAULT_PATH is required.");
  }

  const allFiles = filePaths?.length
    ? filePaths.map((p) => path.resolve(VAULT_PATH, p))
    : walkVaultFiles(VAULT_PATH);

  const documents = [];
  const assets = [];

  for (const filePath of allFiles) {
    if (documents.length >= MAX_FILES) break;

    try {
      if (filePath.endsWith(".pdf")) {
        const basename = path.basename(filePath, ".pdf");
        const sidecarPath = filePath.replace(/\.pdf$/, ".yml");

        let data = { type: "journal", title: basename };
        if (fs.existsSync(sidecarPath)) {
          const sidecarRaw = fs.readFileSync(sidecarPath, "utf8");
          const parsed = yaml.load(sidecarRaw);
          if (parsed && typeof parsed === "object") {
            data = { ...data, ...parsed };
          }
        }

        if (filterType && String(data.type || "").toLowerCase() !== filterType) {
          continue;
        }

        const result = await parsePdf(filePath);
        const folder = `foundry-mcp/imports/${data.title || basename}`;

        for (const img of result.images) {
          assets.push({
            filename: img.filename,
            data: img.buffer.toString("base64"),
            folder
          });
        }

        const doc = mapFrontmatterToDocument({ filePath, data, content: result.html });
        if (doc) documents.push(doc);
      } else {
        const raw = fs.readFileSync(filePath, "utf8");
        const { data, content } = matter(raw);
        if (filterType && String(data.type || "").toLowerCase() !== filterType) {
          continue;
        }
        const clipped = content.slice(0, MAX_CONTENT_CHARS);
        const html = renderMarkdown(clipped);
        const doc = mapFrontmatterToDocument({ filePath, data, content: html });
        if (doc) documents.push(doc);
      }
    } catch (err) {
      console.error(`[obsidian-agent] Skipping ${filePath}: ${err.message}`);
    }
  }

  return { documents, assets };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/v1/payload", async (req, res) => {
  if (!assertAuth(req, res)) return;

  try {
    const { paths, type } = req.body ?? {};
    const payload = await loadPayload({
      filePaths: Array.isArray(paths) ? paths : null,
      filterType: type ? String(type).toLowerCase() : null
    });
    res.json(payload);
  } catch (error) {
    console.error("[obsidian-agent] /v1/payload failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Obsidian agent listening on ${PORT}`);
});
