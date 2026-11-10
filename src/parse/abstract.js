// Extract a document's abstract — its first paragraph — as plain Markdown.
//
// `gazette abstract <file>` prints this: the first top-level paragraph of the
// source (the prose under a leading `## Abstract`, or the opening paragraph if
// there is none), rendered back to Markdown with every gazette-specific
// construct stripped so the result is portable prose:
//
//   - citations `[@key]` / `[@k1; @k2]`  → dropped (with their leading space)
//   - cross-references `[@fig:slug]`      → replaced with the figure's number,
//                                           e.g. "Figure 1" (", "-joined when a
//                                           group references several figures)
//   - `:trigger[label]{…}` directives     → reduced to their label text
//
// Ordinary Markdown inside the paragraph — emphasis, links, inline code, inline
// math — is preserved. Figure numbers are assigned by the document order of the
// `:::figure` directives (matching every other target), so a reference resolves
// to the same number the reader sees elsewhere.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";

import { escapeFigColons } from "./pipeline.js";

const DIRECTIVE_TYPES = new Set(["textDirective", "leafDirective", "containerDirective"]);

// Processor used for both parsing and stringifying. The gfm/math/directive/
// frontmatter plugins register the micromark + fromMarkdown extensions `.parse()`
// needs, and the matching toMarkdown extensions `.stringify()` needs.
function makeProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkStringify);
}

// Number every `:::figure{#fig:slug}` by document order → Map(slug → number).
function buildFigureMap(tree) {
  const map = new Map();
  let counter = 0;
  visit(tree, (n) => n.type === "containerDirective" && n.name === "figure", (node) => {
    counter++;
    const slug = String((node.attributes || {}).id || "").replace(/^fig:/, "");
    if (slug) map.set(slug, counter);
  });
  return map;
}

// Rewrite the bracketed reference tokens inside one text node's value. A bracket
// group is only touched when *every* `;`-separated token is a well-formed @token
// of a single kind; anything else is left verbatim (matching rehypeResolveRefs).
function transformValue(value, figMap, warnings) {
  // Leading whitespace is captured so a dropped citation doesn't leave a gap
  // before the following punctuation ("project [@key]." → "project.").
  return value.replace(/(\s*)\[([^[\]]+)\]/g, (whole, lead, inner) => {
    const tokens = inner.split(";").map((t) => t.trim());
    if (tokens.length === 0) return whole;

    // Cross-reference group: every token is @fig:slug → "Figure N".
    if (tokens.every((t) => /^@fig:[^\s;]+$/.test(t))) {
      const labels = [];
      for (const t of tokens) {
        const slug = t.slice(5); // drop "@fig:"
        const n = figMap.get(slug);
        if (n == null) {
          warnings.push(`abstract: cross-reference to unknown figure: [@fig:${slug}]`);
          return whole; // leave the literal bracket untouched
        }
        labels.push(`Figure ${n}`);
      }
      return `${lead}${labels.join(", ")}`;
    }

    // Citation group: every token is a bare @key (no colon) → dropped.
    if (tokens.every((t) => /^@[^\s:;]+$/.test(t))) return "";

    return whole;
  });
}

// Strip gazette formatting in place: unwrap directive nodes to their children
// (dropping the directive itself, e.g. a `:trigger[…]` becomes its label) and
// rewrite reference tokens in every text node.
function stripGazette(node, figMap, warnings) {
  if (!node.children) return;
  const out = [];
  for (const child of node.children) {
    if (DIRECTIVE_TYPES.has(child.type)) {
      stripGazette(child, figMap, warnings);
      out.push(...child.children);
    } else if (child.type === "text") {
      child.value = transformValue(child.value, figMap, warnings);
      out.push(child);
    } else {
      stripGazette(child, figMap, warnings);
      out.push(child);
    }
  }
  node.children = out;
}

// Parse `markdown` and return the abstract as a Markdown string. `warnings` (if
// provided) collects non-fatal issues (e.g. a reference to an unknown figure).
export function extractAbstract({ markdown, warnings = [] }) {
  const processor = makeProcessor();
  const tree = processor.parse(escapeFigColons(markdown));

  const paragraph = tree.children.find((n) => n.type === "paragraph");
  if (!paragraph) {
    throw new Error("no paragraph found to use as the abstract");
  }

  const figMap = buildFigureMap(tree);
  stripGazette(paragraph, figMap, warnings);

  const out = processor.stringify({ type: "root", children: [paragraph] });
  return out.trimEnd();
}
