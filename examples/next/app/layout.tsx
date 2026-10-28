import React from "react";

export const metadata = {
  title: "gazette × next — demo host",
  description: "A minimal Next.js host embedding a built gazette document.",
};

// Deliberately opinionated host chrome with its own global styles, so you can
// see that gazette's shadow-root styles neither leak out into this layout nor
// inherit from it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#1f2937",
          background: "#f3f4f6",
        }}
      >
        <header
          style={{
            padding: "0.9rem 1.25rem",
            background: "#111827",
            color: "#f9fafb",
            fontSize: 14,
          }}
        >
          <strong>Host app chrome</strong> — this bar is the Next.js site. The paper
          below is embedded gazette output, isolated in a shadow root.
        </header>
        <main style={{ maxWidth: 1040, margin: "0 auto", padding: "1.5rem 1.25rem 4rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
