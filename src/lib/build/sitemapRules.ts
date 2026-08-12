export type SitemapChangeFrequency = "weekly" | "monthly";

export interface SitemapSourceDocument {
  readonly path: string;
  readonly canonicalUrl: string;
  readonly lastModifiedOn?: string;
  readonly robots?: string;
  readonly isRedirect?: boolean;
  readonly publicationStatus?: string;
}

export interface SitemapEntry {
  readonly path: string;
  readonly loc: string;
  readonly lastModifiedOn?: string;
  readonly changeFrequency: SitemapChangeFrequency;
  readonly priority: string;
}

export interface DeriveSitemapEntriesInput {
  readonly siteOrigin: string;
  readonly staticDocuments: ReadonlyArray<SitemapSourceDocument>;
  readonly staticOnlyRoutes: ReadonlyArray<string>;
  readonly sitemapOnlyRoutes: ReadonlyArray<string>;
  readonly sitemapOnlyLastModifiedOn?: Readonly<Record<string, string>>;
}

const PRIVATE_ROUTE_PREFIXES = Object.freeze([
  "/.lovable/",
  "/account",
  "/action-queue",
  "/actions",
  "/admin",
  "/alerts",
  "/auth",
  "/billing",
  "/checkout",
  "/customer",
  "/dashboard",
  "/daily-check",
  "/demo/one-tent-live-proof",
  "/diagnostics",
  "/diary",
  "/doctor",
  "/genetics",
  "/grow-lineage",
  "/grows",
  "/health",
  "/ingest-inspector",
  "/internal",
  "/invite",
  "/leads",
  "/login",
  "/logs",
  "/onboarding",
  "/one-tent-loop-proof",
  "/operator",
  "/pheno-hunts",
  "/pi-ingest-status",
  "/plants",
  "/register",
  "/reports",
  "/reset-password",
  "/sensors",
  "/settings",
  "/signup",
  "/strains",
  "/tasks",
  "/tents",
  "/timeline",
  "/unsubscribe",
]);

const PRIORITY_NINE = new Set([
  "/welcome",
  "/pricing",
  "/founder",
  "/guides/grow-stage-care-guide",
  "/tools/vpd-calculator",
  "/ai-doctor-readiness-check",
]);

const PRIORITY_EIGHT = new Set([
  "/hardware-integrations",
  "/how-ai-doctor-works",
  "/guides",
  "/quick-log",
  "/cultivars",
  "/guides/cannabis-grow-light-distance-and-schedule",
  "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
  "/guides/oreoz-vs-gelonade-comparison",
]);

const WEEKLY_ROUTES = new Set([
  "/",
  "/welcome",
  "/pricing",
  "/founder",
  "/guides/grow-stage-care-guide",
  "/tools/vpd-calculator",
  "/hardware-integrations",
  "/ai-doctor-readiness-check",
  "/guides",
  "/quick-log",
]);

const LOW_PRIORITY_ROUTES = new Set([
  "/terms",
  "/privacy",
  "/refund",
  "/feedback",
  "/contact",
]);

function isSameOrChildPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || prefix.endsWith("/") && path.startsWith(prefix);
}

function isVerifiedDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalUrlForPath(siteOrigin: string, path: string): string {
  return path === "/" ? `${siteOrigin}/` : `${siteOrigin}${path}`;
}

export function sitemapExclusionReason(
  document: SitemapSourceDocument,
  siteOrigin: string,
): string | null {
  if (!document.path.startsWith("/")) return "path is not absolute";
  if (document.path.includes("?") || document.path.includes("#")) return "path has query or hash";
  if (document.isRedirect) return "redirect";
  if (document.publicationStatus && document.publicationStatus !== "published") {
    return "unpublished";
  }
  if (/\bnoindex\b/i.test(document.robots ?? "")) return "noindex";

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(document.path);
  } catch {
    return "path is not valid URI encoding";
  }
  if (/[:*{}\[\]]/.test(decodedPath)) return "dynamic placeholder";
  if (PRIVATE_ROUTE_PREFIXES.some((prefix) => isSameOrChildPath(decodedPath, prefix))) {
    return "private or alias route";
  }

  let canonical: URL;
  try {
    canonical = new URL(document.canonicalUrl);
  } catch {
    return "canonical is not an absolute URL";
  }
  if (
    canonical.origin !== siteOrigin ||
    canonical.username ||
    canonical.password ||
    canonical.search ||
    canonical.hash
  ) {
    return "canonical has a foreign origin, credentials, query, or hash";
  }
  if (
    canonical.pathname !== document.path ||
    document.canonicalUrl !== canonicalUrlForPath(siteOrigin, document.path)
  ) {
    return "canonical does not exactly match the clean route path";
  }
  return null;
}

function presentationForPath(path: string): Pick<SitemapEntry, "changeFrequency" | "priority"> {
  const priority = path === "/"
    ? "1.0"
    : PRIORITY_NINE.has(path)
      ? "0.9"
      : PRIORITY_EIGHT.has(path)
        ? "0.8"
        : LOW_PRIORITY_ROUTES.has(path)
          ? "0.5"
          : "0.7";
  return {
    changeFrequency: WEEKLY_ROUTES.has(path) ? "weekly" : "monthly",
    priority,
  };
}

export function deriveSitemapEntries(input: DeriveSitemapEntriesInput): ReadonlyArray<SitemapEntry> {
  const siteOrigin = input.siteOrigin.replace(/\/+$/, "");
  const staticOnlyRoutes = new Set(input.staticOnlyRoutes);
  const sources: SitemapSourceDocument[] = [
    ...input.sitemapOnlyRoutes.map((path) => ({
      path,
      canonicalUrl: canonicalUrlForPath(siteOrigin, path),
      lastModifiedOn: input.sitemapOnlyLastModifiedOn?.[path],
      publicationStatus: "published",
    })),
    ...input.staticDocuments.filter((document) => !staticOnlyRoutes.has(document.path)),
  ];

  const entries: SitemapEntry[] = [];
  const seenPaths = new Set<string>();
  const seenUrls = new Set<string>();
  for (const source of sources) {
    if (sitemapExclusionReason(source, siteOrigin)) continue;
    if (seenPaths.has(source.path) || seenUrls.has(source.canonicalUrl)) {
      throw new Error(`Duplicate sitemap source: ${source.canonicalUrl}`);
    }
    if (source.lastModifiedOn && !isVerifiedDate(source.lastModifiedOn)) {
      throw new Error(
        `Invalid lastModifiedOn for ${source.path}: ${source.lastModifiedOn}. Expected YYYY-MM-DD.`,
      );
    }
    seenPaths.add(source.path);
    seenUrls.add(source.canonicalUrl);
    entries.push({
      path: source.path,
      loc: source.canonicalUrl,
      lastModifiedOn: source.lastModifiedOn,
      ...presentationForPath(source.path),
    });
  }
  return entries;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemapXml(entries: ReadonlyArray<SitemapEntry>): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const entry of entries) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastModifiedOn) {
      lines.push(`    <lastmod>${entry.lastModifiedOn}</lastmod>`);
    }
    lines.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
    lines.push(`    <priority>${entry.priority}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}
