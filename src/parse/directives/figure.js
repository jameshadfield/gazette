// Lower `:::figure{#fig:slug}` container directives into the figure scaffold.
//
// Identity (`#fig:slug`) stays in the directive attributes; the figure's source
// and render options are authored as a fenced YAML block tagged with the
// `gazette` meta marker inside the directive body. A figure is one of two kinds:
//
// INTERACTIVE (`component:`) — a .js island hydrated over a static fallback:
//
//   :::figure{#fig:demo-trend}
//   ```yaml gazette
//   component: trend-line.js      # → figures/trend-line.js
//   data:                         # → render(container, { key: parsedJson }, opts)
//     points: demo.json           #   bare name → figures/data/demo.json
//     colors: palette.json
//   opts:                         # merged into render opts (after {mode:"inline"})
//     log: false
//   ```
//   **Caption lead-in.** body…
//   :::
//
// STATIC (`image:`) — a plain image, no island/mount/hydration:
//
//   :::figure{#fig:static-example}
//   ```yaml gazette
//   image: filename.png           # → figures/filename.png
//   ```
//   **Caption lead-in.** body…
//   :::
//
// Exactly one of `component` / `image` must be set. An optional `max-width=<n>vw`
// directive attribute applies to either kind (breakout wider than the column).
//
// The YAML is parsed with js-yaml's JSON_SCHEMA so scalar typing matches JSON
// (no YAML "Norway problem": bare `no`/`on`/dates stay strings; numbers/bools/
// lists resolve as expected). The block is removed from the body; the remaining
// prose is the caption.
//
// Output HTML — interactive:
//   <figure id="fig-slug" class="gazette-figure">
//     <div id="gazette-mount-N" class="gazette-mount"></div>
//     <img class="gazette-static-fallback" src="figures/slug.png" alt="">
//     <figcaption><p><span class="gazette-figure-label">Figure N.</span> …</p></figcaption>
//     <gazette-hydration data-mount="gazette-mount-N"></gazette-hydration>
//   </figure>
// Output HTML — static:
//   <figure id="fig-slug" class="gazette-figure">
//     <img class="gazette-figure-img" src="figures/filename.png" alt="">
//     <figcaption><p><span class="gazette-figure-label">Figure N.</span> …</p></figcaption>
//   </figure>
import { visit } from "unist-util-visit";
import yaml from "js-yaml";

// Author-supplied asset references (component, data, image) are resolved under
// figures/ and emitted into the page as import()/fetch()/src URLs. Reject any
// value that would escape the figures/ tree or name a remote resource: a URL
// scheme, a protocol-relative `//host`, an absolute path, a `..` segment, or a
// backslash. Without this a value like `../../secret.json` or
// `https://evil.example/x.js` would be written verbatim into the output.
function assertSafeRelPath(where, label, file) {
  const f = String(file);
  if (/^[a-z][a-z0-9+.-]*:/i.test(f) || f.startsWith("//")) {
    throw new Error(`${where}: ${label} must be a local path under figures/, not a URL (got ${JSON.stringify(file)})`);
  }
  if (f.startsWith("/") || f.includes("\\") || /(^|\/)\.\.(\/|$)/.test(f)) {
    throw new Error(
      `${where}: ${label} must stay within figures/ — no absolute paths, "..", or backslashes (got ${JSON.stringify(file)})`
    );
  }
}

// A bare filename resolves under figures/data/; a path with a slash is taken
// relative to the figures root (e.g. shared/palette.json, lib/foo.json).
function resolveDataPath(file) {
  if (file.includes("/")) return `figures/${file.replace(/^\.\//, "")}`;
  return `figures/data/${file}`;
}

// Image assets for a static figure resolve relative to the figures root: a bare
// filename lands in figures/ (alongside components), a path with a slash keeps
// its subfolders (e.g. img/plot.png → figures/img/plot.png).
function resolveFigureAsset(file) {
  return `figures/${file.replace(/^\.\//, "")}`;
}

// An absolute reference the author owns the full path of — an external URL
// (scheme:, protocol-relative //host, or data:) or a site-root path (/…). These
// are left untouched; only project-relative image sources are resolved into the
// figures/ tree.
function isAbsoluteUrl(src) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("/");
}

// Resolve a plain Markdown image's `src` the same way a static figure's `image:`
// resolves: project-relative sources land under figures/. Absolute URLs and
// sources already under figures/ are passed through unchanged.
function resolveImageSrc(src) {
  if (!src) return src;
  if (isAbsoluteUrl(src)) return src;
  const clean = src.replace(/^\.\//, "");
  if (clean === "figures" || clean.startsWith("figures/")) return clean;
  return resolveFigureAsset(src);
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function hasGazetteMeta(node) {
  return (
    node.type === "code" &&
    String(node.meta || "")
      .trim()
      .split(/\s+/)
      .includes("gazette")
  );
}

export function remarkFigures() {
  return (tree, file) => {
    const islands = (file.data.islands ||= []);
    const figuresBySlug = (file.data.figuresBySlug ||= new Map());
    let counter = 0;

    visit(tree, (n) => n.type === "containerDirective" && n.name === "figure", (node) => {
      counter++;
      const attrs = node.attributes || {};
      const slug = String(attrs.id || "").replace(/^fig:/, "");
      const figId = `fig-${slug}`;
      const mountId = `gazette-mount-${counter}`;
      const where = `figure #fig:${slug}`;

      // Pull out and parse the `yaml gazette` config block.
      const blockIndex = node.children.findIndex(hasGazetteMeta);
      if (blockIndex < 0) {
        throw new Error(`${where}: missing a \`\`\`yaml gazette config block`);
      }
      let config;
      try {
        config = yaml.load(node.children[blockIndex].value, { schema: yaml.JSON_SCHEMA }) || {};
      } catch (err) {
        throw new Error(`${where}: invalid gazette YAML block — ${err.message}`);
      }
      node.children.splice(blockIndex, 1);

      // A figure is either INTERACTIVE (`component:` — a .js island hydrated over
      // a static fallback) or STATIC (`image:` — a plain image, no island/mount).
      // Exactly one of the two keys must be set.
      const hasComponent = typeof config.component === "string" && config.component;
      const hasImage = typeof config.image === "string" && config.image;
      if (hasComponent && hasImage) {
        throw new Error(`${where}: set either \`component\` (interactive) or \`image\` (static), not both`);
      }
      if (!hasComponent && !hasImage) {
        throw new Error(`${where}: gazette block must set \`component\` (interactive) or \`image\` (static)`);
      }

      figuresBySlug.set(slug, { number: counter, figId });

      // Caption: whatever prose remains after the config block is removed. Shared
      // by both figure kinds.
      const caption = node.children;
      const label = {
        type: "gazetteLabel",
        data: { hName: "span", hProperties: { className: ["gazette-figure-label"] } },
        children: [{ type: "text", value: `Figure ${counter}.` }],
      };
      if (caption[0] && caption[0].type === "paragraph") {
        caption[0].children.unshift(label, { type: "text", value: " " });
      } else {
        caption.unshift({ type: "paragraph", children: [label, { type: "text", value: " " }] });
      }
      const figcaption = { type: "gazetteCaption", data: { hName: "figcaption" }, children: caption };

      // Optional breakout width (`max-width=90vw`) applies to either kind: it lets
      // a figure grow wider than the text column (up to that fraction of the
      // rendering surface), staying centered and leaving surrounding content
      // untouched. Only vw values are accepted; the magnitude is emitted unit-less
      // (--gazette-fig-vw) and the stylesheet binds it to the viewport (vw).
      const figProps = { id: figId, className: ["gazette-figure"] };
      const rawMaxWidth = attrs["max-width"];
      if (rawMaxWidth != null && String(rawMaxWidth).trim() !== "") {
        const m = String(rawMaxWidth).trim().match(/^(\d+(?:\.\d+)?)vw$/);
        if (!m) {
          throw new Error(
            `${where}: max-width must be a vw value like 90vw (got ${JSON.stringify(rawMaxWidth)})`
          );
        }
        figProps.className.push("gazette-figure--wide");
        figProps.style = `--gazette-fig-vw: ${m[1]}`;
      }
      node.data = { hName: "figure", hProperties: figProps };

      // --- Static figure: one <img>, no mount, no island, no hydration. ---
      if (hasImage) {
        if (!IMAGE_RE.test(config.image)) {
          throw new Error(
            `${where}: \`image\` must be an image file (png/jpg/jpeg/gif/webp/avif/svg; got "${config.image}")`
          );
        }
        assertSafeRelPath(where, "`image`", config.image);
        const image = {
          type: "gazetteImage",
          data: {
            hName: "img",
            hProperties: { className: ["gazette-figure-img"], src: resolveFigureAsset(config.image), alt: "" },
          },
          children: [],
        };
        node.children = [image, figcaption];
        return;
      }

      // --- Interactive figure: a component island over a static fallback. ---
      const component = config.component;
      if (!component.endsWith(".js")) {
        throw new Error(`${where}: \`component\` must end in .js (got "${component}")`);
      }
      assertSafeRelPath(where, "`component`", component);

      // data: { key: <.json file> } → render receives { key: parsedJson }.
      const dataConfig = config.data && typeof config.data === "object" ? config.data : {};
      const data = {};
      for (const [key, value] of Object.entries(dataConfig)) {
        if (typeof value !== "string" || !value.endsWith(".json")) {
          throw new Error(`${where}: data["${key}"] must be a .json filename (got ${JSON.stringify(value)})`);
        }
        assertSafeRelPath(where, `data["${key}"]`, value);
        data[key] = { name: value, path: resolveDataPath(value) };
      }

      const opts = config.opts && typeof config.opts === "object" ? config.opts : {};

      // `standalone: true` marks this island's mount as a style-isolation boundary
      // (the `.gazette-mount--standalone` class): gazette's reset, bare-element
      // rules and inherited typography are confined to a donut `@scope` that stops
      // at the mount, so an embedded app (e.g. a whole SPA that brings its own CSS)
      // renders without the paper's cascade bleeding in. See assets/css/gazette.css.
      const standalone = config.standalone === true;

      islands.push({
        figId,
        slug,
        mountId,
        component,
        modulePath: `figures/${component}`,
        data,
        fallback: `figures/${slug}.png`,
        opts,
      });

      const mountClasses = standalone ? ["gazette-mount", "gazette-mount--standalone"] : ["gazette-mount"];
      const mount = {
        type: "gazetteMount",
        data: { hName: "div", hProperties: { id: mountId, className: mountClasses } },
        children: [],
      };
      const img = {
        type: "gazetteFallback",
        data: { hName: "img", hProperties: { className: ["gazette-static-fallback"], src: `figures/${slug}.png`, alt: "" } },
        children: [],
      };
      const hydration = {
        type: "gazetteHydration",
        data: { hName: "gazette-hydration", hProperties: { "data-mount": mountId } },
        children: [],
      };
      node.children = [mount, img, figcaption, hydration];
    });
  };
}

// Non-whitespace children of a node: text nodes that are only whitespace (the
// blank lines/indentation around a block image) don't count toward "the
// paragraph is nothing but an image".
function significantChildren(node) {
  return (node.children || []).filter(
    (c) => !(c.type === "text" && String(c.value || "").trim() === "")
  );
}

// If `node` is an image, or a link wrapping a single image, return
// { image, link } (link present only when the wrapper has a non-empty href).
// Otherwise return null.
function asFigureImage(node) {
  if (!node) return null;
  if (node.type === "image") return { image: node, link: null };
  if (node.type === "link") {
    const inner = significantChildren(node);
    if (inner.length === 1 && inner[0].type === "image") {
      const href = String(node.url || "").trim();
      return { image: inner[0], link: href ? node : null };
    }
  }
  return null;
}

// Lower a plain Markdown block image into a bare <figure> — no figcaption,
// number, or cross-reference identity (those belong to `:::figure` directives).
//
// A paragraph whose only content is a single image, bare or wrapped in a link,
// becomes a figure:
//
//   ![Filter on all metadata](filter-on-metadata.png)
//   [![Filter on all metadata](filter-on-metadata.png)]()          → src figures/…
//   [![Filter on all metadata](filter-on-metadata.png)](https://…) → clickable
//
// Output HTML:
//   <figure class="gazette-figure">
//     <img class="gazette-figure-img" src="figures/filter-on-metadata.png" alt="Filter on all metadata">
//   </figure>
//
// The image's `src` resolves into figures/ exactly as a static figure's `image:`
// does (absolute URLs pass through). An empty-href link wrapper (`[…]()`) is a
// figure marker and is dropped; a real href keeps the image clickable. The alt
// text is preserved verbatim — with no figcaption it is the figure's only
// accessible description. Paragraphs that mix an image with other text, or hold
// more than one image, are left as ordinary inline content.
export function remarkMarkdownFigures() {
  return (tree) => {
    visit(tree, "paragraph", (node) => {
      const kids = significantChildren(node);
      if (kids.length !== 1) return;
      const found = asFigureImage(kids[0]);
      if (!found) return;

      const { image, link } = found;
      image.url = resolveImageSrc(image.url);
      image.data = image.data || {};
      image.data.hProperties = {
        ...(image.data.hProperties || {}),
        className: ["gazette-figure-img"],
      };

      node.data = { hName: "figure", hProperties: { className: ["gazette-figure"] } };
      node.children = [link || image];
    });
  };
}
