---
title: A basic gazette document
authors:
  - name: Ada Lovelace
    affiliations: [demo, inst]
  - name: Charles Babbage
    affiliations: [inst]
affiliations:
  - id: demo
    name: Gazette Example Lab, Somewhere, Earth
  - id: inst
    name: Analytical Institute, Elsewhere
pdf-download: true
date: 2026-10-28
---

## Abstract

This is a minimal example document for the `gazette` CLI. It exercises every part
of the pipeline in miniature: frontmatter, prose with inline marks, inline and
display math, an interactive figure rendered as an island over a static fallback,
a static image figure, a prose control that drives the island, one bibliographic
citation, and an auto-generated reference list. The [element reference](#element-reference)
below additionally shows every block the theme styles.

## Introduction

Gazette parses one Markdown source to a shared tree and renders it per target.
Content is authored semantically — math as `$…$`, citations as `[@key]`, figure
cross-references as `[@fig:slug]`, and figures as `:::figure{…}` directives — so
the same source can serve a static page, an embeddable build, and a print PDF.

Inline math such as $f_i = \log(1 + s_i)$ sits in the run of text, while display
math is set on its own line:

$$x_i(t) = \frac{p_i \, e^{f_i t}}{\sum_j p_j \, e^{f_j t}}.$$

The tooling behind this example builds on the Nextstrain project
[@hadfield2018nextstrain].

## Results

The first figure is a live interactive island: three toy series growing at
different rates over one year ([@fig:demo-trend]). On a linear axis the
fastest-growing series dominates the top of the chart; switch to a log axis with
the control in this sentence — :trigger[toggle a log scale]{target=fig:demo-trend update=toggle} —
to compare the growth *rates* directly as slopes. You can also jump straight to a
:trigger[log]{target=fig:demo-trend update="{scale: log}"} or
:trigger[linear]{target=fig:demo-trend update="{scale: linear}"} axis — these
triggers carry a structured `{scale: …}` payload rather than a bare string.

:::figure{#fig:demo-trend}
```yaml gazette
component: trend-line.js
data:
  points: demo.json      # → figures/data/demo.json
  colors: palette.json   # → figures/data/palette.json
opts:
  log: false             # start on a linear axis
```
**Three toy series over one year.**
Each line is a series growing at a fixed monthly rate; dots mark monthly values.
The static fallback image is shown wherever JavaScript is unavailable (for
example in the print target), and is hidden once the interactive island hydrates.
:::

As [@fig:demo-trend] shows, a log axis turns multiplicative growth into straight
lines whose slopes are directly comparable.

The second & third figures are **static** figures ([@fig:orange-block]): it sets `image:`
instead of `component:`, so it renders a plain `<img>` with no island, mount, or
hydration. The solid orange fill makes the image's full extent unmistakable.

We first use `max-width=90vw` to let it break out wider than the text column while the prose
around it keeps its measure:

:::figure{#fig:orange-block max-width=90vw}
```yaml gazette
image: orange.png        # → figures/orange.png
```
**A wide static image figure.**
A single solid-orange rectangle, shown at its natural extent so the figure box is
easy to see against the page.
:::

Then without setting any `max-width`:

:::figure{#fig:orange-block-normal}
```yaml gazette
image: orange.png        # → figures/orange.png
```
**A normal static image figure.**
A single solid-orange rectangle.
:::

# Element reference

This appendix exercises the full set of blocks the theme styles. It opens on a
top-level (`h1`) heading; the sections below step down through the remaining
levels.

## Headings

Section headings use `h2`. The two deeper levels are:

### Third-level heading (h3)

Used for subsections within a section.

#### Fourth-level heading (h4)

The deepest styled level, set in the emphasized ink.

## Text and inline marks

Body prose can carry **bold** (`strong`) and *italic* (`em`) marks, inline
`code` spans, and [hyperlinks](https://example.com) that underline on hover. A
run can combine them: a ***bold italic*** phrase, a `code`-tagged
`identifier`, or a [link with `code` inside](https://example.com).

> Chrome is paper and ink; color belongs to the data.
> Blockquotes are set in muted italic with a hairline rule down the side.

## Lists

An unordered list, including a nested level:

- First item
- Second item
  - A nested item
  - Another nested item
- Third item

An ordered list:

1. Parse one Markdown source to a shared tree.
2. Resolve citations, cross-references, and figures.
3. Render per target (static, next, print).

## Code

A fenced block renders as `pre`, with no background on the inner `code`:

```js
export function render(mount, data, { width }) {
  // Components draw into `mount` at the width the host measured.
  mount.replaceChildren(/* … */);
  return { resize(w) {}, update(arg) {} };
}
```

## Tables

Columns can be right-aligned for numerics:

| Series | Rate (per month) | Start value |
| ------ | ---------------: | ----------: |
| Alpha  |             1.02 |         100 |
| Beta   |             1.10 |         100 |
| Gamma  |             1.25 |         100 |

## A horizontal rule

A thematic break draws a single hairline rule:

---

…and prose resumes after it.

## Acknowledgments

Thanks to the authors of the `unified`, `remark`, and `rehype` ecosystems, and to
Observable Plot and D3, on which the figure island is built.
