// Normalize the CLI input (a Markdown entry file) + flags into a single resolved
// config object with absolute paths. There is no project config file: every
// option is a CLI flag, and paths default relative to the entry file's directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

// Vendored assets shipped with the tool.
export const VENDOR = {
  cssDir: path.join(PACKAGE_ROOT, "assets", "css"),
  tokensCss: path.join(PACKAGE_ROOT, "assets", "css", "tokens.css"),
  gazetteCss: path.join(PACKAGE_ROOT, "assets", "css", "gazette.css"),
  printCss: path.join(PACKAGE_ROOT, "assets", "css", "print.css"),
  fontsDir: path.join(PACKAGE_ROOT, "assets", "fonts"),
  katexDir: path.join(PACKAGE_ROOT, "assets", "katex"),
  runtime: path.join(PACKAGE_ROOT, "runtime", "gazette-runtime.js"),
  runtimeNextDir: path.join(PACKAGE_ROOT, "runtime", "next"),
  template: path.join(PACKAGE_ROOT, "templates", "page.html"),
};

// `input` is the Markdown entry file. CLI flags fill in the rest; paths without
// an explicit flag default relative to the entry file's directory (the root).
export function loadConfig(input, cli = {}) {
  const entry = path.resolve(input);
  if (!fs.existsSync(entry)) throw new Error(`Input not found: ${input}`);
  if (fs.statSync(entry).isDirectory()) {
    throw new Error(`Input must be a Markdown file, not a directory: ${input}`);
  }

  const rootDir = path.dirname(entry);
  const resolveRoot = (p) => path.resolve(rootDir, p);

  const figuresDir = resolveRoot(cli.figures || "figures");
  const bibPath = resolveRoot(cli.bib || "references.bib");
  // An explicit --out is resolved against the current working directory (the
  // output often belongs to a host app, not the gazette project); otherwise it
  // defaults to <root>/dist.
  const outBase = cli.out ? path.resolve(process.cwd(), cli.out) : resolveRoot("dist");
  // --theme points at a directory holding override tokens.css (and optionally a
  // fonts/ dir); without it the tool's vendored theme is used.
  const themeDir = cli.theme ? path.resolve(process.cwd(), cli.theme) : null;

  const target = (cli.target || "static").toLowerCase();

  return {
    rootDir,
    entry,
    figuresDir,
    bibPath,
    outBase,
    themeDir,
    target,
    basePath: cli.basePath || "",
    // --no-fallback-hide sets cli.fallbackHide === false (commander negation).
    hideFallback: cli.fallbackHide !== false,
    // Raster fallback snapshots (`gazette snapshot` / `build --snapshot`): the
    // rendered figure's CSS width target, captured at `scale`× density. 800 CSS
    // px at 2× → a crisp 1600px-wide PNG. Canvas/WebGL figures work because the
    // component really runs in Chrome.
    snapshot: {
      width: Number(cli.snapshotWidth) > 0 ? Number(cli.snapshotWidth) : 800,
      scale: Number(cli.snapshotScale) > 0 ? Number(cli.snapshotScale) : 2,
    },
  };
}
