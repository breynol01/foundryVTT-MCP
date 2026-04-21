const { Marked } = require("marked");

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const UNSAFE_TAGS = /<\s*\/?\s*(script|iframe|object|embed|form|link|meta|style)\b[^>]*>/gi;
const TAG_WITH_EVENT_HANDLER = /<([^>]*)\s+on\w+\s*=([^>]*)>/gi;
const EVENT_ATTR = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;

function sanitizeHtml(html) {
  return html
    .replace(UNSAFE_TAGS, "")
    .replace(TAG_WITH_EVENT_HANDLER, (match) => match.replace(EVENT_ATTR, ""));
}

const wikilink = {
  name: "wikilink",
  level: "inline",
  start(src) {
    return src.indexOf("[[");
  },
  tokenizer(src) {
    const match = src.match(/^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/);
    if (match) {
      return {
        type: "wikilink",
        raw: match[0],
        target: match[1].trim(),
        display: (match[2] || match[1]).trim()
      };
    }
  },
  renderer(token) {
    return `<a class="foundry-mcp-wikilink" data-target="${escapeHtml(token.target)}">${escapeHtml(token.display)}</a>`;
  }
};

const embed = {
  name: "embed",
  level: "inline",
  start(src) {
    return src.indexOf("![[");
  },
  tokenizer(src) {
    const match = src.match(/^!\[\[([^\]]+?)\]\]/);
    if (match) {
      return {
        type: "embed",
        raw: match[0],
        target: match[1].trim()
      };
    }
  },
  renderer(token) {
    const safe = escapeHtml(token.target);
    return `<div class="foundry-mcp-embed" data-target="${safe}">[Embedded: ${safe}]</div>`;
  }
};

const CALLOUT_TYPES = new Set(["note", "warning", "tip", "info", "danger", "example", "quote", "abstract", "success", "question", "failure", "bug"]);

const marked = new Marked();

marked.use({
  extensions: [embed, wikilink],
  renderer: {
    blockquote({ text }) {
      const calloutMatch = text.match(/^\[!([\w-]+)\][^\S\n]*(.*)/);
      if (calloutMatch) {
        const type = calloutMatch[1].toLowerCase();
        if (CALLOUT_TYPES.has(type)) {
          const customTitle = calloutMatch[2]?.trim();
          const title = customTitle || type.charAt(0).toUpperCase() + type.slice(1);
          const bodyText = text.slice(calloutMatch[0].length).replace(/^\n/, "").trim();
          const bodyHtml = bodyText ? marked.parse(bodyText) : "";
          return `<div class="foundry-mcp-callout callout-${escapeHtml(type)}"><p class="callout-title">${escapeHtml(title)}</p>${bodyHtml}</div>`;
        }
      }
      return `<blockquote>\n${text}</blockquote>\n`;
    }
  }
});

function renderMarkdown(content) {
  return sanitizeHtml(marked.parse(content));
}

module.exports = { renderMarkdown, escapeHtml };
