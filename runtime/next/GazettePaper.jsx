// GazettePaper — the server component a host app renders to embed a built
// gazette document. It is given the built `article.html` string and the
// `manifest.json` object (read from the bundle at build time; see the example's
// lib/gazette.ts) and renders the article into the light DOM, where it is
// server-rendered HTML — crawlable, printable, and visible without JavaScript,
// exactly like a `dangerouslySetInnerHTML` markdown post.
//
// The client companion <GazetteHydrator> then, on mount, attaches a single
// shadow root to the host element, moves the article inside it with gazette's
// own stylesheet, and hydrates the interactive figures. All gazette styling is
// confined to that shadow root, so it neither leaks into the host app nor
// inherits the host's global CSS.
import React from "react";
import { GazetteHydrator } from "./GazetteHydrator";

export function GazettePaper({ articleHtml, manifest }) {
  return (
    <div className="gazette-host">
      <div
        className="gazette-article"
        // Server-rendered gazette body. GazetteHydrator reads this back on the
        // client to populate the shadow root, so it is authored once here.
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />
      <GazetteHydrator manifest={manifest} />
    </div>
  );
}

export default GazettePaper;
