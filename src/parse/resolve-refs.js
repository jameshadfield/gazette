// hast transform (runs after remark-rehype + rehype-katex) that resolves the
// bracketed reference syntax in the prose text:
//
//   [@fig:slug]            -> <a href="#fig-slug">Figure N</a>   (cross-reference)
//   [@key]  [@k1; @k2]     -> [<a href="#ref-k1">N</a>, …]       (citation)
//
// A bracket group is only rewritten when *every* `;`-separated token is a
// well-formed @token of one kind; otherwise it is left verbatim (so a malformed
// group like `[dorp2021estimating; @volz2023fitness]` stays as literal text,
// matching the studied output). Citation numbers are assigned by first
// appearance in document order, and the numbered reference list is appended as a
// <section class="gazette-references"> at the end of the body.

import { formatReference } from "../bibtex.js";

const BRACKET_RE = /\[([^\]\[]+)\]/g;
const SKIP_TAGS = new Set(["code", "pre", "a", "script", "style"]);

function el(tagName, properties, children) {
  return { type: "element", tagName, properties: properties || {}, children: children || [] };
}
function txt(value) {
  return { type: "text", value };
}

function isSkipped(node) {
  if (node.type !== "element") return false;
  if (SKIP_TAGS.has(node.tagName)) return true;
  const cls = node.properties && node.properties.className;
  return Array.isArray(cls) && cls.some((c) => String(c).startsWith("katex") || String(c).startsWith("math"));
}

export function rehypeResolveRefs(options = {}) {
  const { bib = {}, warnings = [] } = options;

  return (tree, file) => {
    const figuresBySlug = file.data.figuresBySlug || new Map();
    const citedKeys = (file.data.citedKeys ||= []);
    const citeNumbers = (file.data.citeNumbers ||= new Map());

    function citeNumber(key) {
      let n = citeNumbers.get(key);
      if (n == null) {
        n = citedKeys.length + 1;
        citeNumbers.set(key, n);
        citedKeys.push(key);
      }
      return n;
    }

    // Classify a bracket's inner content; return replacement hast nodes, or null
    // to leave the literal `[...]` untouched.
    function resolveBracket(inner) {
      const tokens = inner.split(";").map((t) => t.trim());
      if (tokens.length === 0) return null;

      // Cross-reference group: every token is @fig:slug
      if (tokens.every((t) => /^@fig:[^\s;]+$/.test(t))) {
        const out = [];
        tokens.forEach((t, i) => {
          const slug = t.slice(5); // drop "@fig:"
          const fig = figuresBySlug.get(slug);
          if (!fig) {
            warnings.push(`cross-reference to unknown figure: [@fig:${slug}]`);
            return null;
          }
          if (i > 0) out.push(txt(", "));
          out.push(el("a", { href: `#${fig.figId}` }, [txt(`Figure ${fig.number}`)]));
        });
        return out.length ? out : null;
      }

      // Citation group: every token is a bare @key (no colon)
      if (tokens.every((t) => /^@[^\s:;]+$/.test(t))) {
        const keys = tokens.map((t) => t.slice(1));
        const missing = keys.filter((k) => !bib[k]);
        if (missing.length) {
          warnings.push(`citation key(s) not found in bibliography: ${missing.join(", ")}`);
          return null;
        }
        const out = [txt("[")];
        keys.forEach((k, i) => {
          if (i > 0) out.push(txt(", "));
          out.push(el("a", { href: `#ref-${k}` }, [txt(String(citeNumber(k)))]));
        });
        out.push(txt("]"));
        return out;
      }

      return null;
    }

    function processText(value) {
      const nodes = [];
      let last = 0;
      let m;
      BRACKET_RE.lastIndex = 0;
      while ((m = BRACKET_RE.exec(value))) {
        const replacement = resolveBracket(m[1]);
        if (!replacement) continue;
        if (m.index > last) nodes.push(txt(value.slice(last, m.index)));
        nodes.push(...replacement);
        last = m.index + m[0].length;
      }
      if (nodes.length === 0) return null; // unchanged
      if (last < value.length) nodes.push(txt(value.slice(last)));
      return nodes;
    }

    function walk(node, skip) {
      if (!node.children) return;
      const next = [];
      for (const child of node.children) {
        if (child.type === "text" && !skip) {
          const replaced = processText(child.value);
          if (replaced) next.push(...replaced);
          else next.push(child);
        } else {
          walk(child, skip || isSkipped(child));
          next.push(child);
        }
      }
      node.children = next;
    }

    walk(tree, false);

    wrapAcknowledgments(tree);
    appendReferences(tree, citedKeys, bib);
  };
}

// Wrap the "Acknowledgments" h2 and its following siblings (up to the next h2)
// in <section class="gazette-acknowledgments">, reproducing the studied output.
function wrapAcknowledgments(tree) {
  const kids = tree.children;
  const start = kids.findIndex(
    (n) => n.type === "element" && n.tagName === "h2" && n.properties && n.properties.id === "acknowledgments"
  );
  if (start < 0) return;
  let end = start + 1;
  while (end < kids.length && !(kids[end].type === "element" && kids[end].tagName === "h2")) end++;
  const section = el("section", { className: ["gazette-acknowledgments"] }, kids.slice(start, end));
  tree.children = [...kids.slice(0, start), section, ...kids.slice(end)];
}

function appendReferences(tree, citedKeys, bib) {
  if (!citedKeys.length) return;
  const items = citedKeys.map((key) =>
    el("li", { id: `ref-${key}`, className: ["gazette-reference"] }, [txt(formatReference(bib[key]))])
  );
  const section = el("section", { className: ["gazette-references"], "aria-label": "References" }, [
    el("h2", {}, [txt("References")]),
    el("ol", { className: ["gazette-reference-list"] }, items),
  ]);
  tree.children.push(section);
}
