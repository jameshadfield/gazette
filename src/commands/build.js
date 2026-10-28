// `gazette build <input> --target <static|next|pdf|all>`
import fs from "node:fs";
import path from "node:path";
import { loadConfig, VENDOR } from "../config.js";
import { parseBibtex } from "../bibtex.js";
import { parseDocument } from "../parse/pipeline.js";
import { renderStaticArticle } from "../render/target-static.js";
import { renderNextArticle, buildManifest } from "../render/target-next.js";
import { buildPdf } from "../render/target-pdf.js";
import { generateSnapshots } from "../render/snapshots.js";
import { copyStaticAssets, copyNextAssets } from "../assets/copy.js";

function validate(data, warnings) {
  const figIds = new Set((data.islands || []).map((i) => i.figId));
  for (const t of data.triggers || []) {
    if (!figIds.has(t.target)) {
      warnings.push(`trigger target has no matching figure: ${t.target}`);
    }
  }
}

// Build the shared IR once, reused by every target.
export async function buildIR(config, warnings) {
  const markdown = fs.readFileSync(config.entry, "utf8");
  const bib = fs.existsSync(config.bibPath)
    ? parseBibtex(fs.readFileSync(config.bibPath, "utf8"))
    : {};
  if (!fs.existsSync(config.bibPath)) {
    warnings.push(`bibliography not found: ${config.bibPath} (citations will be left literal)`);
  }
  const { html, data } = await parseDocument({ markdown, bib, warnings });
  validate(data, warnings);
  return { html, data };
}

// The built PDF lives at <outBase>/paper.pdf (written by the `pdf` target).
function pdfSource(config) {
  return path.join(config.outBase, "paper.pdf");
}

// When frontmatter sets `pdf-download: true`, the `static`/`next` builds surface
// a Download PDF link and ship the file alongside the page. The PDF must already
// exist (build it with `--target pdf`/`all`); we assert rather than regenerate,
// and don't check whether it is up to date. Returns true when the link/copy
// apply, false when the document didn't opt in.
function requirePdfDownload(config, ir) {
  if (!ir.data.frontmatter || ir.data.frontmatter["pdf-download"] !== true) return false;
  const src = pdfSource(config);
  if (!fs.existsSync(src)) {
    throw new Error(
      `pdf-download: true, but the PDF does not exist at ${path.relative(process.cwd(), src)}.\n` +
        `  Build it first:  gazette build ${path.relative(process.cwd(), config.entry)} --target pdf`
    );
  }
  return true;
}

async function buildStatic(config, ir) {
  const outDir = path.join(config.outBase, "static");
  const wantPdf = requirePdfDownload(config, ir);
  const article = renderStaticArticle({
    html: ir.html,
    data: ir.data,
    hideFallback: config.hideFallback,
    pdfHref: wantPdf ? "paper.pdf" : undefined,
  });
  const template = fs.readFileSync(VENDOR.template, "utf8");
  const title = (ir.data.frontmatter && ir.data.frontmatter.title) || "Untitled";
  const page = template.replace("{{title}}", escapeTitle(title)).replace("{{article}}", article);

  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(path.join(outDir, "index.html"), page);
  await copyStaticAssets({ outDir, figuresDir: config.figuresDir, themeDir: config.themeDir });
  if (wantPdf) await fs.promises.copyFile(pdfSource(config), path.join(outDir, "paper.pdf"));
  return outDir;
}

function escapeTitle(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The `next` target: emit a self-contained asset bundle under a single base
// path (served from the host app's public/<base-path>/) plus article.html and
// manifest.json for the companion <GazettePaper>/<GazetteHydrator> components.
async function buildNext(config, ir) {
  const basePath = config.basePath || "/gazette";
  const subdir = basePath.replace(/^\/+/, "").replace(/\/+$/, "") || "gazette";
  const outDir = path.join(config.outBase, subdir);

  const wantPdf = requirePdfDownload(config, ir);
  const articleHtml = renderNextArticle({ html: ir.html, data: ir.data, basePath, pdfDownload: wantPdf });
  const manifest = buildManifest({ data: ir.data, basePath });

  await copyNextAssets({ outDir, figuresDir: config.figuresDir, themeDir: config.themeDir });
  await fs.promises.writeFile(path.join(outDir, "article.html"), articleHtml);
  await fs.promises.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (wantPdf) await fs.promises.copyFile(pdfSource(config), path.join(outDir, "paper.pdf"));
  return outDir;
}

export async function buildCommand(input, cli) {
  const config = loadConfig(input, cli);
  const warnings = [];
  const ir = await buildIR(config, warnings);

  // `--snapshot` regenerates the raster fallback PNGs (in the source figures/
  // tree) before building, so the no-JS/pdf fallbacks are up to date.
  if (cli.snapshot && (ir.data.islands || []).length) {
    const { written } = await generateSnapshots(config, ir);
    console.log(`gazette: snapshotted ${written.length} figure(s) before build`);
  }

  // `all` builds every implemented target. `pdf` goes first so that, when a
  // document opts into `pdf-download`, the file exists for the static/next
  // builds to assert and ship.
  const targets = config.target === "all" ? ["pdf", "static", "next"] : [config.target];
  const built = [];
  for (const target of targets) {
    if (target === "static") built.push(["static", `${await buildStatic(config, ir)}/index.html`]);
    else if (target === "next") built.push(["next", `${await buildNext(config, ir)}/article.html`]);
    else if (target === "pdf") built.push(["pdf", await buildPdf(config, ir)]);
    else throw new Error(`Unknown target: ${target}`);
  }

  // Report.
  const nFigs = (ir.data.islands || []).length;
  const nRefs = (ir.data.citedKeys || []).length;
  const nTrig = (ir.data.triggers || []).length;
  console.log(`gazette: built ${path.basename(config.entry)} — ${nFigs} figure(s), ${nTrig} trigger(s), ${nRefs} reference(s)`);
  for (const [target, outPath] of built) {
    console.log(`  ${target} -> ${path.relative(process.cwd(), outPath)}`);
  }
  if (warnings.length) {
    console.log(`gazette: ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  return { config, ir, built };
}
