// The shared parse pipeline: one unified processor that turns the Markdown
// source into the article-body HTML plus the island/trigger/reference metadata
// collected on the vfile's `data`. Every target renders from this single IR.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

import { remarkExtractFrontmatter } from "./frontmatter.js";
import { remarkFigures, remarkMarkdownFigures } from "./directives/figure.js";
import { remarkTriggers } from "./directives/trigger.js";
import { rehypeResolveRefs } from "./resolve-refs.js";

// Escape the colon in cross-reference tokens (`@fig:slug`) so remark-directive
// does not parse `:slug` as a text directive. A backslash-escaped colon is
// consumed by the character-escape construct before the directive tokenizer sees
// it, and renders as a literal ":" — which the ref resolver then matches. Code
// spans and fenced code blocks are skipped so documentation like `[@fig:slug]`
// is left verbatim.
function escapeFigColons(md) {
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^(\s*)(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return replaceOutsideInlineCode(line);
    })
    .join("\n");
}

function replaceOutsideInlineCode(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      let tick = 0;
      while (line[i + tick] === "`") tick++;
      const fence = line.slice(i, i + tick);
      const close = line.indexOf(fence, i + tick);
      if (close >= 0) {
        out += line.slice(i, close + tick);
        i = close + tick;
        continue;
      }
      out += line.slice(i);
      break;
    }
    let j = i;
    while (j < line.length && line[j] !== "`") j++;
    out += line.slice(i, j).replace(/@fig:/g, "@fig\\:");
    i = j;
  }
  return out;
}

// Parse the document to the shared IR.
//
// Returns { html, data } where `html` is the serialized <article> body (without
// the frontmatter header, which each target builds from `data.frontmatter`) and
// `data` carries { frontmatter, islands, triggers, citedKeys, figuresBySlug }.
export async function parseDocument({ markdown, bib = {}, warnings = [] }) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkExtractFrontmatter)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFigures)
    .use(remarkMarkdownFigures)
    .use(remarkTriggers)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(rehypeResolveRefs, { bib, warnings })
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process(escapeFigColons(markdown));
  return { html: String(file), data: file.data };
}
