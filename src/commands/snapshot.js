// `gazette snapshot <input> [--only fig:slug]` — regenerate the raster fallback
// PNGs for the document's interactive figures by rendering each component in
// headless Chrome and screenshotting it into the source `figures/` tree.
//
// Run this when a figure's component or data changes; the resulting PNGs are
// committed and reused by every target (no-JS static, `pdf` print).
import path from "node:path";
import { loadConfig } from "../config.js";
import { buildIR } from "./build.js";
import { generateSnapshots } from "../render/snapshots.js";

export async function snapshotCommand(input, cli) {
  const config = loadConfig(input, cli);
  const warnings = [];
  const ir = await buildIR(config, warnings);

  const nIslands = (ir.data.islands || []).length;
  if (!nIslands) {
    console.log("gazette snapshot: no interactive figures to render.");
    return;
  }

  const { written } = await generateSnapshots(config, ir, { only: cli.only });

  console.log(`gazette: snapshotted ${written.length} figure(s)`);
  for (const { slug, file } of written) {
    console.log(`  ${slug} -> ${path.relative(process.cwd(), file)}`);
  }
  if (warnings.length) {
    console.log(`gazette: ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
}
