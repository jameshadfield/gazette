import { notFound } from "next/navigation";
import React from "react";

// In a real app, import these from the installed gazette package:
//   import { GazettePaper } from "gazette/next";
// This example imports the canonical source directly (enabled by
// experimental.externalDir in next.config.js) so there is no duplicate copy.
import { GazettePaper } from "../../../../../runtime/next/GazettePaper";

import { gazetteBuildExists, loadGazetteBuild } from "../../../lib/gazette";

interface BlogPostParams {
  id: string;
}

// Stand-in for the host's own posts (the real app has getBlogPosts()).
const PLAIN_POSTS: Record<string, { title: string; body: string }> = {
  hello: {
    title: "An ordinary post",
    body: "This one is plain host-rendered content — no gazette build, no shadow root.",
  },
};

export function generateStaticParams(): BlogPostParams[] {
  // One gazette-backed id + one plain id.
  return [{ id: "demo-paper" }, { id: "hello" }];
}

export default async function BlogPost({
  params,
}: {
  params: BlogPostParams;
}): Promise<React.ReactElement> {
  const { id } = params;

  // If a gazette document was built for this id, render it instead of the
  // normal markdown path. This is the single integration point.
  if (gazetteBuildExists(id)) {
    const { articleHtml, manifest } = loadGazetteBuild(id);
    return <GazettePaper articleHtml={articleHtml} manifest={manifest} />;
  }

  const post = PLAIN_POSTS[id];
  if (!post) notFound();

  return (
    <article style={{ background: "#fff", padding: "1.5rem", borderRadius: 8 }}>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
