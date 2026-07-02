#!/usr/bin/env node
/**
 * Verdant SEO Monitoring v1 — bounded GSC URL Inspection runner.
 *
 * Reads credentials from env (CI) or .seo/gsc-token.local.json (local),
 * inspects a bounded set of URLs, and writes sanitized reports to
 * artifacts/seo/. Fails with non-zero exit on new critical issues.
 *
 * Flags:
 *   --urls a,b,c        Explicit URL list
 *   --sitemap <url>     Pull URLs from a sitemap.xml
 *   --max <n>           Max URLs to inspect (default 15, hard cap 50)
 *   --allow <a,b,c>     URLs allowed to be non-indexable (skip fail)
 *   --expected-noindex  Treat every URL as expected-non-indexable
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGscCredentials, getAccessToken, inspectUrl, summarizeInspection, classifyIssues } from "./gscClient.mjs";

const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");
const DEFAULT_URLS = ["https://verdantgrowdiary.com/", "https://verdantgrowdiary.com/welcome", "https://verdantgrowdiary.com/pricing", "https://verdantgrowdiary.com/hardware-integrations"];
const HARD_CAP = 50;

function parseArgs(argv) {
  const out = { urls: null, sitemap: null, max: 15, allow: [], expectedNoindex: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--urls") out.urls = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--sitemap") out.sitemap = argv[++i];
    else if (a === "--max") out.max = Math.min(HARD_CAP, Math.max(1, Number(argv[++i]) || 15));
    else if (a === "--allow") out.allow = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--expected-noindex") out.expectedNoindex = true;
  }
  return out;
}

async function urlsFromSitemap(sitemapUrl) {
  const r = await fetch(sitemapUrl);
  if (!r.ok) throw new Error(`sitemap fetch failed: HTTP ${r.status}`);
  const xml = await r.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
}

function toMarkdown(results) {
  const lines = [
    "# GSC URL Inspection Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| URL | Verdict | Coverage | Robots | Indexing | Fetch | Canonical Match | Mobile | Rich |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    const s = r.summary;
    const canonicalMatch =
      s.userCanonical && s.googleCanonical ? (s.userCanonical === s.googleCanonical ? "yes" : "NO") : "-";
    lines.push(
      `| ${s.url} | ${s.verdict} | ${s.coverageState ?? "-"} | ${s.robotsTxtState ?? "-"} | ${s.indexingState ?? "-"} | ${s.pageFetchState ?? "-"} | ${canonicalMatch} | ${s.mobileVerdict ?? "-"} | ${s.richResultsVerdict ?? "-"} |`,
    );
  }
  const failing = results.flatMap((r) => r.issues);
  lines.push("", `## Critical issues (${failing.length})`);
  if (failing.length === 0) lines.push("None.");
  else for (const i of failing) lines.push(`- \`${i.code}\` — ${i.message}`);
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const creds = loadGscCredentials();
  if (!creds.ok) {
    const skipPayload = {
      status: "skipped",
      reason: "GSC OAuth not configured",
      missing: creds.missing,
      generated_at: new Date().toISOString(),
    };
    writeFileSync(resolve(ARTIFACT_DIR, "gsc-url-inspection.json"), JSON.stringify(skipPayload, null, 2));
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-url-inspection.md"),
      `# GSC URL Inspection Report\n\nSkipped: GSC OAuth is not configured.\n\nMissing: ${creds.missing.join(", ")}\n`,
    );
    console.log("GSC OAuth not configured — skipping (missing: " + creds.missing.join(", ") + ")");
    process.exit(0);
  }

  let urls = args.urls;
  if (!urls && args.sitemap) urls = await urlsFromSitemap(args.sitemap);
  if (!urls || urls.length === 0) urls = DEFAULT_URLS;
  urls = urls.slice(0, args.max);

  const allow = new Set(args.allow);
  const accessToken = await getAccessToken(creds);
  const results = [];
  for (const url of urls) {
    try {
      const raw = await inspectUrl({ accessToken, siteUrl: creds.siteUrl, inspectionUrl: url });
      const summary = summarizeInspection(url, raw);
      const expectedIndexable = !args.expectedNoindex && !allow.has(url);
      const issues = classifyIssues(summary, { expectedIndexable });
      results.push({ summary, issues });
    } catch (e) {
      results.push({
        summary: { url, verdict: "ERROR" },
        issues: [{ code: "inspection_error", message: `${url}: ${e.message}` }],
      });
    }
  }

  const failing = results.flatMap((r) => r.issues);
  const payload = {
    status: failing.length ? "failed" : "passed",
    generated_at: new Date().toISOString(),
    site_url: creds.siteUrl,
    inspected_count: results.length,
    critical_issue_count: failing.length,
    results,
  };
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-url-inspection.json"), JSON.stringify(payload, null, 2));
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-url-inspection.md"), toMarkdown(results));
  console.log(`Inspected ${results.length} URL(s); ${failing.length} critical issue(s).`);
  process.exit(failing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
