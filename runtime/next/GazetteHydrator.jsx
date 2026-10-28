"use client";
// GazetteHydrator — the client half of the `next` target. On mount it:
//   1. attaches a single open shadow root to the .gazette-host element,
//   2. loads gazette's shadow stylesheet and moves the server-rendered article
//      inside the shadow root (one isolated style boundary for the whole doc),
//   3. hydrates each figure island from the manifest — dynamic-importing its
//      component module, fetching its named datasets, measuring the mount and
//      calling render(mount, data, { mode, width, …opts }),
//   4. delegates :trigger clicks and in-document #fig anchor jumps *within* the
//      shadow root (document.getElementById can't see inside it).
//
// React 18 does not render declarative shadow DOM, so the article is first
// server-rendered into the light DOM (good for no-JS / crawlers / print) and
// relocated here once JavaScript runs.
import React, { useEffect, useRef } from "react";

export function GazetteHydrator({ manifest }) {
  const anchorRef = useRef(null);

  useEffect(() => {
    const host = anchorRef.current && anchorRef.current.closest(".gazette-host");
    if (!host) return;
    // Guard React StrictMode's double-invoke and any re-run: build the shadow
    // root once.
    if (host.shadowRoot) return;

    const source = host.querySelector(".gazette-article");
    const articleHtml = source ? source.innerHTML : "";

    const shadow = host.attachShadow({ mode: "open" });
    // Attaching a shadow root without a <slot> stops the light-DOM children
    // (the server-rendered .gazette-article and this component's anchor) from
    // rendering; they remain in the DOM for no-JS / crawlers / printing.

    const stylesheetHref =
      manifest.stylesheet || (manifest.basePath || "") + "/gazette.shadow.css";

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetHref;
    shadow.appendChild(link);

    // @font-face rules declared inside a shadow root are ignored by the browser
    // (font faces register only at the document level), so the article would
    // fall back to system fonts. Lift just the @font-face rules up into
    // document.head — they are document-global and carry no other styling — and
    // leave the rest of gazette's CSS confined to the shadow root.
    registerShadowFonts(stylesheetHref);

    const article = document.createElement("article");
    article.className = "gazette-paper";
    article.innerHTML = articleHtml;
    shadow.appendChild(article);

    hydrateIslands(shadow, manifest);
    wireInteractions(shadow);
  }, [manifest]);

  // A hidden anchor so the effect can find its host element; it lives in the
  // light DOM and is not rendered once the shadow root is attached.
  return <span ref={anchorRef} style={{ display: "none" }} aria-hidden="true" />;
}

async function hydrateIslands(shadow, manifest) {
  for (const island of manifest.islands || []) {
    const placeholder = shadow.getElementById(island.mountId);
    if (!placeholder) continue;

    // The <figure> owning this mount; its static fallback lives here in the
    // shadow tree regardless of where the live mount ends up.
    const figureEl = placeholder.parentElement;

    // A light-DOM island (lightDom: true) is moved out of the shadow root and
    // projected back into the figure's place with a <slot>, so the component
    // runs in the light DOM — where document-level queries, event targeting
    // and portals behave as they do under the `static` target. Otherwise the
    // mount stays in the shadow tree.
    const mount = island.lightDom
      ? projectMountToLight(shadow.host, placeholder)
      : placeholder;

    try {
      const mod = await import(/* webpackIgnore: true */ island.module);
      if (typeof mod.render !== "function") {
        throw new Error(`module ${island.module} has no \`render\` export`);
      }
      const data = {};
      for (const [key, url] of Object.entries(island.data || {})) {
        data[key] = await fetch(url).then((r) => r.json());
      }
      const opts = Object.assign({ mode: "inline", width: mount.clientWidth }, island.opts || {});
      const inst = mod.render(mount, data, opts);

      const fallback = figureEl && figureEl.querySelector(".gazette-static-fallback");
      if (fallback) fallback.style.display = "none";

      if (inst && inst.resize) {
        new ResizeObserver(() => inst.resize(mount.clientWidth)).observe(mount);
      }
      if (inst && inst.update) {
        mount.addEventListener("gazette:update", (e) => inst.update(e.detail));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[gazette] figure ${island.mountId} (${island.module}) failed to hydrate:`, err?.stack ?? err);
    }
  }
}

// Move an island's mount into the light DOM and project it back into its
// original place via a named <slot>. The shadow placeholder is swapped for the
// slot; a fresh .gazette-mount is appended as a direct child of the host (slots
// project only the host's direct children) and assigned to that slot. Slotted
// nodes render at the slot's position but stay light-DOM for the purposes of
// DOM queries, event retargeting and CSS — exactly what an embedded SPA needs.
// Returns the light-DOM mount to render into.
function projectMountToLight(host, placeholder) {
  const slotName = placeholder.id; // mountId — unique per document
  const slot = document.createElement("slot");
  slot.name = slotName;
  placeholder.replaceWith(slot);

  const mount = document.createElement("div");
  mount.className = "gazette-mount";
  mount.slot = slotName;
  host.appendChild(mount);
  return mount;
}

// Stylesheets whose @font-face rules have already been lifted into
// document.head, so we do it once per stylesheet across all documents on the
// page and across StrictMode re-invocations.
const registeredFontSheets = new Set();

// Copy the stylesheet's @font-face rules into document.head so the browser
// actually registers them (it ignores @font-face declared inside a shadow
// root). Relative url(...) references are rewritten to absolute against the
// stylesheet's own URL, because the rules now live at a different base.
function registerShadowFonts(stylesheetHref) {
  if (registeredFontSheets.has(stylesheetHref)) return;
  // Claim it synchronously, before the async fetch, so a second invocation
  // (StrictMode) doesn't start a duplicate fetch + injection.
  registeredFontSheets.add(stylesheetHref);

  const sheetUrl = new URL(stylesheetHref, document.baseURI);
  fetch(sheetUrl.href)
    .then((r) => r.text())
    .then((css) => {
      const faces = css.match(/@font-face\s*\{[^}]*\}/gi);
      if (!faces) return;

      const rules = faces
        .join("\n")
        .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, _quote, url) => {
          // Leave absolute URLs, data: URIs and fragments untouched.
          if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return whole;
          return `url("${new URL(url, sheetUrl).href}")`;
        });

      const style = document.createElement("style");
      style.setAttribute("data-gazette-fonts", stylesheetHref);
      style.textContent = rules;
      document.head.appendChild(style);
    })
    .catch((err) => {
      // Release the claim so a later render can retry.
      registeredFontSheets.delete(stylesheetHref);
      // eslint-disable-next-line no-console
      console.error("[gazette] failed to register fonts from", stylesheetHref, err);
    });
}

// Scope the trigger delegation and anchor jumps to the shadow root, since IDs
// inside a shadow tree are invisible to document.getElementById and native
// in-page #fragment navigation does not cross the shadow boundary.
function wireInteractions(shadow) {
  shadow.addEventListener("click", (e) => {
    const target = e.target;
    if (!target || typeof target.closest !== "function") return;

    const trigger = target.closest(".gazette-trigger");
    if (trigger) {
      e.preventDefault();
      const fig = shadow.getElementById(trigger.dataset.gazetteTarget);
      // A light-DOM island's mount has been slotted out of the shadow tree, so
      // it is not found by querySelector; fall back to the slot's assigned
      // (projected) light-DOM element.
      let mount = fig && fig.querySelector(".gazette-mount");
      if (!mount && fig) {
        const slot = fig.querySelector("slot");
        mount = slot && slot.assignedElements()[0];
      }
      if (!mount) return;
      let detail;
      try {
        detail = JSON.parse(trigger.dataset.gazetteUpdate);
      } catch {
        detail = trigger.dataset.gazetteUpdate;
      }
      mount.dispatchEvent(new CustomEvent("gazette:update", { detail, bubbles: false }));
      return;
    }

    const anchor = target.closest('a[href^="#"]');
    if (anchor) {
      const id = decodeURIComponent(anchor.getAttribute("href").slice(1));
      const dest = id && shadow.getElementById(id);
      if (dest) {
        e.preventDefault();
        dest.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
}

export default GazetteHydrator;
