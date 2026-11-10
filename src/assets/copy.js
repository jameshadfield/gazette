// Copy the static assets a built page needs into the output directory:
// theme CSS + fonts, KaTeX runtime, the vendored figure libs, the trigger
// runtime, and the author's own figures/ tree.
import fs from "node:fs";
import path from "node:path";
import { VENDOR } from "../config.js";

async function cp(src, dest) {
  await fs.promises.cp(src, dest, { recursive: true });
}

// Lay out the output directory for the static target.
//   out/
//     index.html            (written by the build command)
//     tokens.css gazette.css
//     fonts/*.woff2          (referenced by tokens.css)
//     assets/katex/…
//     gazette-runtime.js
//     figures/              (author components + data + fallbacks + lib/, copied verbatim)
//     .nojekyll
//
// The figure libraries (d3 / plot / shared helpers) are author-owned and live in
// the project's own figures/lib; they travel with the figures/ copy below.
// gazette only vendors the document chrome: theme CSS + fonts and the KaTeX runtime.
export async function copyStaticAssets({ outDir, figuresDir, themeDir }) {
  await fs.promises.mkdir(outDir, { recursive: true });

  const tokensSrc = themeDir ? path.join(themeDir, "tokens.css") : VENDOR.tokensCss;
  const fontsSrc = themeDir && fs.existsSync(path.join(themeDir, "fonts"))
    ? path.join(themeDir, "fonts")
    : VENDOR.fontsDir;

  await cp(tokensSrc, path.join(outDir, "tokens.css"));
  await cp(VENDOR.gazetteCss, path.join(outDir, "gazette.css"));
  await cp(fontsSrc, path.join(outDir, "fonts"));
  await cp(VENDOR.katexDir, path.join(outDir, "assets", "katex"));
  await cp(VENDOR.runtime, path.join(outDir, "gazette-runtime.js"));

  // Author figures (components, data, fallbacks, and their own lib/) copied as-is.
  if (fs.existsSync(figuresDir)) {
    await cp(figuresDir, path.join(outDir, "figures"));
  }

  await fs.promises.writeFile(path.join(outDir, ".nojekyll"), "");
}
