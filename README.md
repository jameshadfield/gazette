# gazette

A Node CLI that compiles a single Markdown source into a self-contained,
interactive scientific document. One Markdown file — with YAML frontmatter,
`$…$` math, `[@key]` citations, `[@fig:slug]` cross-references, and
`:::figure{…}` interactive-figure directives — is parsed once to a shared tree
and rendered per target.

There are a number of **targets**:

* `static` produces a stand-alone HTML site suitable for GitHub Pages etc
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
gazette build    <input> --target pdf             # → <root>/dist/paper.pdf
gazette snapshot <input> [--only fig:slug]        # regenerate raster figure fallbacks
gazette dev      <input> [--port 8080]
```

`--target all` builds the `static` and `pdf` targets in one pass.

`<input>` is the **Markdown entry file**.

Options: `--out <dir>`, `--bib <file>` (default `<root>/references.bib`),
`--figures <dir>` (default `<root>/figures`), `--theme <dir>` (override
`tokens.css` + optional `fonts/`), `--no-fallback-hide` (debug: keep the static
fallback visible under the island), `--snapshot` (regenerate raster fallbacks
before building).

The `pdf` target and `gazette snapshot` need headless Chrome. `puppeteer` is an
**optional dependency** (installed by default, but safe to skip on machines that
only build `static`).

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

The reference surface is the **viewport**. In print the breakout is dropped and
the figure returns to the text block.

### Plain image figures

Not every figure needs a directive, a caption, or a cross-reference. A paragraph
whose only content is a single Markdown image — bare, or wrapped in a link — is
rendered as a bare `<figure>` (no `<figcaption>`, no figure number):

```markdown
![Filter on all metadata](filter-on-metadata.png)
[![Filter on all metadata](filter-on-metadata.png)]()
[![Filter on all metadata](filter-on-metadata.png)](https://example.com)
```

all produce:

```html
<figure class="gazette-figure">
  <img class="gazette-figure-img" src="figures/filter-on-metadata.png" alt="Filter on all metadata">
</figure>
```

- The `src` resolves into `figures/` exactly as a static figure's `image:` does
  (`name.png → figures/name.png`, `sub/name.png → figures/sub/name.png`). Absolute
  URLs (`https://…`, `/…`) are passed through untouched.
- An empty-href wrapper (`[…]()`) is just a figure marker and is dropped; a real
  href keeps the image clickable (`<a href>` is preserved around the `<img>`).
- The alt text is kept verbatim — with no caption it is the figure's only
  accessible description, so write it to describe the image.
- Only a paragraph that is *nothing but* one image qualifies. An image mixed with
  text, or more than one image in a paragraph, stays ordinary inline content.

### Embedded apps (`standalone`)

Set `standalone: true` in the YAML block for a component that is a self-contained
app rather than a simple chart — one that brings its own CSS and expects to render
on a plain page, not inside gazette's styled document.

```yaml gazette
component: auspice-wrapper.js
standalone: true
```

The flag marks the figure's mount (`.gazette-mount--standalone`) as a
style-isolation boundary. gazette's reset, bare-element rules and inherited typography are confined
to a donut scope that **stops** at that mount, so an embedded app brings its own
styles without the paper's cascade bleeding in. (The scope uses CSS `@scope`; see
`assets/css/gazette.css`.) It is a no-op for an ordinary chart component, which is
happy to inherit the paper's typography.

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
no-JS static page and the `pdf` print. Sizing flags:
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
the affiliations of the **`static`** page (never in the printed PDF itself). This
build doesn't generate the PDF; it **asserts** it already
exists at `<out>/paper.pdf` (build it with `--target pdf`, or `--target all`,
which builds `pdf` first) and copies it beside the page for download. As with the
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
  render/               document (frontmatter), target-static, target-pdf
                        headless.js (shared Chrome engine), snapshots.js (raster fallbacks)
  assets/               copy.js (vendoring)
runtime/gazette-runtime.js   trigger → gazette:update delegation (static target)
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
