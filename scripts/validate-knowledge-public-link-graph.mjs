#!/usr/bin/env node
/**
 * validate-knowledge-public-link-graph
 *
 * Builds a directed internal-link graph from the actual SSR HTML emitted by
 * the production build. Registry and sitemap checks prove that a route exists;
 * this gate proves that a crawler can discover every published Knowledge page
 * from the library root without JavaScript.
 *
 * Pure graph/parser functions are exported for mutation tests. The CLI reads
 * dist/seo-manifest.json, writes a deterministic JSON receipt, and exits
 * non-zero for an orphan, unreachable/deep page, or an invalid Knowledge
 * destination.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const KNOWLEDGE_DISCOVERY_ROOT = "/guides";
export const KNOWLEDGE_MAX_CRAWL_DEPTH = 4;
export const KNOWLEDGE_GRAPH_REPORT_FILE = "knowledge-public-link-graph-report.json";

// These existing, approved routes make the gate non-vacuous. Route/sitemap
// parity still owns the complete public inventory; this gate owns discovery.
export const REQUIRED_KNOWLEDGE_PATHS = Object.freeze([
  "/guides",
  "/glossary",
  "/tools/blueprint-targets",
]);

const ANCHOR_TAG_REGEX = /<a\b[^>]*>/gi;
const ATTR_VALUE = `(?:"([^"]*)"|'([^']*)'|([^\\s"'>=\`]+))`;

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
});

function decodeHtmlAttribute(value) {
  return value
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&#([0-9]+);/g, (match, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => {
      const normalizedName = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, normalizedName)
        ? NAMED_ENTITIES[normalizedName]
        : match;
    });
}

function readAttribute(tag, name) {
  // Require an actual attribute boundary. A word-boundary expression would
  // incorrectly treat data-href as href because '-' is a non-word character.
  const expression = new RegExp(`(?:^|\\s)${name}\\s*=\\s*${ATTR_VALUE}`, "i");
  const match = tag.match(expression);
  if (!match) return null;
  return decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
}

function normalizePathname(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * Resolve an anchor href against its source document and return a normalized
 * same-origin path. Query strings and fragments are discovery state, not page
 * identity. External and non-HTTP(S) destinations return null.
 */
export function normalizePublicPath(rawHref, sourcePath, origin) {
  if (typeof rawHref !== "string" || rawHref.trim() === "") return null;
  try {
    const normalizedOrigin = new URL(origin).origin;
    const sourceUrl = new URL(sourcePath, `${normalizedOrigin}/`);
    const target = new URL(rawHref.trim(), sourceUrl);
    if (!/^https?:$/.test(target.protocol) || target.origin !== normalizedOrigin) return null;
    return normalizePathname(target.pathname);
  } catch {
    return null;
  }
}

/** Extract unique, crawlable, non-self internal anchor destinations. */
export function extractCrawlableInternalLinks(html, sourcePath, origin) {
  const links = new Set();
  // Serialized router state and JSON may legitimately contain strings that
  // look like markup. Only rendered anchors count as discovery edges.
  const renderedMarkup = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const tag of renderedMarkup.match(ANCHOR_TAG_REGEX) ?? []) {
    const href = readAttribute(tag, "href");
    if (href === null) continue;
    const relTokens = (readAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (relTokens.includes("nofollow")) continue;
    const target = normalizePublicPath(href, sourcePath, origin);
    if (target && target !== sourcePath) links.add(target);
  }
  return [...links].sort();
}

export function isKnowledgePublicPath(path) {
  return (
    path === "/guides" ||
    path.startsWith("/guides/") ||
    path === "/cultivars" ||
    path.startsWith("/cultivars/") ||
    path === "/glossary" ||
    path.startsWith("/tools/")
  );
}

function publicationState(page, origin) {
  const robots = String(page.robots ?? "index, follow").toLowerCase();
  const robotsDirectives = new Set(robots.split(/[\s,]+/).filter(Boolean));
  if (robotsDirectives.has("noindex") || robotsDirectives.has("none")) {
    return { published: false, reason: "noindex" };
  }
  if (robotsDirectives.has("nofollow")) {
    return { published: false, reason: "nofollow" };
  }
  let canonical;
  try {
    canonical = new URL(page.canonical);
  } catch {
    return { published: false, reason: "invalid_canonical" };
  }
  if (canonical.origin !== new URL(origin).origin) {
    return { published: false, reason: `canonical_origin:${canonical.origin}` };
  }
  const canonicalPath = normalizePathname(canonical.pathname);
  if (canonicalPath !== page.path) {
    return { published: false, reason: `canonical_path:${canonicalPath}` };
  }
  return { published: true, reason: null };
}

function stablePage(page) {
  return {
    path: page.path,
    fileName: page.fileName ?? null,
    canonical: page.canonical,
    robots: page.robots ?? "index, follow",
    html: page.html,
  };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

/**
 * Validate a fully materialized page set.
 *
 * @param {{
 *   origin: string;
 *   pages: Array<{path:string,fileName?:string,canonical:string,robots?:string,html:string}>;
 *   rootPath?: string;
 *   maxDepth?: number;
 *   requiredPaths?: readonly string[];
 * }} input
 */
export function validateKnowledgePublicLinkGraph(input) {
  const origin = new URL(input.origin).origin;
  const rootPath = input.rootPath ?? KNOWLEDGE_DISCOVERY_ROOT;
  const maxDepth = input.maxDepth ?? KNOWLEDGE_MAX_CRAWL_DEPTH;
  const requiredPaths = input.requiredPaths ?? REQUIRED_KNOWLEDGE_PATHS;
  const problems = [];
  const pageByPath = new Map();

  for (const rawPage of [...input.pages]
    .map(stablePage)
    .sort((a, b) => a.path.localeCompare(b.path))) {
    if (pageByPath.has(rawPage.path)) {
      problems.push(`DUPLICATE_DOCUMENT ${rawPage.path}`);
      continue;
    }
    pageByPath.set(rawPage.path, rawPage);
  }

  for (const requiredPath of requiredPaths) {
    if (!pageByPath.has(requiredPath)) {
      problems.push(`MISSING_REQUIRED_KNOWLEDGE_DOCUMENT ${requiredPath}`);
    }
  }

  const publishedByPath = new Map();
  const publicationByPath = new Map();
  for (const page of pageByPath.values()) {
    const state = publicationState(page, origin);
    publicationByPath.set(page.path, state);
    if (state.published) publishedByPath.set(page.path, page);
    if (isKnowledgePublicPath(page.path) && !state.published) {
      problems.push(`UNPUBLISHED_KNOWLEDGE_DOCUMENT ${page.path} reason=${state.reason}`);
    }
  }

  const edges = new Map([...publishedByPath.keys()].sort().map((path) => [path, new Set()]));
  for (const page of [...publishedByPath.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const target of extractCrawlableInternalLinks(page.html, page.path, origin)) {
      if (publishedByPath.has(target)) {
        edges.get(page.path).add(target);
        continue;
      }
      if (!isKnowledgePublicPath(target)) continue;
      const targetState = publicationByPath.get(target);
      problems.push(
        targetState
          ? `UNCRAWLABLE_KNOWLEDGE_LINK ${page.path} -> ${target} reason=${targetState.reason}`
          : `BROKEN_KNOWLEDGE_LINK ${page.path} -> ${target} reason=missing_built_document`,
      );
    }
  }

  const knowledgePaths = [...pageByPath.keys()].filter(isKnowledgePublicPath).sort();
  const publishedKnowledgePaths = knowledgePaths.filter((path) => publishedByPath.has(path));
  const inboundSources = new Map(publishedKnowledgePaths.map((path) => [path, new Set()]));
  for (const [source, targets] of edges) {
    for (const target of targets) {
      if (inboundSources.has(target)) inboundSources.get(target).add(source);
    }
  }

  for (const path of publishedKnowledgePaths) {
    if (path === rootPath) continue;
    const inbound = inboundSources.get(path)?.size ?? 0;
    if (inbound === 0) problems.push(`ORPHAN ${path} inbound=0 root=${rootPath}`);
  }

  const depth = new Map();
  if (publishedByPath.has(rootPath)) {
    const queue = [rootPath];
    depth.set(rootPath, 0);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const source = queue[cursor];
      for (const target of [...(edges.get(source) ?? [])].sort()) {
        if (depth.has(target)) continue;
        depth.set(target, depth.get(source) + 1);
        queue.push(target);
      }
    }
  } else {
    problems.push(`MISSING_DISCOVERY_ROOT ${rootPath}`);
  }

  for (const path of publishedKnowledgePaths) {
    if (!depth.has(path)) {
      problems.push(`UNREACHABLE ${path} root=${rootPath}`);
      continue;
    }
    if (depth.get(path) > maxDepth) {
      problems.push(`TOO_DEEP ${path} depth=${depth.get(path)} max=${maxDepth}`);
    }
  }

  const pageResults = publishedKnowledgePaths.map((path) => ({
    path,
    inbound: inboundSources.get(path)?.size ?? 0,
    depth: depth.get(path) ?? null,
    outbound: [...(edges.get(path) ?? [])].length,
  }));
  const diagnostics = sortedUnique(problems);

  return {
    schemaVersion: 1,
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    evidenceScope: "built_ssr_html",
    origin,
    rootPath,
    maxDepth,
    routeFamilies: ["/guides", "/guides/*", "/cultivars", "/cultivars/*", "/glossary", "/tools/*"],
    totals: {
      builtDocuments: pageByPath.size,
      publishedDocuments: publishedByPath.size,
      knowledgeDocuments: knowledgePaths.length,
      publishedKnowledgeDocuments: publishedKnowledgePaths.length,
      reachableKnowledgeDocuments: pageResults.filter((page) => page.depth !== null).length,
      problems: diagnostics.length,
    },
    pages: pageResults,
    problems: diagnostics,
  };
}

function readManifest(distDir) {
  const manifestPath = join(distDir, "seo-manifest.json");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`seo-manifest.json missing at ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof manifest?.origin !== "string" || !Array.isArray(manifest?.documents)) {
    throw new Error(`${manifestPath} must contain an origin and documents array`);
  }
  return manifest;
}

/** Load regular files declared by the SEO manifest, rejecting path traversal. */
export function loadBuiltPublicPages(distDirectory) {
  const distDir = resolve(distDirectory);
  const manifest = readManifest(distDir);
  const origin = new URL(manifest.origin).origin;
  const pages = [];

  for (const [index, document] of manifest.documents.entries()) {
    const label = typeof document?.path === "string" ? document.path : `documents[${index}]`;
    if (typeof document?.path !== "string" || !document.path.startsWith("/")) {
      throw new Error(`${label}: invalid route path`);
    }
    if (document.path.includes("?") || document.path.includes("#")) {
      throw new Error(`${label}: route path must not include query or fragment state`);
    }
    if (typeof document?.fileName !== "string" || document.fileName.trim() === "") {
      throw new Error(`${label}: missing output fileName`);
    }
    const filePath = resolve(distDir, document.fileName);
    const relativePath = relative(distDir, filePath);
    if (relativePath === "" || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`${label}: output file escapes dist: ${document.fileName}`);
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`${label}: built HTML file missing or not regular: ${filePath}`);
    }
    pages.push({
      path: normalizePathname(document.path),
      fileName: document.fileName,
      canonical: document?.metadata?.url,
      robots: document?.metadata?.robots ?? "index, follow",
      html: readFileSync(filePath, "utf8"),
    });
  }
  return { origin, pages };
}

export function validateBuiltKnowledgePublicLinkGraph(distDirectory) {
  const distDir = resolve(distDirectory);
  const input = loadBuiltPublicPages(distDir);
  const report = validateKnowledgePublicLinkGraph(input);
  writeFileSync(join(distDir, KNOWLEDGE_GRAPH_REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function runCli() {
  const distDir = resolve(process.argv[2] ?? "dist");
  try {
    const report = validateBuiltKnowledgePublicLinkGraph(distDir);
    if (report.status === "FAIL") {
      console.error(
        `validate-knowledge-public-link-graph: FAIL — ${report.problems.length} problem(s) across ` +
          `${report.totals.knowledgeDocuments} Knowledge document(s):\n  - ${report.problems.join("\n  - ")}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `validate-knowledge-public-link-graph: PASS — ${report.totals.publishedKnowledgeDocuments}/` +
        `${report.totals.knowledgeDocuments} published Knowledge documents are reachable from ` +
        `${report.rootPath} within ${report.maxDepth} click(s); zero orphans.`,
    );
  } catch (error) {
    console.error(
      `validate-knowledge-public-link-graph: BLOCKED — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
