const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();
app.use(express.json({ limit: "2mb" }));

const {
  PORT = 8787,
  RUNNER_TOKEN,
  ALLOWED_ORIGINS,
  REQUEST_TIMEOUT_MS = 60000,
  MAX_OUTPUT_BYTES = 1_000_000,
  MAX_PROMPT_CHARS = 8000,
  MAX_COST_USD = 0.5,
  COST_PER_1K_TOKENS_CODEX,
  COST_PER_1K_TOKENS_CLAUDE,
  TOKEN_CHARS_PER_TOKEN = 4,
  CODEX_COMMAND = "codex",
  CLAUDE_COMMAND = "claude",
  CODEX_ARGS = "",
  CLAUDE_ARGS = ""
} = process.env;

const allowedProviders = new Set(["codex", "claude"]);

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

function parseArgs(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return trimmed.split(" ").filter(Boolean);
}

function estimateCostUsd({ provider, prompt, maxTokens }) {
  const per1k =
    provider === "codex"
      ? Number(COST_PER_1K_TOKENS_CODEX)
      : Number(COST_PER_1K_TOKENS_CLAUDE);
  if (!Number.isFinite(per1k) || per1k <= 0) return null;
  const promptTokens = Math.ceil(prompt.length / Number(TOKEN_CHARS_PER_TOKEN));
  const totalTokens = promptTokens + (maxTokens ? Number(maxTokens) : 0);
  if (!Number.isFinite(totalTokens)) return null;
  return (totalTokens / 1000) * per1k;
}

async function runCommand({ provider, prompt, model, options }) {
  const command = provider === "codex" ? CODEX_COMMAND : CLAUDE_COMMAND;
  const extraArgs = parseArgs(provider === "codex" ? CODEX_ARGS : CLAUDE_ARGS);
  const args = [...extraArgs];

  const promptArgIndex = args.indexOf("{{prompt}}");
  const modelArgIndex = args.indexOf("{{model}}");

  if (model && modelArgIndex !== -1) {
    args[modelArgIndex] = model;
  }

  const shouldPipePrompt = promptArgIndex === -1;
  if (!shouldPipePrompt) {
    args[promptArgIndex] = prompt;
  }

  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

  if (shouldPipePrompt) {
    child.stdin.write(prompt);
    child.stdin.end();
  }

  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;

  const maxBytes = Number(MAX_OUTPUT_BYTES);

  function collect(chunk, chunks, type) {
    const size = Buffer.byteLength(chunk);
    if (type === "stdout") stdoutBytes += size;
    else stderrBytes += size;

    if (stdoutBytes + stderrBytes > maxBytes) {
      child.kill("SIGKILL");
      throw new Error("Output exceeded MAX_OUTPUT_BYTES.");
    }
    chunks.push(chunk);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Runner timed out."));
    }, Number(REQUEST_TIMEOUT_MS));

    child.stdout.on("data", (chunk) => {
      try {
        collect(chunk, stdoutChunks, "stdout");
      } catch (error) {
        reject(error);
      }
    });

    child.stderr.on("data", (chunk) => {
      try {
        collect(chunk, stderrChunks, "stderr");
      } catch (error) {
        reject(error);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(stderr || `Runner exited with code ${code}.`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parsePayload(output) {
  if (!output) return { content: "" };
  const trimmed = output.trim();
  if (!trimmed) return { content: "" };

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const payload = parsed.documents || parsed.document || parsed.compendiums
        ? parsed
        : parsed.payload;
      if (payload) {
        return { content: trimmed, payload };
      }
      if (typeof parsed.content === "string") {
        return { content: parsed.content, payload: parsed.payload };
      }
    }
  } catch {
    return { content: trimmed };
  }

  return { content: trimmed };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/v1/cli/run", async (req, res) => {
  if (!assertAuth(req, res)) return;

  const { provider, prompt, model, options = {} } = req.body ?? {};

  if (!provider || !allowedProviders.has(provider)) {
    res.status(400).json({ error: "Unsupported provider." });
    return;
  }

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required." });
    return;
  }

  if (prompt.length > Number(MAX_PROMPT_CHARS)) {
    res.status(400).json({ error: "prompt exceeds MAX_PROMPT_CHARS." });
    return;
  }

  const maxTokens = options.maxTokens ?? options.max_tokens;
  const estimatedCostUsd = estimateCostUsd({ provider, prompt, maxTokens });
  if (estimatedCostUsd !== null && estimatedCostUsd > Number(MAX_COST_USD)) {
    res.status(400).json({
      error: "Estimated cost exceeds MAX_COST_USD.",
      estimatedCostUsd
    });
    return;
  }

  try {
    const { stdout } = await runCommand({ provider, prompt, model, options });
    const { content, payload } = parsePayload(stdout);
    res.json({
      content,
      payload: payload ?? null,
      usage: {
        estimatedCostUsd: estimatedCostUsd ?? null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Foundry MCP runner listening on ${PORT}`);
});
