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
  MAX_PROMPT_CHARS = 8000
} = process.env;

const allowedProviders = new Set(["openai"]);

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
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 800,
        top_p: options.topP ?? 1,
        presence_penalty: options.presencePenalty ?? 0,
        frequency_penalty: options.frequencyPenalty ?? 0,
        response_format:
          options.responseFormat === "json"
            ? { type: "json_object" }
            : undefined,
        user: clientId || undefined,
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
    const content = data.choices?.[0]?.message?.content ?? "";

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
