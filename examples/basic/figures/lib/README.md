# figures/lib — author-owned figure libraries

These are the shared ES modules the figure components import at runtime. They are
**part of this project, not of gazette** — gazette copies `figures/` verbatim
into the build output, so whatever you put here ships as-is and your components'
relative `./lib/…` imports resolve both in source and in `dist/` (components live
directly in `figures/`, so `lib/` is a sibling).

Contents:

- `d3.js`, `plot.js` — pre-built ES-module bundles of
  [`d3@7`](https://github.com/d3/d3) and
  [`@observablehq/plot@0.6`](https://github.com/observablehq/plot), e.g. fetched
  from esm.sh:
  ```sh
  curl -L https://esm.sh/d3@7.9.0?bundle               -o figures/lib/d3.js
  curl -L https://esm.sh/@observablehq/plot@0.6.17?bundle -o figures/lib/plot.js
  ```
- `colors.js` — a small project helper (`colorScale` / `buildLegend` /
  `linkLegendHighlight`) shared across components.

Ship plain pre-built modules here rather than letting a host bundler own them;
that is what keeps the islands working identically across the static, next, and
pdf targets.