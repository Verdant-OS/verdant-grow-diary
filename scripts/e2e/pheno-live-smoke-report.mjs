#!/usr/bin/env node
/**
 * Pure helpers for the Pheno live-smoke runner: parse a Playwright JSON
 * report into aggregate stats and derive the 12-checkpoint release matrix
 * from INDIVIDUAL test results — never from aggregate counts.
 *
 * Evidence is limited to sanitized Playwright test titles. Credentials,
 * URLs, emails, session values, fixture ids, cookies, and tokens never
 * appear here.
 */

/**
 * Checkpoint → the Playwright test title fragments that PROVE it. A
 * checkpoint is PASS only when every mapped test exists and passed;
 * FAIL if any mapped test failed; SKIPPED if any was skipped; PENDING when
 * no mapped test exists in the report (or the checkpoint has no automated
 * proof — 6 stays PENDING for the live runner unless manual evidence
 * overrides it in the receipt inputs; checkpoint 9's separate manual release
 * requirement is a receipt policy and is unchanged by this mapping).
 */
export const CHECKPOINT_TEST_MAP = [
  {
    id: 1,
    label: "Free user gate",
    titles: ["Free user sees the upgrade gate on /pheno-hunts/new"],
  },
  {
    id: 2,
    label: "Upgrade return path",
    titles: [
      "the CTA returnTo round-trips to /pricing",
      "unsafe returnTo is rejected",
    ],
  },
  { id: 3, label: "Pro access and onboarding", titles: ["Pro user can load /pheno-hunts/new"] },
  { id: 4, label: "Founder access", titles: ["Founder user can load /pheno-hunts/new"] },
  { id: 5, label: "Canceled/expired behavior", titles: ["Canceled user hitting /pheno-hunts/new sees gate"] },
  { id: 6, label: "Hunt setup persistence", titles: [] },
  { id: 7, label: "Workspace status split", titles: ["workspace shows disabled Compare"] },
  {
    id: 8,
    label: "Incomplete comparison gate",
    titles: ["workspace shows disabled Compare with the exact not-ready reason"],
  },
  {
    id: 9,
    label: "Missing-evidence navigation",
    titles: ["missing-evidence next-step anchor navigates within the workspace"],
  },
  { id: 10, label: "Direct incomplete /compare", titles: ["direct /compare on incomplete hunt shows not-ready warning"] },
  {
    id: 11,
    label: "Comparison-ready flow",
    titles: ["workspace enables Compare and /compare renders substantive read-only comparison"],
  },
  { id: 12, label: "Core Verdant regression", titles: ["dashboard route still resolves without a crash"] },
];

/** Flatten a Playwright JSON report into [{ title, outcome }]. */
export function collectTestOutcomes(report) {
  const results = [];
  const walk = (suite) => {
    for (const child of suite?.suites ?? []) walk(child);
    for (const spec of suite?.specs ?? []) {
      for (const test of spec?.tests ?? []) {
        // Playwright outcome per test: expected | unexpected | skipped | flaky
        const outcome = String(test?.status ?? "").toLowerCase();
        results.push({ title: String(spec?.title ?? ""), outcome });
      }
    }
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return results;
}

export function statsFromReport(report) {
  const stats = report?.stats;
  if (!stats || typeof stats !== "object") return null;
  const passed = Number(stats.expected ?? 0);
  const failed = Number(stats.unexpected ?? 0);
  const skipped = Number(stats.skipped ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  return { passed, failed, skipped, flaky, total: passed + failed + skipped + flaky };
}

/**
 * Gate the runner outcome on the parsed stats. Missing report or any
 * failed/skipped test is a FAIL — silence must never read as success.
 */
export function evaluateStats(stats) {
  if (!stats) return { ok: false, reason: "JSON report missing or unreadable" };
  if (stats.failed > 0) return { ok: false, reason: `${stats.failed} failed` };
  if (stats.skipped > 0) return { ok: false, reason: `${stats.skipped} skipped` };
  if (stats.passed === 0) return { ok: false, reason: "0 tests passed" };
  return { ok: true, reason: "" };
}

export function deriveCheckpoints(report) {
  const outcomes = report ? collectTestOutcomes(report) : [];
  return CHECKPOINT_TEST_MAP.map(({ id, label, titles }) => {
    if (titles.length === 0) {
      return { id, label, status: "PENDING", evidence: "no automated proof in the live smoke" };
    }
    const matches = titles.map((fragment) => ({
      fragment,
      tests: outcomes.filter((o) => o.title.includes(fragment)),
    }));
    const missing = matches.filter((m) => m.tests.length === 0);
    if (missing.length > 0) {
      return { id, label, status: "PENDING", evidence: "matching Playwright test absent" };
    }
    const all = matches.flatMap((m) => m.tests);
    if (all.some((t) => t.outcome === "unexpected")) {
      return { id, label, status: "FAIL", evidence: sanitizeTitles(all) };
    }
    if (all.some((t) => t.outcome === "skipped")) {
      return { id, label, status: "SKIPPED", evidence: sanitizeTitles(all) };
    }
    if (all.every((t) => t.outcome === "expected" || t.outcome === "flaky")) {
      return { id, label, status: "PASS", evidence: sanitizeTitles(all) };
    }
    return { id, label, status: "PENDING", evidence: sanitizeTitles(all) };
  });
}

function sanitizeTitles(tests) {
  const titles = [...new Set(tests.map((t) => t.title))];
  // Titles are authored constants, but scrub defensively: no emails, no
  // UUIDs, no query strings survive into evidence.
  return titles
    .map((title) =>
      title
        .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<redacted>")
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
        .replace(/\?[^\s"']+/g, ""),
    )
    .join("; ")
    .slice(0, 220);
}
