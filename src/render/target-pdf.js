// The `pdf` target: the no-JS static HTML (fallback images, no hydration) linked
// against the print stylesheet and printed by headless Chrome.
//
// The PDF reuses the entire HTML pipeline. The only pdf-specific pieces are:
//   1. render the article with hydration omitted, so each figure shows its
//      baked raster fallback (`figures/<slug>.png`) instead of a live mount;
//   2. link print.css in addition to tokens.css / gazette.css;
//   3. load the page in Chrome and call page.pdf().
//
// The fallbacks must already exist — run `gazette snapshot` first. If any are
// missing we fail with that guidance rather than printing blank figure boxes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VENDOR } from "../config.js";
import { copyStaticAssets } from "../assets/copy.js";
import { renderStaticArticle } from "./target-static.js";
import { withBrowser, printPdf } from "./headless.js";

function escapeTitle(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pdfPage({ title, article }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeTitle(title)}</title>
<link rel="stylesheet" href="assets/katex/katex.min.css">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="gazette.css">
<link rel="stylesheet" href="print.css">
</head>
<body>
${article}
</body>
</html>
`;
}

// Fail early (before launching Chrome) if any interactive figure lacks its baked
// raster fallback, pointing the author at the command that generates them.
function assertFallbacks(config, ir) {
  const missing = [];
  for (const island of ir.data.islands || []) {
    const file = path.join(config.figuresDir, `${island.slug}.png`);
    if (!fs.existsSync(file)) missing.push(island.slug);
  }
  if (missing.length) {
    throw new Error(
      `pdf: missing fallback image(s) for ${missing.map((s) => `fig:${s}`).join(", ")}.\n` +
        `  Generate them first:  gazette snapshot ${path.relative(process.cwd(), config.entry)}`
    );
  }
}

export async function buildPdf(config, ir) {
  assertFallbacks(config, ir);

  // Render the article with islands omitted: no inline hydration scripts, mounts
  // stay empty, and the static fallback <img> stays visible (gazette.css's
  // @media print then hides the empty mount and shows the fallback).
  const noJsData = { ...ir.data, islands: [] };
  const article = renderStaticArticle({ html: ir.html, data: noJsData, hideFallback: false });
  const title = (ir.data.frontmatter && ir.data.frontmatter.title) || "Untitled";

  // Stage a self-contained page in a temp dir (same asset layout as `static`,
  // plus print.css) and print it from a file:// URL — no server needed, since
  // the no-JS page fetches nothing.
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gazette-pdf-"));
  try {
    await copyStaticAssets({ outDir: tmp, figuresDir: config.figuresDir, themeDir: config.themeDir });
    await fs.promises.copyFile(VENDOR.printCss, path.join(tmp, "print.css"));
    await fs.promises.writeFile(path.join(tmp, "index.html"), pdfPage({ title, article }));

    const pdf = await withBrowser((browser) =>
      browser.newPage().then((page) => printPdf(page, `file://${path.join(tmp, "index.html")}`))
    );

    await fs.promises.mkdir(config.outBase, { recursive: true });
    const outPath = path.join(config.outBase, "paper.pdf");
    await fs.promises.writeFile(outPath, pdf);
    return outPath;
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}
