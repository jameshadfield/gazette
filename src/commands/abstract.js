// `gazette abstract <input>` — print the document's abstract (its first
// paragraph) as plain Markdown, with citations dropped, figure cross-references
// replaced by their number ("Figure 1"), and gazette directives reduced to text.
//
// The Markdown is written to stdout (so it can be piped or captured); any
// non-fatal warnings go to stderr, keeping stdout a clean abstract.
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { extractAbstract } from "../parse/abstract.js";

export async function abstractCommand(input, cli) {
  const config = loadConfig(input, cli);
  const markdown = fs.readFileSync(config.entry, "utf8");
  const warnings = [];
  const abstract = extractAbstract({ markdown, warnings });
  process.stdout.write(`${abstract}\n`);
  for (const w of warnings) console.error(`gazette: ! ${w}`);
}
