# gazette × next — example host

A minimal **Next.js App Router** app (React 18) that embeds a document built by
gazette's `next` target. It exists to exercise and verify that target; it is not
a full site.

## The idea

gazette builds a document once into a self-contained bundle (HTML body +
manifest + assets). A host app reads that bundle at build time and renders it
with two companion components (canonical source in [`../../runtime/next/`](../../runtime/next)):

- **`GazettePaper`** — a *server component*. It drops the built `article.html`
  into the light DOM (server-rendered, so it is crawlable, printable, and
  visible with no JS — just like a `dangerouslySetInnerHTML` markdown post).
- **`GazetteHydrator`** — a *client component* (`"use client"`). On mount it
  attaches **one shadow root** to the host element, moves the article inside it
  with gazette's own stylesheet, and hydrates each interactive figure from the
  manifest. All gazette styling is confined to that shadow root, so it neither
  leaks into the host app nor inherits the host's global CSS.

> React 18 does not render declarative shadow DOM, so the article is
> server-rendered into the light DOM first and relocated into the shadow root
> once JavaScript runs. (With React 19 this could be a declarative
> `<template shadowrootmode>` with no relocation step.)

## The one integration point

[`app/blog/[id]/page.tsx`](app/blog/%5Bid%5D/page.tsx) mirrors a normal blog
route and swaps in gazette only when a build exists for that id:

```tsx
if (gazetteBuildExists(id)) {
  const { articleHtml, manifest } = loadGazetteBuild(id);
  return <GazettePaper articleHtml={articleHtml} manifest={manifest} />;
}
// ...otherwise the host's usual markdown path...
```

## Run it

```sh
cd examples/next
npm install

# 1. Build the gazette bundle into ./public/gazette (base path /gazette):
npm run gazette

# 2. Start the host app:
npm run dev
# open http://localhost:3000/blog/demo-paper   (embedded gazette document)
#      http://localhost:3000/blog/hello         (plain host post, for contrast)
```

`npm run gazette` runs:

```sh
node ../../bin/gazette.js build ../basic --target next --base-path /gazette --out ./public
```

so the bundle lands at `public/gazette/…` and is served at `/gazette/…` — which
is the `--base-path` the manifest's module/data/stylesheet URLs are rewritten
against. Change `--base-path` and `--out` together to serve it elsewhere.

## Notes for using this in a real app

- Import the companion components from the installed `gazette` package instead
  of the relative path used here; then `experimental.externalDir` in
  `next.config.js` is unnecessary.
- `@font-face`, KaTeX, tokens, and structural CSS are bundled into
  `gazette.shadow.css` (with `:root`/`html`/`body` rewritten to `:host`), loaded
  once inside the shadow root.
- The figure component modules are dynamically `import()`-ed at runtime as
  native ESM (`/* webpackIgnore: true */`), not bundled by the host — they ship
  in the gazette bundle under `public/gazette/figures/`.
