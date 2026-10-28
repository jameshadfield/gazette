import Link from "next/link";
import React from "react";

// Landing page: two "blog posts" — one backed by a gazette build, one plain —
// to show the same route rendering either kind.
export default function Home() {
  return (
    <section>
      <h1>gazette × next demo</h1>
      <p>
        The <code>/blog/[id]</code> route renders an embedded gazette document when
        a build exists for that id, and ordinary host content otherwise.
      </p>
      <ul>
        <li>
          <Link href="/blog/demo-paper">/blog/demo-paper</Link> — embedded gazette
          document (shadow-root isolated, interactive figure).
        </li>
        <li>
          <Link href="/blog/hello">/blog/hello</Link> — a plain host-rendered post.
        </li>
      </ul>
    </section>
  );
}
