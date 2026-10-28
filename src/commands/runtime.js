// `gazette runtime --target next --out <dir>`
// Copy a target's companion runtime components into the host project so it can
// import them directly. Only the `next` target ships runtime components today:
// the React <GazettePaper>/<GazetteHydrator> pair that embeds a built bundle.
import fs from "node:fs";
import path from "node:path";
import { VENDOR } from "../config.js";

// Per-target: the vendored source dir and the files to copy out of it.
// GazettePaper imports ./GazetteHydrator by relative path, so the pair stays
// self-contained when both land in the same destination directory.
const RUNTIME_FILES = {
  next: {
    dir: VENDOR.runtimeNextDir,
    files: ["GazetteHydrator.jsx", "GazettePaper.jsx"],
  },
};

export async function runtimeCommand(opts = {}) {
  const target = (opts.target || "next").toLowerCase();
  const spec = RUNTIME_FILES[target];
  if (!spec) {
    const known = Object.keys(RUNTIME_FILES).join(", ");
    throw new Error(`no runtime components for target \`${target}\` (expected: ${known})`);
  }
  if (!opts.out) throw new Error("--out <dir> is required");

  const outDir = path.resolve(process.cwd(), opts.out);
  await fs.promises.mkdir(outDir, { recursive: true });

  for (const name of spec.files) {
    await fs.promises.copyFile(path.join(spec.dir, name), path.join(outDir, name));
  }

  console.log(
    `gazette: copied ${spec.files.length} ${target} runtime component(s) -> ${path.relative(process.cwd(), outDir)}/`
  );
  for (const name of spec.files) console.log(`  ${name}`);
}
