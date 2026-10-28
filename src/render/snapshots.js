// Raster fallback snapshots: run each interactive figure's component in real
// headless Chrome and screenshot it to `figures/<slug>.png` in the SOURCE tree.
//
// This is the faithful replacement for the hand-supplied placeholder PNGs. A
// real browser (not a jsdom/linkedom SVG shim) is used on purpose: components
// may draw to <canvas> / WebGL, which only a real engine renders. The PNGs are
// committed artifacts, so every target — the no-JS static page, the `next` SSR
// fallback, and the `pdf` print — references the same real image.
//
// Each figure is rendered in ISOLATION in a minimal harness page at a fixed
// width (config.snapshot.width), so the output is deterministic and independent
// of the article's column layout. The harness loads the theme CSS (tokens +
// gazette) so figure text uses the real fonts, and imports the component and
// fetches its datasets over a local http origin exactly as the live page does.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyStaticAssets } from "../assets/copy.js";
import { withBrowser, serveDir, snapshotElement } from "./headless.js";

// Build the per-island harness HTML. Mirrors the static target's inline
// hydration (data assembly, render call, the data-hydrated signal) but renders
// into a single fixed-width mount we screenshot.
function harnessHtml(island, width) {
  const optsJson = JSON.stringify(island.opts || {});
  const entries = Object.entries(island.data || {});
  const dataBlock = entries.length
    ? `const data = {\n${entries
        .map(([key, d]) => `  ${JSON.stringify(key)}: await fetch("/${d.path}").then((r) => r.json()),`)
        .join("\n")}\n};`
    : `const data = {};`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/gazette.css">
<style>
  html, body { margin: 0; background: var(--paper, #fff); }
  /* .gazette-paper is kept as an ANCESTOR so the theme's scoped figure rules
     (e.g. the serif font on .gazette-mount svg) apply, but its own column
     padding / max-width are neutralized so they don't pad the screenshot. */
  .snap-paper { max-width: none; padding: 0; margin: 0; }
  /* The mount itself — the captured element — is a tight box at the target width;
     the live min-height is irrelevant to a screenshot. */
  #snap { width: ${width}px; min-height: 0; }
</style>
</head>
<body>
<div class="gazette-paper snap-paper">
<div id="snap" class="gazette-mount"></div>
</div>
<script type="module">
import { render } from "/${island.modulePath}";
const mount = document.getElementById("snap");
${dataBlock}
render(mount, data, Object.assign({ mode: "inline", width: ${width} }, ${optsJson}));
mount.dataset.hydrated = "1";
</script>
</body>
</html>
`;
}

// Regenerate fallback PNGs for the document's interactive figures.
// `only` (optional) restricts to one figure slug (with or without the `fig:` prefix).
// Returns { written: [{ slug, file }], skipped: [...] }.
export async function generateSnapshots(config, ir, { only } = {}) {
  let islands = ir.data.islands || [];
  if (only) {
    const want = String(only).replace(/^fig:/, "");
    islands = islands.filter((i) => i.slug === want);
    if (!islands.length) {
      throw new Error(`snapshot: no interactive figure with slug "${want}"`);
    }
  }
  if (!islands.length) return { written: [], skipped: [] };

  const { width, scale } = config.snapshot;

  // Lay out a temp dir the way the static output looks (theme CSS, fonts, the
  // figures tree), then drop one harness page per island beside it and serve it.
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gazette-snap-"));
  const written = [];
  try {
    await copyStaticAssets({ outDir: tmp, figuresDir: config.figuresDir, themeDir: config.themeDir });
    for (const island of islands) {
      await fs.promises.writeFile(
        path.join(tmp, `__snap-${island.mountId}.html`),
        harnessHtml(island, width)
      );
    }

    const server = await serveDir(tmp);
    try {
      await withBrowser(async (browser) => {
        for (const island of islands) {
          const page = await browser.newPage();
          try {
            const url = `${server.origin}/__snap-${island.mountId}.html`;
            const png = await snapshotElement(page, url, "#snap", { width, deviceScaleFactor: scale });
            const file = path.join(config.figuresDir, `${island.slug}.png`);
            await fs.promises.writeFile(file, png);
            written.push({ slug: island.slug, file });
          } finally {
            await page.close();
          }
        }
      });
    } finally {
      await server.close();
    }
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }

  return { written, skipped: [] };
}
