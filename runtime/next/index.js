// Companion components for gazette's `next` target. Import these into a host
// Next.js app (App Router) to embed a built gazette document:
//
//   import { GazettePaper } from "gazette/next";
//   // ...read the built bundle's article.html + manifest.json at build time...
//   return <GazettePaper articleHtml={articleHtml} manifest={manifest} />;
//
// GazettePaper is a server component; GazetteHydrator ("use client") attaches
// the shadow root and hydrates the figures. See each file for details.
export { GazettePaper, default as GazettePaperDefault } from "./GazettePaper";
export { GazetteHydrator } from "./GazetteHydrator";
