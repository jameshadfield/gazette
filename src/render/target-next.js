// The `next` target: a server-rendered article body plus a hydration manifest,
// consumed by the host app's <GazettePaper>/<GazetteHydrator> companion
// components (runtime/next/) rather than inline scripts.
//
// Unlike the static target there are NO inline <script> tags: the
// <gazette-hydration> placeholders are dropped and each figure mount is wired
// from the manifest at runtime, inside a single shadow root the host attaches.
// The parse IR already carries everything needed (data.islands with
// modulePath/data/opts, data.triggers, data.frontmatter).
import { renderFrontmatter } from "./document.js";
import { joinBase } from "../assets/resolve.js";

// The server-rendered body: frontmatter header + parsed body HTML, with the
// hydration placeholders removed and figure fallback images rewritten to
// base-path-absolute URLs. No <article> wrapper — the host supplies
// <article class="gazette-paper"> inside the shadow root.
export function renderNextArticle({ html, data, basePath, pdfDownload = false }) {
  let body = html;
  // Manifest-driven hydration replaces inline scripts; drop the placeholders.
  body = body.replace(/<gazette-hydration[^>]*><\/gazette-hydration>/g, "");
  // Rewrite figure fallback <img src="figures/…"> to the base path.
  body = body.replace(
    /(<img\b[^>]*\bsrc=")(figures\/[^"]*)(")/g,
    (_m, pre, rel, post) => pre + joinBase(basePath, rel) + post
  );

  const pdfHref = pdfDownload ? joinBase(basePath, "paper.pdf") : undefined;
  const header = renderFrontmatter(data.frontmatter, { pdfHref });
  return `${header}\n${body}`;
}

// The hydration manifest: everything the client hydrator needs, with module and
// data paths resolved to base-path-absolute URLs it can import()/fetch directly.
export function buildManifest({ data, basePath }) {
  const islands = (data.islands || []).map((i) => {
    const dataUrls = {};
    for (const [key, d] of Object.entries(i.data || {})) {
      dataUrls[key] = joinBase(basePath, d.path);
    }
    return {
      figId: i.figId,
      mountId: i.mountId,
      module: joinBase(basePath, i.modulePath),
      data: dataUrls,
      opts: i.opts || {},
      lightDom: i.lightDom === true,
    };
  });

  return {
    basePath: String(basePath || "").replace(/\/+$/, ""),
    stylesheet: joinBase(basePath, "gazette.shadow.css"),
    frontmatter: data.frontmatter || {},
    islands,
    triggers: data.triggers || [],
  };
}
