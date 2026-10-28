// `gazette dev <input> [--port]` — build the static target, serve it, and
// rebuild + live-reload on changes to the Markdown, bib, figures, or theme.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import sirv from "sirv";
import chokidar from "chokidar";
import { loadConfig } from "../config.js";
import { buildCommand } from "./build.js";

const RELOAD_PATH = "/__gazette_reload";
const RELOAD_SNIPPET = `
<script>
(() => {
  const es = new EventSource("${RELOAD_PATH}");
  es.onmessage = (e) => { if (e.data === "reload") location.reload(); };
})();
</script>`;

export async function devCommand(input, cli) {
  const config = loadConfig(input, { ...cli, target: "static" });
  const outDir = path.join(config.outBase, "static");
  const port = Number(cli.port || 8080);

  async function rebuild() {
    try {
      await buildCommand(input, { ...cli, target: "static" });
      // Inject the live-reload client into the served page.
      const indexPath = path.join(outDir, "index.html");
      let html = fs.readFileSync(indexPath, "utf8");
      if (!html.includes(RELOAD_PATH)) {
        html = html.replace("</body>", `${RELOAD_SNIPPET}\n</body>`);
        fs.writeFileSync(indexPath, html);
      }
    } catch (err) {
      console.error(`gazette dev: build failed — ${err.message}`);
    }
  }

  await rebuild();

  const clients = new Set();
  const serve = sirv(outDir, { dev: true, etag: true });
  const server = http.createServer((req, res) => {
    if (req.url === RELOAD_PATH) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    serve(req, res);
  });

  server.listen(port, () => {
    console.log(`gazette dev: serving ${path.relative(process.cwd(), outDir)} at http://localhost:${port}`);
    console.log("gazette dev: watching for changes (Ctrl+C to stop)");
  });

  const watchPaths = [config.entry, config.bibPath, config.figuresDir];
  if (config.themeDir) watchPaths.push(config.themeDir);
  const watcher = chokidar.watch(watchPaths.filter(Boolean), { ignoreInitial: true });
  let timer = null;
  watcher.on("all", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log("gazette dev: change detected, rebuilding…");
      await rebuild();
      for (const res of clients) res.write("data: reload\n\n");
    }, 120);
  });
}
