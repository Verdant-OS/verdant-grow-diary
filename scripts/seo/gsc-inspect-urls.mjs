#!/usr/bin/env node
/**
 * Verdant SEO Monitoring v1 — bounded GSC URL Inspection runner.
 *
 * Reads credentials from env (CI) or .seo/gsc-token.local.json (local),
 * inspects a bounded set of URLs, applies the tracked SEO allowlist,
 * and writes sanitized reports to artifacts/seo/. Fails with non-zero
 * exit only on genuinely new critical issues.
 *
 * Flags:
 *   --urls a,b,c        Explicit URL list
 *   --sitemap <url>     Pull URLs from a sitemap.xml
 *   --max <n>           Max URLs to inspect (default 15, hard cap 50)
 *   --allow <a,b,c>     Ad-hoc URLs allowed to be non-indexable (skip fail)
 *   --expected-noindex  Treat every URL as expected-non-indexable
 *   --allowlist <path>  Tracked allowlist (default: config/seo-allowlist.json)
 *   --no-allowlist      Ignore the tracked allowlist entirely
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGscCredentials, getAccessToken, inspectUrl, summarizeInspection, classifyIssues } from "./gscClient.mjs";
import {
  loadAllowlist,
  applyAllowlist,
  isExpectedNoindex,
  isNeverAllowlisted,
  validateAllowlist,
  DEFAULT_ALLOWLIST_PATH,
} from "./seoAllowlist.mjs";

const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");
const DEFAULT_URLS = ["https://verdantgrowdiary.com/", "https://verdantgrowdiary.com/welcome", "https://verdantgrowdiary.com/pricing", "https://verdantgrowdiary.com/hardware-integrations"];
const HARD_CAP = 50;

function parseArgs(argv) {
  const out = {
    urls: null,
    sitemap: null,
    max: 15,
    allow: [],
    expectedNoindex: false,
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    useAllowlist: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--urls") out.urls = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--sitemap") out.sitemap = argv[++i];
    else if (a === "--max") out.max = Math.min(HARD_CAP, Math.max(1, Number(argv[++i]) || 15));
    else if (a === "--allow") out.allow = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--expected-noindex") out.expectedNoindex = true;
    else if (a === "--allowlist") out.allowlistPath = resolve(argv[++i]);
    else if (a === "--no-allowlist") out.useAllowlist = false;
  }
  return out;
}

async function urlsFromSitemap(sitemapUrl) {
  const r = await fetch(sitemapUrl);
  if (!r.ok) throw new Error(`sitemap fetch failed: HTTP ${r.status}`);
  const xml = await r.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
}

function toMarkdown(results, allowlistSource) {
  const lines = [
    "# GSC URL Inspection Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    allowlistSource ? `Allowlist: \`${allowlistSource}\`` : "Allowlist: (none)",
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
  const suppressed = results.flatMap((r) => r.suppressed ?? []);
  lines.push("", `## Critical issues (${failing.length})`);
  if (failing.length === 0) lines.push("None.");
  else for (const i of failing) lines.push(`- \`${i.code}\` — ${i.message}`);
  lines.push("", `## Suppressed by allowlist (${suppressed.length})`);
  if (suppressed.length === 0) lines.push("None.");
  else for (const i of suppressed) lines.push(`- \`${i.code}\` — ${i.message} _(via ${i.suppressed_by})_`);
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const allowlist = args.useAllowlist ? loadAllowlist(args.allowlistPath) : loadAllowlist("/dev/null");
  if (args.useAllowlist) {
    const errs = validateAllowlist(allowlist);
    if (errs.length) {
      console.error("Allowlist validation failed:");
      for (const e of errs) console.error("  - " + e);
      process.exit(2);
    }
  }

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

  const adhocAllow = new Set(args.allow);
  const accessToken = await getAccessToken(creds);
  const results = [];
  for (const url of urls) {
    try {
      const raw = await inspectUrl({ accessToken, siteUrl: creds.siteUrl, inspectionUrl: url });
      const summary = summarizeInspection(url, raw);
      const trackedNoindex = isExpectedNoindex(url, allowlist);
      const isNever = isNeverAllowlisted(url, allowlist);
      // never_allowlist URLs ignore --expected-noindex / tracked noindex.
      const expectedIndexable = isNever
        ? true
        : !(args.expectedNoindex || adhocAllow.has(url) || trackedNoindex);
      const raw_issues = classifyIssues(summary, { expectedIndexable });
      const { kept, suppressed } = isNever
        ? { kept: raw_issues, suppressed: [] }
        : applyAllowlist(url, raw_issues, allowlist);
      results.push({ summary, issues: kept, suppressed });
    } catch (e) {
      results.push({
        summary: { url, verdict: "ERROR" },
        issues: [{ code: "inspection_error", message: `${url}: ${e.message}` }],
        suppressed: [],
      });
    }
  }

  const failing = results.flatMap((r) => r.issues);
  const suppressed = results.flatMap((r) => r.suppressed ?? []);
  const payload = {
    status: failing.length ? "failed" : "passed",
    generated_at: new Date().toISOString(),
    site_url: creds.siteUrl,
    inspected_count: results.length,
    critical_issue_count: failing.length,
    suppressed_issue_count: suppressed.length,
    allowlist_source: allowlist._source,
    results,
  };
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-url-inspection.json"), JSON.stringify(payload, null, 2));
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-url-inspection.md"), toMarkdown(results, allowlist._source));
  console.log(
    `Inspected ${results.length} URL(s); ${failing.length} critical, ${suppressed.length} suppressed by allowlist.`,
  );
  process.exit(failing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
