#!/usr/bin/env node
/**
 * Verdant SEO Monitoring v1 — verify the last tracked GSC finding is resolved.
 *
 * Reads config/seo-last-gsc-finding.json and re-inspects its affected URLs
 * via the Search Console URL Inspection API, comparing observed state to
 * expected_resolution flags.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadGscCredentials, getAccessToken, inspectUrl, summarizeInspection } from "./gscClient.mjs";
import { loadAllowlist, findExpiredEntriesMatchingUrls, DEFAULT_ALLOWLIST_PATH } from "./seoAllowlist.mjs";

const CONFIG_PATH = resolve(process.cwd(), "config/seo-last-gsc-finding.json");
const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");

function evaluate(summary, expected) {
  const checks = [];
  if (expected.indexing_allowed) {
    const ok = summary.verdict === "PASS" || summary.verdict === "NEUTRAL";
    checks.push({ name: "indexing_allowed", ok, observed: summary.verdict });
  }
  if (expected.robots_allowed) {
    const ok = !summary.robotsTxtState || summary.robotsTxtState === "ALLOWED";
    checks.push({ name: "robots_allowed", ok, observed: summary.robotsTxtState });
  }
  if (expected.noindex_absent) {
    const ok = !summary.indexingState || !/BLOCKED_BY_META_TAG|BLOCKED_BY_HTTP_HEADER/i.test(summary.indexingState);
    checks.push({ name: "noindex_absent", ok, observed: summary.indexingState });
  }
  if (expected.canonical_matches) {
    const ok =
      !summary.userCanonical ||
      !summary.googleCanonical ||
      summary.userCanonical === summary.googleCanonical;
    checks.push({
      name: "canonical_matches",
      ok,
      observed: { user: summary.userCanonical, google: summary.googleCanonical },
    });
  }
  return checks;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    console.log(`No tracked finding at ${CONFIG_PATH} — nothing to verify.`);
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify({ status: "skipped", reason: "no_config" }, null, 2),
    );
    process.exit(0);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const isPlaceholder =
    !config.description ||
    /placeholder/i.test(config.description) ||
    !Array.isArray(config.affected_urls) ||
    config.affected_urls.length === 0;
  const creds = loadGscCredentials();
  if (!creds.ok) {
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify({ status: "skipped", reason: "gsc_oauth_not_configured", missing: creds.missing }, null, 2),
    );
    console.log("GSC OAuth not configured — skipping last-finding verification.");
    process.exit(0);
  }
  if (isPlaceholder) {
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: "config_is_placeholder",
          hint: "Update config/seo-last-gsc-finding.json with a real description and affected_urls before verification.",
        },
        null,
        2,
      ),
    );
    console.log("Last-finding config is a placeholder — refusing to mark resolved.");
    process.exit(0);
  }
  const accessToken = await getAccessToken(creds);
  const urls = config.affected_urls ?? [];
  const results = [];
  for (const url of urls) {
    try {
      const raw = await inspectUrl({ accessToken, siteUrl: creds.siteUrl, inspectionUrl: url });
      const summary = summarizeInspection(url, raw);
      const checks = evaluate(summary, config.expected_resolution ?? {});
      const resolved = checks.length > 0 && checks.every((c) => c.ok);
      results.push({ url, summary, checks, resolved });
    } catch (e) {
      results.push({ url, error: e.message, resolved: false });
    }
  }
  // Guard: refuse to declare "resolved" if any expired allowlist entry
  // covers one of the affected URLs — stale suppression could otherwise
  // mask the regression the finding is meant to detect.
  const allowlist = loadAllowlist(DEFAULT_ALLOWLIST_PATH);
  const expiredCovering = findExpiredEntriesMatchingUrls(allowlist, urls);

  const allResolved =
    results.length > 0 && results.every((r) => r.resolved) && expiredCovering.length === 0;
  const status = expiredCovering.length > 0
    ? "unresolved_expired_allowlist"
    : allResolved
      ? "resolved"
      : "unresolved";
  const payload = {
    status,
    finding_id: config.finding_id,
    description: config.description,
    generated_at: new Date().toISOString(),
    expired_allowlist_entries_covering_finding: expiredCovering,
    results,
  };
  writeFileSync(
    resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
    JSON.stringify(payload, null, 2),
  );
  const md = [
    `# Last GSC Finding Verification`,
    ``,
    `- **finding_id:** ${config.finding_id}`,
    `- **status:** ${payload.status}`,
    `- **description:** ${config.description}`,
    ``,
    ...(expiredCovering.length
      ? [
          `⚠️ Refusing to mark resolved: ${expiredCovering.length} expired allowlist entr${expiredCovering.length === 1 ? "y" : "ies"} still cover the affected URLs.`,
          ...expiredCovering.map(
            (e) => `- \`${e.section}[${e.id}]\` expired on ${e.expires_on}`,
          ),
          ``,
        ]
      : []),
    ...results.map((r) => `- ${r.resolved ? "✅" : "❌"} ${r.url}`),
    ``,
  ].join("\n");
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-last-finding-verification.md"), md);
  console.log(`Last finding verification: ${payload.status}`);
  process.exit(allResolved ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
