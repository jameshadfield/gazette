// Shared headless-Chrome engine. Both the raster fallback snapshots
// (`src/render/snapshots.js`) and the `pdf` target (`src/render/target-pdf.js`)
// sit on top of this: launch a browser, load some HTML, capture a PNG or a PDF.
//
// puppeteer is an OPTIONAL dependency and is imported lazily, so ordinary
// `static`/`next` builds — and `npm install` on machines that never render a
// PDF or regenerate fallbacks — don't pay for a bundled Chromium.
import http from "node:http";
import sirv from "sirv";

// Lazy-load puppeteer with a helpful message if it isn't installed.
async function loadPuppeteer() {
  try {
    return (await import("puppeteer")).default;
  } catch {
    throw new Error(
      "this step needs headless Chrome (puppeteer), which is not installed.\n" +
        "  Install it with:  npm install puppeteer"
    );
  }
}

// Launch a browser, hand it to `fn`, and always close it. Returns fn's result.
export async function withBrowser(fn) {
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// Serve a directory over http on an ephemeral port for the browser to load.
// Using a real origin (rather than file://) means same-origin `fetch()` of the
// figures' JSON datasets and ES-module imports behave exactly as on the live
// page. Returns { origin, close }.
export async function serveDir(dir) {
  const handler = sirv(dir, { dev: true, etag: false });
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Screenshot one element (by CSS selector) to a PNG buffer, after waiting for
// the hydration signal and web fonts to settle. `deviceScaleFactor` controls
// the raster density (2 → a crisp 2× image).
export async function snapshotElement(page, url, selector, { width, deviceScaleFactor = 2 } = {}) {
  await page.setViewport({ width: Math.ceil(width) + 64, height: 1024, deviceScaleFactor });
  // `networkidle0` (no in-flight requests for 500ms) lets async resources a
  // component fetches after render() — e.g. a tiled canvas/WebGL map's tiles —
  // finish arriving before we capture, without a fixed sleep.
  await page.goto(url, { waitUntil: "networkidle0" });
  // The harness sets data-hydrated="1" once render() has returned.
  await page.waitForSelector(`${selector}[data-hydrated="1"]`, { timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // Let the final paint flush: two rAFs guarantee we're past the frame that
  // committed the last canvas/layout draw before screenshotting.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  // Extra safety margin for late async draws (e.g. a map's last tiles) that
  // can land just after network-idle; cheap insurance against a blank capture.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const handle = await page.$(selector);
  if (!handle) throw new Error(`snapshot: element not found: ${selector}`);
  return handle.screenshot({ type: "png" });
}

// Print a loaded page to a PDF buffer.
export async function printPdf(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return page.pdf({ printBackground: true, preferCSSPageSize: true });
}
