# gazette

A Node CLI that compiles a single Markdown source into a self-contained,
interactive scientific document. One Markdown file — with YAML frontmatter,
`$…$` math, `[@key]` citations, `[@fig:slug]` cross-references, and
`:::figure{…}` interactive-figure directives — is parsed once to a shared tree
and rendered per target.

There are a number of **targets**:

* `static` produces a stand-alone HTML site suitable for GitHub Pages etc
* `next` produces a modified HTML intended for use in Nextstrain.org's next.js site
* `pdf` produces a PDF file via a headless browser

## Install

```sh
npm install        # install dependencies
npm link           # put `gazette` on your PATH
```

Requires Node ≥ 20. Pure ESM.

## Usage

```sh
gazette build    <input> --target static [options]
gazette build    <input> --target next --base-path /gazette --out <public-dir>
gazette build    <input> --target pdf             # → <root>/dist/paper.pdf
gazette snapshot <input> [--only fig:slug]        # regenerate raster figure fallbacks
gazette dev      <input> [--port 8080]
```

`--target all` builds the `static`, `next`, and `pdf` targets in one pass.

`<input>` is the **Markdown entry file**.

Options: `--out <dir>`, `--bib <file>` (default `<root>/references.bib`),
`--figures <dir>` (default `<root>/figures`), `--theme <dir>` (override
`tokens.css` + optional `fonts/`), `--no-fallback-hide` (debug: keep the static
fallback visible under the island), `--base-path <path>` (reserved for the
next/pdf targets), `--snapshot` (regenerate raster fallbacks before building).

The `pdf` target and `gazette snapshot` need headless Chrome. `puppeteer` is an
**optional dependency** (installed by default, but safe to skip on machines that
only build `static`/`next`).

## Try the example

```sh
node bin/gazette.js build examples/basic/paper.md --target static
# → examples/basic/dist/static/index.html

# preview over http (module imports/fetches don't work over file://):
gazette dev examples/basic/paper.md --port 8080
# open http://localhost:8080
```

`examples/basic/` is a minimal document that exercises the whole pipeline:
frontmatter, inline + display math, one bibliographic citation, one interactive
Observable-Plot island (`figures/trend-line.js`) over a static PNG fallback, a
prose `:trigger` control that drives the island via the `update` contract, and
an auto-generated reference list.

## The figure directive

A figure is a `:::figure{#fig:slug}` container whose body holds a fenced YAML
config block (tagged with the `gazette` meta marker) plus the caption prose:

````markdown
:::figure{#fig:demo-trend}
```yaml gazette
component: trend-line.js      # → figures/trend-line.js, its `render` export
data:                         # → render(container, { key: parsedJson }, opts)
  points: demo.json           #   bare name → figures/data/demo.json
  colors: palette.json        #   a path with "/" is taken relative to figures/
opts:                         # merged after { mode: "inline" }
  log: false
```
**Bold lead-in.** Caption body text…
:::
````

- `#fig:slug` (identity) is the only required attribute; `component`, `data`, and
  `opts` live in the YAML block, parsed with js-yaml's `JSON_SCHEMA` (JSON scalar
  typing, so no YAML date/`no`→`false` surprises; lists, numbers, and booleans work).
- `component` must end in `.js`; data values must end in `.json`.
- `data` is loaded into `{ key: parsedJson }` and passed as `render`'s second
  argument. Cross-reference it in prose with `[@fig:slug]`.
- Any `:trigger[label]{target=fig:slug update=…}` in the prose drives this
  figure's `update(arg)`; `update` is inline flow-YAML, so `arg` may be a string,
  number, or object (e.g. `update="{scale: log}"`).

### Wide figures (`max-width`)

An optional `max-width` attribute lets a single figure break out wider than the
text column while the rest of the content keeps its width:

```markdown
:::figure{#fig:demo-trend max-width=90vw}
```

The value is a `vw` fraction of the rendering surface. The figure stays centered
and its width is `max(text-column, <n>vw)`, so it is **never narrower than the
column, grows up to `<n>%` of the surface, and never overflows** it. The width is
measured from the mount and passed to `render` automatically — no component change
is needed, and the figure re-fits on resize.

The reference surface differs per target: the **viewport** in the `static`/`pdf`
targets, and the **host element** in the `next` embed (the shadow root makes `:host`
a size-query container, so a wide figure never spills out of wherever the embed is
placed). In print the breakout is dropped and the figure returns to the text block.

### Embedded apps (`lightDom`)

Set `lightDom: true` in the YAML block for a component that is a self-contained
app rather than a simple chart — one that queries `document`, listens for clicks
on `document` (e.g. click-outside-to-dismiss), or renders modals/portals into
`document.body`. By default a figure's mount lives inside gazette's styling
boundary, which breaks those document-level assumptions in the `next` target: its
whole document is isolated in a shadow root, so `document.querySelector` can't see
the mount, event targets are retargeted to the shadow host, and portals to
`document.body` escape the paper's styles. With `lightDom: true`, the `next`
runtime instead mounts the component in the **light DOM** and projects it back
into the figure's place with a `<slot>`, so the component runs exactly as it would
on a plain page while the rest of the paper keeps its shadow isolation.

```yaml gazette
component: auspice-wrapper.js
lightDom: true
```

The flag is a no-op on `static`/`pdf`, which have no shadow root — the component
is already in the light DOM there. It does, however, protect the component from
gazette's own global CSS on `static`: gazette's reset, bare-element rules and
inherited typography are confined to a donut scope that stops at the light-DOM
mount (`.gazette-mount--light`), so an embedded app brings its own styles without
the paper's cascade bleeding in — matching the isolation the shadow root gives for
free in `next`. (The scope uses CSS `@scope`; see `assets/css/gazette.css`.)

## Embedding in Next.js (the `next` target)

The `next` target compiles the same source into a bundle a host Next.js app
(App Router, React 18) embeds — the whole document isolated in **one shadow
root**, so its styles neither leak into the host app nor inherit from it.

```sh
gazette build examples/basic --target next --base-path /gazette --out examples/next/public
# → public/gazette/{article.html, manifest.json, gazette.shadow.css, fonts/, assets/katex/, figures/}
```

The host reads the bundle at build time and renders two companion components
(shipped in [`runtime/next/`](./runtime/next)):

```tsx
import { GazettePaper } from "gazette/next";
// ...read public/gazette/{article.html, manifest.json} for this page...
return <GazettePaper articleHtml={articleHtml} manifest={manifest} />;
```

`GazettePaper` (a server component) server-renders `article.html` into the light
DOM — crawlable, printable, visible with no JS. `GazetteHydrator` (`'use client'`)
then attaches the shadow root, loads `gazette.shadow.css`, moves the article
inside, and hydrates each figure from the manifest (dynamic `import()` of the
component module, data fetch, `render` with the measured width, `resize` +
`gazette:update` wiring) — with trigger clicks and `#fig`/`#ref` anchor jumps
scoped to the shadow root. A runnable host lives in
[`examples/next/`](./examples/next) (see its README). `--base-path` is the URL
prefix the bundle is served from (`public/<base-path>/`); the manifest's
module/data/stylesheet URLs are rewritten against it.

## Raster fallbacks (`gazette snapshot`) and the `pdf` target

Both run on one shared headless-Chrome engine (`src/render/headless.js`): launch
Chrome, load HTML, capture a PNG or a PDF. A real browser is used on purpose, so
`<canvas>`/WebGL components render exactly as they do live (an SVG/DOM shim would
not).

### Raster fallbacks

Every interactive figure sits over a static fallback image at
`figures/<slug>.png`. `gazette snapshot <input>` regenerates those PNGs by
actually running each component:

```sh
gazette snapshot examples/basic/paper.md            # all interactive figures
gazette snapshot examples/basic/paper.md --only fig:demo-trend
```

Each figure is rendered in isolation at a fixed width (default **800 px**,
captured at **2×** for a crisp 1600 px-wide PNG) with the real theme CSS/fonts
loaded, then the mount is screenshotted into the **source** `figures/` tree. The
PNGs are committed artifacts, so every target reuses the same real image: the
no-JS static page, the `next` SSR fallback, and the `pdf` print. Sizing flags:
`--snapshot-width <px>`, `--snapshot-scale <n>`.

Re-run `snapshot` (or build with `--snapshot`) whenever a component or its data
changes — gazette does **not** regenerate fallbacks on an ordinary build, and
does not yet detect when a committed PNG has gone stale; it is the author's
responsibility to re-snapshot.

### The `pdf` target

```sh
gazette build examples/basic/paper.md --target pdf   # → examples/basic/dist/paper.pdf
```

The PDF reuses the whole HTML pipeline: it renders the **no-JS** article (figures
show their baked raster fallback, no hydration), links a print stylesheet, and
prints the page through headless Chrome. Because it depends on the fallbacks, the
`pdf` build **fails with guidance** if any `figures/<slug>.png` is missing —
run `gazette snapshot` (or `gazette build --snapshot --target pdf`) first.

### Offering the PDF for download (`pdf-download`)

Set `pdf-download: true` in the frontmatter to add a "Download PDF" link under
the affiliations of the **`static`** and **`next`** pages (never in the printed
PDF itself). These builds don't generate the PDF; they **assert** it already
exists at `<out>/paper.pdf` (build it with `--target pdf`, or `--target all`,
which builds `pdf` first) and copy it beside the page for download. As with the
raster fallbacks, the shipped PDF is **not checked for staleness** — a page can
link a `paper.pdf` that lags its current content, and these out-of-sync cases are
left for a later pass; for now re-run the `pdf` build whenever the source changes.

## How it works

- **Parse once, render per target.** `src/parse/pipeline.js` builds a `unified`
  (remark/rehype) processor. Figure and trigger directives are lowered in mdast;
  math (KaTeX), citations, and cross-references are resolved in hast. The result
  is a body-HTML string plus an island/trigger/reference IR on the vfile.
- **A figure is an island over a static fallback.** Each `:::figure` emits a
  `<figure>` with an empty mount, a fallback `<img>`, a caption, and a neutral
  `<gazette-hydration>` placeholder. The static target replaces the placeholder
  with an inline ES-module script that imports the component, fetches its data,
  measures the mount and calls `render(container, data, { mode, width, …opts })`,
  hides the fallback, and wires resize + `gazette:update`. The component owns its
  height (typically derived from `width`); an explicit author `width` in `opts`
  overrides the measured one.
- **Prose drives figures.** `:trigger[label]{target=fig:slug update=…}` becomes a
  `.gazette-trigger` button; the shipped `runtime/gazette-runtime.js` turns a
  click into a `gazette:update` event on the target figure's mount, which calls
  the island's `update(arg)`. The `update` value is authored as inline flow-YAML
  (parsed with `JSON_SCHEMA`, same as figure opts) and carried as JSON, so `arg`
  can be a string (`update=toggle`), a number, or an object
  (`update="{scale: log, highlight: [BA.1]}"`).

## Layout

```
bin/gazette.js          CLI entry (commander)
src/
  config.js             normalize CLI input (entry file) + flags
  bibtex.js             minimal BibTeX parser + numeric formatter
  commands/             build, dev, snapshot
  parse/                pipeline, frontmatter, directives/, resolve-refs
  render/               document (frontmatter), target-static, target-next, target-pdf
                        headless.js (shared Chrome engine), snapshots.js (raster fallbacks)
  assets/               copy.js (vendoring), resolve.js (next base-path + shadow CSS)
runtime/gazette-runtime.js   trigger → gazette:update delegation (static target)
runtime/next/           GazettePaper + GazetteHydrator (next target companions)
assets/                 tokens.css, gazette.css, print.css, fonts, katex (document chrome, vendored)
templates/page.html     static HTML shell
examples/basic/         demo project
  paper.md  references.bib
  figures/
    trend-line.js       a component (flat in figures/; its render export)
    data/*.json         named datasets referenced from figure blocks
    demo-trend.png      raster fallback (figures/<slug>.png), generated by `gazette snapshot`
    lib/                d3.js, plot.js, colors.js — author-owned, see its README
```

The figure libraries (d3 / Observable Plot / shared helpers) are **the author
project's responsibility**, not gazette's: they live in the project's own
`figures/lib/` and travel with the `figures/` copy, so your components'
`../lib/…` imports resolve in both source and build. gazette vendors only the
document chrome — the theme CSS, fonts, and the KaTeX runtime (originating from
the `blab/fitness-flux` project; retain their licensing/attribution when
reusing).
