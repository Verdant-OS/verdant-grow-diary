export interface StaticSocialRouteMetadata {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  /** Defaults to index, follow for canonical public documents. */
  robots?: "index, follow" | "noindex, follow";
  /** Optional route-specific JSON-LD blocks for non-JavaScript crawlers. */
  jsonLd?: ReadonlyArray<unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*${attr}=["']${escapeRegex(key)}["'])[^>]*>`,
    "i",
  );
  if (!pattern.test(html)) {
    throw new Error(`Missing ${attr} metadata: ${key}`);
  }
  return html.replace(
    pattern,
    `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`,
  );
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function injectJsonLd(html: string, jsonLd: ReadonlyArray<unknown> | undefined): string {
  if (!jsonLd?.length) return html;

  // Strip prior static blocks by index-splicing (not String.replace) until a
  // fixed point: a single removal pass could leave a reconstructed marker
  // block behind when a deletion splices surrounding text together (CodeQL
  // js/incomplete-multi-character-sanitization). Inputs are our own build
  // output, but idempotence must not depend on that.
  const openMarker =
    /<script\s+type=["']application\/ld\+json["']\s+data-static-route-ldjson(?:=["'][^"']*["'])?\s*>/i;
  const closeMarker = "</script>";
  let withoutPrevious = html;
  for (;;) {
    const open = openMarker.exec(withoutPrevious);
    if (!open) break;
    const close = withoutPrevious.indexOf(closeMarker, open.index + open[0].length);
    if (close < 0) break;
    // Also consume the leading whitespace the injector emitted before the tag.
    let start = open.index;
    while (start > 0 && /\s/.test(withoutPrevious[start - 1])) start -= 1;
    withoutPrevious =
      withoutPrevious.slice(0, start) + withoutPrevious.slice(close + closeMarker.length);
  }
  const scripts = jsonLd
    .map(
      (value) =>
        `  <script type="application/ld+json" data-static-route-ldjson="true">${serializeJsonLd(value)}</script>`,
    )
    .join("\n");

  return withoutPrevious.replace("</head>", `${scripts}\n  </head>`);
}

/**
 * Builds a route-specific HTML entry for non-JavaScript social crawlers while
 * preserving the exact Vite-built app shell and asset references.
 */
export function buildStaticSocialRouteHtml(
  indexHtml: string,
  metadata: StaticSocialRouteMetadata,
): string {
  if (!indexHtml.includes("</head>")) {
    throw new Error("Static social route source is missing </head>");
  }

  let html = indexHtml;
  const titlePattern = /<title>[\s\S]*?<\/title>/i;
  if (!titlePattern.test(html)) {
    throw new Error("Static social route source is missing <title>");
  }
  html = html.replace(titlePattern, `<title>${escapeHtml(metadata.title)}</title>`);
  html = replaceMeta(html, "name", "description", metadata.description);
  html = replaceMeta(html, "property", "og:title", metadata.title);
  html = replaceMeta(html, "property", "og:description", metadata.description);
  html = replaceMeta(html, "property", "og:url", metadata.url);
  html = replaceMeta(html, "property", "og:image", metadata.image);
  html = replaceMeta(html, "property", "og:image:alt", metadata.imageAlt);
  html = replaceMeta(html, "name", "twitter:title", metadata.title);
  html = replaceMeta(html, "name", "twitter:description", metadata.description);
  html = replaceMeta(html, "name", "twitter:image", metadata.image);
  html = replaceMeta(html, "name", "robots", metadata.robots ?? "index, follow");

  const canonicalPattern = /<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/i;
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(metadata.url)}" />`;
  html = canonicalPattern.test(html)
    ? html.replace(canonicalPattern, canonicalTag)
    : html.replace("</head>", `  ${canonicalTag}\n  </head>`);

  return injectJsonLd(html, metadata.jsonLd);
}
