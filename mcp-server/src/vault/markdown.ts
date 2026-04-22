import { Marked, type TokenizerExtension, type RendererExtension } from "marked";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const UNSAFE_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|form|link|meta|style)\b[^>]*>/gi;
const EVENT_ATTR =
  /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;
const TAG_WITH_EVENT_HANDLER = /<([^>]*)\s+on\w+\s*=([^>]*)>/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(UNSAFE_TAGS, "")
    .replace(TAG_WITH_EVENT_HANDLER, (match) =>
      match.replace(EVENT_ATTR, "")
    );
}

const wikilink: TokenizerExtension & RendererExtension = {
  name: "wikilink",
  level: "inline",
  start(src: string) {
    return src.indexOf("[[");
  },
  tokenizer(src: string) {
    const match = src.match(/^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/);
    if (match) {
      return {
        type: "wikilink",
        raw: match[0],
        target: match[1].trim(),
        display: (match[2] || match[1]).trim(),
      };
    }
    return undefined;
  },
  renderer(token) {
    const t = token as unknown as { target: string; display: string };
    return `<a class="foundry-mcp-wikilink" data-target="${escapeHtml(t.target)}">${escapeHtml(t.display)}</a>`;
  },
};

const embed: TokenizerExtension & RendererExtension = {
  name: "embed",
  level: "inline",
  start(src: string) {
    return src.indexOf("![[");
  },
  tokenizer(src: string) {
    const match = src.match(/^!\[\[([^\]]+?)\]\]/);
    if (match) {
      return {
        type: "embed",
        raw: match[0],
        target: match[1].trim(),
      };
    }
    return undefined;
  },
  renderer(token) {
    const t = token as unknown as { target: string };
    const safe = escapeHtml(t.target);
    return `<div class="foundry-mcp-embed" data-target="${safe}">[Embedded: ${safe}]</div>`;
  },
};

const CALLOUT_TYPES = new Set([
  "note", "warning", "tip", "info", "danger", "example",
  "quote", "abstract", "success", "question", "failure", "bug",
]);

const marked = new Marked();

marked.use({
  extensions: [embed, wikilink],
  renderer: {
    blockquote({ text }: { text: string }) {
      const calloutMatch = text.match(/^\[!([\w-]+)\][^\S\n]*(.*)/);
      if (calloutMatch) {
        const type = calloutMatch[1].toLowerCase();
        if (CALLOUT_TYPES.has(type)) {
          const customTitle = calloutMatch[2]?.trim();
          const title =
            customTitle || type.charAt(0).toUpperCase() + type.slice(1);
          const bodyText = text
            .slice(calloutMatch[0].length)
            .replace(/^\n/, "")
            .trim();
          const bodyHtml = bodyText ? (marked.parse(bodyText) as string) : "";
          return `<div class="foundry-mcp-callout callout-${escapeHtml(type)}"><p class="callout-title">${escapeHtml(title)}</p>${bodyHtml}</div>`;
        }
      }
      return `<blockquote>\n${text}</blockquote>\n`;
    },
  },
});

export function renderMarkdown(content: string): string {
  return sanitizeHtml(marked.parse(content) as string);
}
