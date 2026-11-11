// The `static` target: a single self-contained index.html with inline ES-module
// island hydration — structural parity with the studied gh-pages output (plus
// the one new gazette:update listener line from the extended render contract).
import { renderFrontmatter } from "./document.js";

// Serialize a value to JSON that is safe to embed inside an inline <script>.
// JSON.stringify does not escape `/`, so a string containing `</script>` would
// otherwise close the script element (the HTML parser ends a <script> at the
// first literal `</script>` regardless of JS string context) and inject markup.
// Escaping `<`/`>` (and the U+2028/U+2029 line terminators, which are invalid in
// JS string literals) keeps the payload inside the script.
function jsonForScript(value) {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
}

// Inline hydration script for one island, injected in place of the figure's
// <gazette-hydration> placeholder. Paths are relative (./figures/…) so the page
// is portable. `data` is assembled as { key: parsedJson } from the figure's
// named datasets. Every author-controlled value embedded here (opts, data keys,
// data paths) goes through jsonForScript so it cannot break out of the <script>.
function inlineScript(island, hideFallback) {
  const optsJson = jsonForScript(island.opts || {});
  const entries = Object.entries(island.data || {});
  const dataBlock = entries.length
    ? `const data = {\n${entries
        .map(([key, d]) => `  ${jsonForScript(key)}: await fetch(${jsonForScript(`./${d.path}`)}).then((r) => r.json()),`)
        .join("\n")}\n};`
    : `const data = {};`;
  const hideBlock = hideFallback
    ? `
const fallback = mount.parentElement.querySelector(".gazette-static-fallback");
if (fallback) fallback.style.display = "none";`
    : "";
  // The host measures the mount and passes `width` into opts so the component
  // need not read layout itself (works under a DOM shim for SSR, and matches the
  // width handed to resize). An explicit author `width` in opts still wins.
  return `<script type="module">import { render } from ${jsonForScript(`./${island.modulePath}`)};
const mount = document.getElementById("${island.mountId}");
${dataBlock}
const inst = render(mount, data, Object.assign({ mode: "inline", width: mount.clientWidth }, ${optsJson}));
mount.dataset.hydrated = "1";${hideBlock}
if (inst && inst.resize) {
  new ResizeObserver(() => inst.resize(mount.clientWidth)).observe(mount);
}
if (inst && inst.update) {
  mount.addEventListener("gazette:update", (e) => inst.update(e.detail));
}</script>`;
}

// Build the <article> from the parsed body HTML + frontmatter, injecting one
// inline hydration script per island.
export function renderStaticArticle({ html, data, hideFallback = true, pdfHref }) {
  let body = html;
  for (const island of data.islands || []) {
    const re = new RegExp(`<gazette-hydration[^>]*data-mount="${island.mountId}"[^>]*></gazette-hydration>`);
    body = body.replace(re, () => inlineScript(island, hideFallback));
  }
  // Drop any placeholder that was not matched to an island (defensive).
  body = body.replace(/<gazette-hydration[^>]*><\/gazette-hydration>/g, "");

  const header = renderFrontmatter(data.frontmatter, { pdfHref });
  return `<article class="gazette-paper">\n${header}\n${body}\n</article>`;
}
