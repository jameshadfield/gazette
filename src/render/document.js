// Shared document assembly: build the frontmatter header HTML from the parsed
// YAML. The body HTML comes from the parse pipeline; targets wrap the two in an
// <article class="gazette-paper"> container.

// YAML parses an unquoted YYYY-MM-DD into a Date; render it back as an ISO date
// rather than the JS Date toString.
function formatDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A "Download PDF" link (download icon + label), rendered under the affiliations
// when frontmatter sets `pdf-download: true`. The caller supplies the resolved
// href (relative for `static`, base-path-absolute for `next`); the `pdf` target
// passes none, so the link never appears in the printed document itself.
function pdfDownloadLink(href) {
  const icon =
    `<svg class="gazette-pdf-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>` +
    `<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  return `<a class="gazette-pdf-download" href="${esc(href)}" download>${icon}Download PDF</a>`;
}

// Render the <header class="gazette-frontmatter"> block. `opts.pdfHref` (when the
// document opts into `pdf-download`) adds the Download PDF link under the
// affiliations.
export function renderFrontmatter(fm = {}, { pdfHref } = {}) {
  const parts = [];
  parts.push(`<header class="gazette-frontmatter">`);

  if (fm.date) parts.push(`<div class="gazette-date">${esc(formatDate(fm.date))}</div>`);

  if (fm.title) parts.push(`<h1 class="gazette-title">${esc(fm.title)}</h1>`);

  const affiliations = Array.isArray(fm.affiliations) ? fm.affiliations : [];
  const affIndex = new Map(affiliations.map((a, i) => [a.id, i + 1]));

  const authors = Array.isArray(fm.authors) ? fm.authors : [];
  if (authors.length) {
    const spans = authors
      .map((a) => {
        const ids = Array.isArray(a.affiliations) ? a.affiliations : [];
        const nums = ids.map((id) => affIndex.get(id)).filter(Boolean);
        const sup = nums.length ? `<sup>${nums.join(",")}</sup>` : "";
        return `<span class="gazette-author">${esc(a.name)}${sup}</span>`;
      })
      .join("");
    parts.push(`<div class="gazette-authors">${spans}</div>`);
  }

  if (affiliations.length) {
    const lis = affiliations
      .map((a, i) => {
        const name = a.url
          ? `<a href="${esc(a.url)}">${esc(a.name)}</a>`
          : esc(a.name);
        return `<li class="gazette-affiliation"><sup>${i + 1}</sup>${name}</li>`;
      })
      .join("");
    parts.push(`<ol class="gazette-affiliations">${lis}</ol>`);
  }

  if (pdfHref && fm["pdf-download"] === true) {
    parts.push(pdfDownloadLink(pdfHref));
  }

  parts.push(`</header>`);
  return parts.join("\n");
}

export { esc };
