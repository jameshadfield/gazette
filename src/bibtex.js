// Minimal BibTeX parser + numeric (Vancouver/PLOS-ish) reference formatter.
//
// This is deliberately small and dependency-free. It covers the common BibDesk
// `@article{key, field = {value}, …}` shape and a pragmatic subset of LaTeX
// accent/brace escaping — enough to reproduce the reference list seen in the
// studied gh-pages output. A full CSL implementation (author-year, locale
// handling, every entry type) is a documented follow-up; see todo.md.

const COMBINING = {
  '"': "̈", // diaeresis
  "'": "́", // acute
  "`": "̀", // grave
  "^": "̂", // circumflex
  "~": "̃", // tilde
  "=": "̄", // macron
  ".": "̇", // dot above
};

const LIGATURES = new Map([
  ["{\\L}", "Ł"], ["{\\l}", "ł"],
  ["{\\o}", "ø"], ["{\\O}", "Ø"],
  ["{\\aa}", "å"], ["{\\AA}", "Å"],
  ["{\\ss}", "ß"],
  ["{\\ae}", "æ"], ["{\\AE}", "Æ"],
  ["{\\oe}", "œ"], ["{\\OE}", "Œ"],
]);

function applyAccent(acc, ch) {
  return (ch + COMBINING[acc]).normalize("NFC");
}

// Convert a LaTeX-escaped BibTeX value into readable Unicode. Targeted, not
// exhaustive: known ligatures, the standard accent commands, cedilla, then a
// final pass that drops the brace groups BibTeX uses to protect capitalization.
export function deLatex(str) {
  if (!str) return "";
  let s = str;
  for (const [k, v] of LIGATURES) s = s.split(k).join(v);
  // {\"a}, {\'e}, {\"{a}} …
  s = s.replace(/\{\\(["'`^~=.])\s*\{?([A-Za-z])\}?\}/g, (_m, acc, ch) => applyAccent(acc, ch));
  // bare \"a, \'{e} …
  s = s.replace(/\\(["'`^~=.])\s*\{?([A-Za-z])\}?/g, (_m, acc, ch) => applyAccent(acc, ch));
  // cedilla {\c c}
  s = s.replace(/\{\\c\s*([A-Za-z])\}/g, (_m, ch) => (ch === "c" ? "ç" : ch === "C" ? "Ç" : ch));
  // remaining protective braces
  s = s.replace(/[{}]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function parseFields(str) {
  const fields = {};
  let i = 0;
  const n = str.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(str[i])) i++;
    if (i >= n) break;
    const eq = str.indexOf("=", i);
    if (eq < 0) break;
    const name = str.slice(i, eq).trim().toLowerCase();
    i = eq + 1;
    while (i < n && /\s/.test(str[i])) i++;
    let val = "";
    if (str[i] === "{") {
      let depth = 0, j = i;
      for (; j < n; j++) {
        if (str[j] === "{") depth++;
        else if (str[j] === "}" && --depth === 0) { j++; break; }
      }
      val = str.slice(i + 1, j - 1);
      i = j;
    } else if (str[i] === '"') {
      let j = i + 1;
      for (; j < n && str[j] !== '"'; j++);
      val = str.slice(i + 1, j);
      i = j + 1;
    } else {
      let j = i;
      while (j < n && str[j] !== "," && str[j] !== "\n") j++;
      val = str.slice(i, j).trim();
      i = j;
    }
    if (name) fields[name] = val;
  }
  return fields;
}

// Parse a BibTeX string into { key: { key, type, fields } }.
export function parseBibtex(src) {
  const entries = {};
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf("@", i);
    if (at < 0) break;
    const brace = src.indexOf("{", at);
    if (brace < 0) break;
    const type = src.slice(at + 1, brace).trim().toLowerCase();
    let depth = 0, end = -1;
    for (let j = brace; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) { end = j; break; }
    }
    if (end < 0) break;
    const content = src.slice(brace + 1, end);
    if (!["comment", "preamble", "string"].includes(type)) {
      const comma = content.indexOf(",");
      if (comma > 0) {
        const key = content.slice(0, comma).trim();
        if (key) entries[key] = { key, type, fields: parseFields(content.slice(comma + 1)) };
      }
    }
    i = end + 1;
  }
  return entries;
}

function formatAuthors(field) {
  return field
    .split(/\s+and\s+/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const clean = deLatex(a);
      if (clean.toLowerCase() === "others") return "others";
      let last, firsts;
      if (clean.includes(",")) {
        const [l, f] = clean.split(",");
        last = l.trim();
        firsts = (f || "").trim();
      } else {
        const parts = clean.split(/\s+/);
        last = parts.pop();
        firsts = parts.join(" ");
      }
      const initials = firsts
        .split(/[\s.-]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase())
        .join("");
      return initials ? `${last} ${initials}` : last;
    })
    .join(", ");
}

// Numeric reference line: "Authors. Title. Journal. Year;Volume:Pages."
export function formatReference(entry) {
  if (!entry) return "";
  const f = entry.fields;
  const authors = f.author ? formatAuthors(f.author) : "";
  const title = deLatex(f.title || "");
  const journal = deLatex(f.journal || f.booktitle || f.publisher || "");
  const year = f.year || (f.date ? String(f.date).slice(0, 4) : "");
  const volume = f.volume || "";
  const pages = (f.pages || "").replace(/--/g, "-").replace(/\s/g, "");

  let out = "";
  if (authors) out += authors.replace(/\.?$/, "") + ". ";
  if (title) out += title.replace(/\.?$/, "") + ". ";
  if (journal) out += journal.replace(/\.?$/, "") + ". ";
  if (year) {
    out += year;
    if (volume) {
      out += ";" + volume;
      if (pages) out += ":" + pages;
    } else if (pages) {
      out += ":" + pages;
    }
    out += ".";
  }
  return out.trim();
}
