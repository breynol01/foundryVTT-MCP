const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "2mb" }));

const {
  PORT = 3000,
  PROXY_TOKEN,
  OPENAI_API_KEY,
  OPENAI_BASE_URL = "https://api.openai.com/v1",
  DEFAULT_MODEL = "gpt-4o-mini",
  ALLOWED_ORIGINS,
  REQUEST_TIMEOUT_MS = 30000,
  MAX_PROMPT_CHARS = 8000,
  RATE_LIMIT_WINDOW_MS = 60000,
  RATE_LIMIT_MAX_REQUESTS = 30,
  TOKEN_CHARS_PER_TOKEN = 4,
  MAX_ESTIMATED_TOKENS = 0,
  MAX_ESTIMATED_COST_USD = 0,
  COST_PER_1K_TOKENS_USD = 0
} = process.env;

const allowedProviders = new Set(["openai"]);
const rateLimitBuckets = new Map();

const corsOptions = (() => {
  if (!ALLOWED_ORIGINS) {
    return { origin: true };
  }
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
  if (!PROXY_TOKEN) {
    res.status(500).json({ error: "Missing PROXY_TOKEN on server." });
    return false;
  }
  const token = req.get("X-Foundry-Proxy-Token");
  if (!token || token !== PROXY_TOKEN) {
    res.status(401).json({ error: "Unauthorized." });
    return false;
  }
  return true;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getClientKey(req, clientId) {
  if (clientId && typeof clientId === "string") {
    return `client:${clientId}`;
  }
  return `ip:${req.ip || "unknown"}`;
}

function assertRateLimit(req, res, clientId) {
  const maxRequests = toNumber(RATE_LIMIT_MAX_REQUESTS, 0);
  const windowMs = toNumber(RATE_LIMIT_WINDOW_MS, 60000);

  if (maxRequests <= 0 || windowMs <= 0) {
    return true;
  }

  const now = Date.now();
  const clientKey = getClientKey(req, clientId);
  const current = rateLimitBuckets.get(clientKey);

  if (!current || now >= current.resetAt) {
    rateLimitBuckets.set(clientKey, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.resetAt - now) / 1000)
    );
    res.set("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Rate limit exceeded.",
      retryAfterSeconds
    });
    return false;
  }

  current.count += 1;
  return true;
}

function estimateTokenBudget({ formattedMessages, maxTokens }) {
  const tokenChars = Math.max(1, toNumber(TOKEN_CHARS_PER_TOKEN, 4));
  const inputChars = formattedMessages.reduce(
    (total, message) => total + message.content.length,
    0
  );
  const inputTokens = Math.ceil(inputChars / tokenChars);
  const outputTokens = Math.max(0, toNumber(maxTokens, 0));
  return {
    inputTokens,
    outputTokens,
    estimatedTotalTokens: inputTokens + outputTokens
  };
}

function assertBudget({ res, formattedMessages, maxTokens }) {
  const { inputTokens, outputTokens, estimatedTotalTokens } = estimateTokenBudget(
    { formattedMessages, maxTokens }
  );
  const maxEstimatedTokens = toNumber(MAX_ESTIMATED_TOKENS, 0);

  if (maxEstimatedTokens > 0 && estimatedTotalTokens > maxEstimatedTokens) {
    res.status(400).json({
      error: "Estimated token budget exceeded.",
      estimatedTotalTokens,
      maxEstimatedTokens
    });
    return false;
  }

  const maxEstimatedCostUsd = toNumber(MAX_ESTIMATED_COST_USD, 0);
  const costPer1kTokensUsd = toNumber(COST_PER_1K_TOKENS_USD, 0);
  if (maxEstimatedCostUsd > 0 && costPer1kTokensUsd > 0) {
    const estimatedCostUsd =
      (estimatedTotalTokens / 1000) * costPer1kTokensUsd;
    if (estimatedCostUsd > maxEstimatedCostUsd) {
      res.status(400).json({
        error: "Estimated cost budget exceeded.",
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
        maxEstimatedCostUsd,
        estimatedTotalTokens,
        inputTokens,
        outputTokens
      });
      return false;
    }
  }

  return true;
}

function normalizeMessages({ messages, system, prompt }) {
  if (Array.isArray(messages) && messages.length > 0) {
    const normalized = messages
      .filter((message) => message && typeof message === "object")
      .map(({ role, content }) => ({ role, content }))
      .filter(
        ({ role, content }) =>
          typeof role === "string" && typeof content === "string"
      );
    return normalized.length > 0 ? normalized : null;
  }

  if (!prompt || typeof prompt !== "string") {
    return null;
  }

  return [
    system ? { role: "system", content: system } : null,
    { role: "user", content: prompt }
  ].filter(Boolean);
}

function formatResponsesInput(formattedMessages) {
  return formattedMessages.map(({ role, content }) => ({
    role,
    content: [{ type: "input_text", text: content }]
  }));
}

function extractResponseContent(responseBody) {
  if (typeof responseBody.output_text === "string" && responseBody.output_text) {
    return responseBody.output_text;
  }

  if (!Array.isArray(responseBody.output)) {
    return "";
  }

  return responseBody.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((item) => item.text)
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/v1/providers", (req, res) => {
  res.json({
    providers: Array.from(allowedProviders),
    defaultProvider: "openai",
    defaultModel: DEFAULT_MODEL
  });
});

app.post("/v1/generate", async (req, res) => {
  if (!assertAuth(req, res)) return;

  const {
    provider = "openai",
    model = DEFAULT_MODEL,
    prompt,
    system,
    messages,
    options = {},
    taskType,
    clientId
  } = req.body ?? {};

  if (!assertRateLimit(req, res, clientId)) return;

  const formattedMessages = normalizeMessages({ messages, system, prompt });

  if (!formattedMessages) {
    res.status(400).json({ error: "prompt or messages are required." });
    return;
  }

  const promptContent = formattedMessages
    .map((message) => message.content)
    .join("\n");
  if (promptContent.length > Number(MAX_PROMPT_CHARS)) {
    res.status(400).json({ error: "prompt exceeds MAX_PROMPT_CHARS." });
    return;
  }

  const maxTokens = options.maxTokens ?? 800;
  if (!assertBudget({ res, formattedMessages, maxTokens })) return;

  if (!allowedProviders.has(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}.` });
    return;
  }

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY on server." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(REQUEST_TIMEOUT_MS)
  );

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: formatResponsesInput(formattedMessages),
        temperature: options.temperature ?? 0.7,
        max_output_tokens: maxTokens,
        top_p: options.topP ?? 1,
        text:
          options.responseFormat === "json"
            ? { format: { type: "json_object" } }
            : undefined,
        metadata: taskType ? { taskType } : undefined
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
      return;
    }

    const data = await response.json();
    const content = extractResponseContent(data);

    res.json({
      content,
      usage: data.usage ?? null,
      model: data.model ?? model
    });
  } catch (error) {
    const status = error.name === "AbortError" ? 504 : 500;
    res.status(status).json({ error: error.message });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`Foundry proxy listening on ${PORT}`);
});
