import fs from "node:fs";
import path from "node:path";

// Map a blog id to a built gazette bundle under public/. In this toy there is a
// single document, built to public/gazette (base path /gazette) and surfaced as
// the id "demo-paper". In a real app this mapping would come from the same
// place your blog index does (e.g. a frontmatter flag on posts that were
// authored as gazette documents).
const BUILDS: Record<string, string> = {
  "demo-paper": "gazette",
};

export interface GazetteManifest {
  basePath: string;
  stylesheet: string;
  frontmatter: Record<string, unknown>;
  islands: Array<{
    figId: string;
    mountId: string;
    module: string;
    data: Record<string, string>;
    opts: Record<string, unknown>;
  }>;
  triggers: Array<{ target: string; update: unknown }>;
}

function bundleDir(id: string): string | null {
  const sub = BUILDS[id];
  if (!sub) return null;
  // process.cwd() is the Next app root both in `next dev` and at build time.
  return path.join(process.cwd(), "public", sub);
}

export function gazetteBuildExists(id: string): boolean {
  const dir = bundleDir(id);
  return !!dir && fs.existsSync(path.join(dir, "manifest.json"));
}

export function loadGazetteBuild(id: string): {
  articleHtml: string;
  manifest: GazetteManifest;
} {
  const dir = bundleDir(id);
  if (!dir) throw new Error(`No gazette build mapped for id "${id}"`);
  const articleHtml = fs.readFileSync(path.join(dir, "article.html"), "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8")
  ) as GazetteManifest;
  return { articleHtml, manifest };
}
