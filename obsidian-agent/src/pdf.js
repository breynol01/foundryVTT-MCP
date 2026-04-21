const fs = require("fs");
const path = require("path");

const maxPdfPages = Math.max(1, parseInt(process.env.MAX_PDF_PAGES, 10) || 50);

let canvasAvailable = true;
let createCanvas;
try {
  createCanvas = require("canvas").createCanvas;
} catch (err) {
  canvasAvailable = false;
  console.warn(`[obsidian-agent] canvas module not available — PDF image extraction disabled. Install 'canvas' for image support. (${err.message})`);
}

async function loadPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

async function parsePdf(filePath) {
  const pdfjs = await loadPdfjs();

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const basename = path.basename(filePath, ".pdf");
  const pageLimit = Math.min(doc.numPages, maxPdfPages);
  const htmlParts = [];
  const images = [];

  for (let i = 1; i <= pageLimit; i++) {
    const page = await doc.getPage(i);

    const textContent = await page.getTextContent();
    const lines = [];
    let lastY = null;
    for (const item of textContent.items) {
      if (item.str === undefined) continue;
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
        lines.push("\n");
      }
      lines.push(item.str);
      lastY = item.transform[5];
    }
    const pageText = lines.join("").trim();

    htmlParts.push(`<h2>Page ${i}</h2>`);
    if (pageText) {
      const paragraphs = pageText.split(/\n{2,}/);
      for (const p of paragraphs) {
        const escaped = p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        htmlParts.push(`<p>${escaped}</p>`);
      }
    }

    if (canvasAvailable) {
      try {
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");

        await page.render({ canvasContext: ctx, viewport }).promise;

        const pngBuffer = canvas.toBuffer("image/png");
        const filename = `${basename}-page-${i}.png`;
        images.push({ filename, buffer: pngBuffer });
        htmlParts.push(`<img src="__ASSET__/${filename}" />`);
      } catch (err) {
        console.error(`[obsidian-agent] Canvas render failed for ${basename} page ${i}: ${err.message}`);
      }
    }

    page.cleanup();
  }

  doc.destroy();

  return { html: htmlParts.join("\n"), images };
}

module.exports = { parsePdf };
