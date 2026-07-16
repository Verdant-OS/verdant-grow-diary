export interface StaticSocialRouteMetadata {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  robots?: "index, follow" | "noindex, follow";
  ogType?: "website" | "article";
  imageWidth?: number;
  imageHeight?: number;
  imageType?: string;
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

function upsertMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*${attr}=["']${escapeRegex(key)}["'])[^>]*>`,
    "i",
  );
  const tag = `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `  ${tag}\n  </head>`);
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
  html = replaceMeta(html, "property", "og:type", metadata.ogType ?? "website");
  html = replaceMeta(html, "name", "robots", metadata.robots ?? "index, follow");
  html = replaceMeta(html, "name", "twitter:title", metadata.title);
  html = replaceMeta(html, "name", "twitter:description", metadata.description);
  html = replaceMeta(html, "name", "twitter:image", metadata.image);
  html = upsertMeta(html, "name", "twitter:image:alt", metadata.imageAlt);
  if (metadata.imageWidth !== undefined) {
    html = upsertMeta(html, "property", "og:image:width", String(metadata.imageWidth));
  }
  if (metadata.imageHeight !== undefined) {
    html = upsertMeta(html, "property", "og:image:height", String(metadata.imageHeight));
  }
  if (metadata.imageType !== undefined) {
    html = upsertMeta(html, "property", "og:image:type", metadata.imageType);
  }

  const canonicalPattern = /<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/i;
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(metadata.url)}" />`;
  if (canonicalPattern.test(html)) {
    return html.replace(canonicalPattern, canonicalTag);
  }
  return html.replace(
    "</head>",
    `  ${canonicalTag}\n  </head>`,
  );
}
