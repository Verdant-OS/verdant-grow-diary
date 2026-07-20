#!/usr/bin/env node
/**
 * validate-static-route-head-fidelity
 *
 * Postbuild regression check: every pre-rendered public route in
 * `dist/seo-manifest.json` (emitted by the staticSocialRouteDocuments
 * vite plugin) must expose head metadata that EXACTLY matches the
 * manifest — the same title, description, canonical, og:url,
 * og:title, og:description, og:image, og:image:alt, twitter:card,
 * twitter:title, twitter:description, and twitter:image that
 * JS-executing crawlers would see, so non-JS crawlers (LinkedIn,
 * Slack, Facebook, Twitter card fetcher, etc.) get the same
 * per-route <head> without any hosting rewrite.
 *
 * Fails hard on any drift — silent mis-emission of a route's <head>
 * would look fine locally and rot in production.
 *
 * On every run (pass or fail) the validator writes two artifacts into
 * the dist directory so failures are easy to debug without re-running
 * the build:
 *   - dist/seo-head-fidelity-report.json — machine-readable per-route
 *     diff (expected vs actual for every checked field).
 *   - dist/seo-head-fidelity-report.md — human-readable summary with
 *     one section per drifted route.
 *
 * Pure module + thin CLI so tests can drive it directly.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import {
  EXPECTED_OG_TYPE,
  DEFAULT_ROBOTS_DIRECTIVE,
  ALLOWED_ROBOTS_DIRECTIVES,
  EXPECTED_TWITTER_SITE,
  EXPECTED_TWITTER_CREATOR,
  EXPECTED_JSONLD_NODES,
} from "./public-route-head-invariants.config.mjs";

const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const CANONICAL_REGEX =
  /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
const HREF_REGEX = /href=["']([^"']*)["']/i;
const CONTENT_REGEX = /content=["']([^"']*)["']/i;
const NAME_REGEX = /name=["']([^"']+)["']/i;
const PROPERTY_REGEX = /property=["']([^"']+)["']/i;
const JSONLD_REGEX =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Extract every JSON-LD script block on the page and parse it. Blocks
 * that fail to parse are returned with a `parseError` so the caller
 * can surface them as an invariant violation rather than crashing.
 * @param {string} html
 */
export function extractJsonLd(html) {
  const blocks = [];
  const matches = html.matchAll(JSONLD_REGEX);
  for (const m of matches) {
    const raw = (m[1] ?? "").trim();
    if (raw.length === 0) {
      blocks.push({ raw, parsed: null, parseError: "empty <script> block" });
      continue;
    }
    try {
      blocks.push({ raw, parsed: JSON.parse(raw), parseError: null });
    } catch (err) {
      blocks.push({
        raw,
        parsed: null,
        parseError: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return blocks;
}

/**
 * Flatten every JSON-LD node the page publishes. Handles top-level
 * arrays and `@graph` children so downstream checks can look up nodes
 * by `@type` without caring about wrapping.
 * @param {ReturnType<typeof extractJsonLd>} blocks
 */
export function flattenJsonLdNodes(blocks) {
  const nodes = [];
  for (const block of blocks) {
    if (!block.parsed) continue;
    const roots = Array.isArray(block.parsed) ? block.parsed : [block.parsed];
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;
      if (Array.isArray(root["@graph"])) {
        for (const child of root["@graph"]) {
          if (child && typeof child === "object") nodes.push(child);
        }
      } else {
        nodes.push(root);
      }
    }
  }
  return nodes;
}


function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Extract head values from a document as a lookup map plus title/canonical.
 * @param {string} html
 */
export function extractHead(html) {
  const metas = new Map();
  for (const tag of html.match(META_TAG_REGEX) ?? []) {
    const nameMatch = tag.match(NAME_REGEX);
    const propMatch = tag.match(PROPERTY_REGEX);
    const contentMatch = tag.match(CONTENT_REGEX);
    if (!contentMatch) continue;
    const key = nameMatch
      ? `name:${nameMatch[1].toLowerCase()}`
      : propMatch
        ? `property:${propMatch[1].toLowerCase()}`
        : null;
    if (!key) continue;
    // Last one wins to mirror crawler behavior on duplicates.
    metas.set(key, decode(contentMatch[1]));
  }
  const titleMatch = html.match(TITLE_REGEX);
  const canonicalTag = html.match(CANONICAL_REGEX);
  const canonical = canonicalTag ? canonicalTag[0].match(HREF_REGEX)?.[1] ?? null : null;
  return {
    title: titleMatch ? decode(titleMatch[1].trim()) : null,
    canonical: canonical ? decode(canonical) : null,
    metas,
  };
}

/**
 * Build the ordered list of fields to compare for a manifest entry.
 * Pure so both diffing and reporting share one source of truth.
 * @param {ReturnType<typeof extractHead>} head
 * @param {{ metadata: { title: string; description: string; url: string; image: string; imageAlt: string; robots?: string } }} entry
 */
function fieldChecks(head, entry) {
  const { metadata } = entry;
  const checks = [
    { label: "<title>", expected: metadata.title, actual: head.title },
    { label: "<link rel=canonical>", expected: metadata.url, actual: head.canonical },
    { label: 'meta name="description"', expected: metadata.description, actual: head.metas.get("name:description") ?? null },
    { label: 'meta property="og:title"', expected: metadata.title, actual: head.metas.get("property:og:title") ?? null },
    { label: 'meta property="og:description"', expected: metadata.description, actual: head.metas.get("property:og:description") ?? null },
    { label: 'meta property="og:url"', expected: metadata.url, actual: head.metas.get("property:og:url") ?? null },
    { label: 'meta property="og:image"', expected: metadata.image, actual: head.metas.get("property:og:image") ?? null },
    { label: 'meta property="og:image:alt"', expected: metadata.imageAlt, actual: head.metas.get("property:og:image:alt") ?? null },
    { label: 'meta name="twitter:card"', expected: "summary_large_image", actual: head.metas.get("name:twitter:card") ?? null },
    { label: 'meta name="twitter:title"', expected: metadata.title, actual: head.metas.get("name:twitter:title") ?? null },
    { label: 'meta name="twitter:description"', expected: metadata.description, actual: head.metas.get("name:twitter:description") ?? null },
    { label: 'meta name="twitter:image"', expected: metadata.image, actual: head.metas.get("name:twitter:image") ?? null },
  ];
  // Robots: always asserted. Per-route override wins; otherwise the
  // sitewide default from index.html applies. Any value outside
  // ALLOWED_ROBOTS_DIRECTIVES is a hard fail (checked separately in
  // diffRouteHead so we can flag both "wrong value" and "unknown value").
  const expectedRobots = metadata.robots ?? DEFAULT_ROBOTS_DIRECTIVE;
  checks.push({
    label: 'meta name="robots"',
    expected: expectedRobots,
    actual: head.metas.get("name:robots") ?? null,
  });
  // og:type: sitewide invariant inherited from index.html. Every
  // pre-rendered route must preserve it.
  checks.push({
    label: 'meta property="og:type"',
    expected: EXPECTED_OG_TYPE,
    actual: head.metas.get("property:og:type") ?? null,
  });
  // twitter:site / twitter:creator: if a handle is configured, every
  // route must publish exactly that handle. If null, every route
  // must OMIT the tag (asserted as expected: null).
  checks.push({
    label: 'meta name="twitter:site"',
    expected: EXPECTED_TWITTER_SITE,
    actual: head.metas.get("name:twitter:site") ?? null,
  });
  checks.push({
    label: 'meta name="twitter:creator"',
    expected: EXPECTED_TWITTER_CREATOR,
    actual: head.metas.get("name:twitter:creator") ?? null,
  });
  return checks;
}

/**
 * Non-equality invariants that need a policy check rather than a
 * simple expected/actual compare. Returned as field-shaped diffs so
 * they render in the same JSON/Markdown report.
 * @param {ReturnType<typeof extractHead>} head
 */
function policyChecks(head) {
  const robots = head.metas.get("name:robots") ?? null;
  const results = [];
  if (robots !== null && !ALLOWED_ROBOTS_DIRECTIVES.includes(robots)) {
    results.push({
      label: 'meta name="robots" (allowed values)',
      expected: `one of ${JSON.stringify(ALLOWED_ROBOTS_DIRECTIVES)}`,
      actual: robots,
      ok: false,
    });
  }
  return results;
}

/**
 * Build a structured diff for one route — every checked field, plus a
 * boolean `ok` flag. Consumed by the JSON report writer and by
 * `checkRouteHead` (which flattens to legacy string issues).
 *
 * @param {ReturnType<typeof extractHead>} head
 * @param {{ path: string; fileName?: string; metadata: any }} entry
 */
export function diffRouteHead(head, entry) {
  const fields = fieldChecks(head, entry).map((c) => ({
    ...c,
    ok: c.actual === c.expected,
  }));
  const policyIssues = policyChecks(head);
  const allFields = [...fields, ...policyIssues];
  const mismatched = allFields.filter((f) => !f.ok);
  return {
    path: entry.path,
    fileName: entry.fileName ?? null,
    ok: mismatched.length === 0,
    fields: allFields,
    mismatched,
  };
}

/**
 * Compare an extracted head against the manifest metadata for one route.
 * Returns a list of human-readable failure strings; empty means clean.
 * Kept for backwards compatibility with the unit tests.
 *
 * @param {ReturnType<typeof extractHead>} head
 * @param {{ path: string; metadata: { title: string; description: string; url: string; image: string; imageAlt: string; robots?: string } }} entry
 */
export function checkRouteHead(head, entry) {
  const diff = diffRouteHead(head, entry);
  return diff.mismatched.map(
    (f) =>
      `${entry.path}: ${f.label} mismatch\n    expected: ${JSON.stringify(f.expected)}\n    actual:   ${JSON.stringify(f.actual)}`,
  );
}

/**
 * Render the human-readable Markdown report body from route diffs.
 * @param {ReturnType<typeof diffRouteHead>[]} routeDiffs
 * @param {{ generatedAt: string; distDir: string; missingFiles: Array<{ path: string; fileName: string }> }} meta
 */
export function renderMarkdownReport(routeDiffs, meta) {
  const drifted = routeDiffs.filter((r) => !r.ok);
  const lines = [];
  lines.push("# SEO head fidelity report");
  lines.push("");
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Dist directory: \`${meta.distDir}\``);
  lines.push(`- Routes checked: ${routeDiffs.length}`);
  lines.push(`- Routes with drift: ${drifted.length}`);
  lines.push(`- Missing pre-rendered files: ${meta.missingFiles.length}`);
  lines.push("");
  if (meta.missingFiles.length > 0) {
    lines.push("## Missing pre-rendered files");
    lines.push("");
    for (const m of meta.missingFiles) {
      lines.push(`- \`${m.path}\` → expected \`${m.fileName}\``);
    }
    lines.push("");
  }
  if (drifted.length === 0) {
    lines.push("All checked routes match the manifest. ✅");
    lines.push("");
  } else {
    lines.push("## Drifted routes");
    lines.push("");
    for (const route of drifted) {
      lines.push(`### \`${route.path}\`${route.fileName ? ` (\`${route.fileName}\`)` : ""}`);
      lines.push("");
      lines.push("| Field | Expected | Actual |");
      lines.push("| --- | --- | --- |");
      for (const f of route.mismatched) {
        const exp = JSON.stringify(f.expected);
        const act = JSON.stringify(f.actual);
        lines.push(
          `| ${f.label.replace(/\|/g, "\\|")} | \`${exp.replace(/\|/g, "\\|")}\` | \`${act.replace(/\|/g, "\\|")}\` |`,
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * Validate every entry in the manifest against dist/<fileName>.
 * Always returns `report` — a structured per-route diff — so callers
 * (CLI + tests) can inspect or serialize it.
 * @param {string} distDir
 */
export function validateDist(distDir) {
  const manifestPath = join(distDir, "seo-manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      issues: [
        `seo-manifest.json missing at ${manifestPath}. The staticSocialRouteDocuments vite plugin must run before this validator.`,
      ],
      report: null,
    };
  }
  /** @type {{ origin?: string; documents: Array<{ path: string; fileName: string; metadata: any }> }} */
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const issues = [];
  const routeDiffs = [];
  const missingFiles = [];
  for (const entry of manifest.documents) {
    const filePath = join(distDir, entry.fileName);
    if (!existsSync(filePath)) {
      const msg = `${entry.path}: expected pre-rendered file ${entry.fileName} not found in dist/`;
      issues.push(msg);
      missingFiles.push({ path: entry.path, fileName: entry.fileName });
      routeDiffs.push({
        path: entry.path,
        fileName: entry.fileName,
        ok: false,
        fields: [],
        mismatched: [],
        missing: true,
      });
      continue;
    }
    const head = extractHead(readFileSync(filePath, "utf8"));
    const diff = diffRouteHead(head, entry);
    routeDiffs.push(diff);
    issues.push(...checkRouteHead(head, entry));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    distDir,
    origin: manifest.origin ?? null,
    totals: {
      routes: routeDiffs.length,
      drifted: routeDiffs.filter((r) => !r.ok).length,
      missingFiles: missingFiles.length,
    },
    routes: routeDiffs,
    missingFiles,
  };
  return { ok: issues.length === 0, issues, report };
}

/**
 * Persist the JSON + Markdown reports next to the manifest.
 * @param {string} distDir
 * @param {ReturnType<typeof validateDist>["report"]} report
 */
export function writeReports(distDir, report) {
  if (!report) return { jsonPath: null, mdPath: null };
  const jsonPath = join(distDir, "seo-head-fidelity-report.json");
  const mdPath = join(distDir, "seo-head-fidelity-report.md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    renderMarkdownReport(report.routes, {
      generatedAt: report.generatedAt,
      distDir: report.distDir,
      missingFiles: report.missingFiles,
    }),
  );
  return { jsonPath, mdPath };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = resolve(process.cwd(), process.argv[2] ?? "dist");
  const { ok, issues, report } = validateDist(distDir);
  const paths = report ? writeReports(distDir, report) : { jsonPath: null, mdPath: null };
  if (!ok) {
    console.error(
      `validate-static-route-head-fidelity: ${issues.length} head-fidelity failure(s) in ${distDir}`,
    );
    for (const issue of issues) console.error("  - " + issue);
    if (paths.jsonPath) {
      console.error(`  report: ${paths.jsonPath}`);
      console.error(`  report: ${paths.mdPath}`);
    }
    process.exit(1);
  }
  console.log(`validate-static-route-head-fidelity: OK (${distDir})`);
  if (paths.jsonPath) {
    console.log(`  report: ${paths.jsonPath}`);
    console.log(`  report: ${paths.mdPath}`);
  }
}
