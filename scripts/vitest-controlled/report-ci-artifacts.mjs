// Aggregate CI artifact reporter.
//
// Optionally downloads a GitHub Actions artifact bundle via `gh run
// download`, then verifies the 16-shard controlled-runner contract:
// per-shard artifacts, aggregate reasons, index cardinality, fingerprint
// cardinality, and expected-manifest agreement.
//
// Pure report-building helpers are exported so the contract can be tested
// with a synthetic bundle — no GitHub auth needed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { hashManifest, dedupeAndSort, MANIFEST_SCHEMA_VERSION } from "./manifest.mjs";
import { aggregateShards } from "./summarizer.mjs";
import { verifyShardDirectory } from "./verify-artifacts.mjs";

export const DEFAULT_REPO = "Verdant-OS/verdant-grow-diary";
export const DEFAULT_SHARD_TOTAL = 16;
const SHARD_DIR_RE = /^vitest-controlled-shard-(.+)$/;

/** Enumerate shard directories (including unexpected ones). */
export function enumerateShardDirs(rootDir) {
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SHARD_DIR_RE.test(d.name));
  return entries
    .map((d) => {
      const suffix = d.name.match(SHARD_DIR_RE)[1];
      const asNumber = /^\d+$/.test(suffix) ? Number(suffix) : null;
      return { dir: path.join(rootDir, d.name), name: d.name, index: asNumber };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Compute shard index integrity (missing, duplicate, out-of-range). */
export function shardIndexReport(shardEntries, expectedTotal) {
  const counts = new Map();
  const outOfRange = [];
  const unrecognized = [];
  for (const s of shardEntries) {
    if (s.index == null) {
      unrecognized.push(s.name);
      continue;
    }
    counts.set(s.index, (counts.get(s.index) ?? 0) + 1);
    if (s.index < 1 || s.index > expectedTotal) outOfRange.push(s.index);
  }
  const missing = [];
  for (let i = 1; i <= expectedTotal; i++) if (!counts.has(i)) missing.push(i);
  const duplicates = [];
  for (const [i, c] of counts) if (c > 1) duplicates.push({ index: i, count: c });
  return {
    expectedTotal,
    observedIndexes: [...counts.keys()].sort((a, b) => a - b),
    missing,
    duplicates,
    outOfRange,
    unrecognized,
    ok:
      missing.length === 0 &&
      duplicates.length === 0 &&
      outOfRange.length === 0 &&
      unrecognized.length === 0,
  };
}

/** Fingerprint cardinality check. */
export function fingerprintCardinality(shardSummaries, expectedTotal) {
  const common = new Set();
  const assignment = new Set();
  const composite = new Set();
  const workspace = new Set();
  const manifestHashes = new Set();
  for (const s of shardSummaries) {
    if (s.commonConfigFingerprint) common.add(s.commonConfigFingerprint);
    if (s.assignmentFingerprint) assignment.add(s.assignmentFingerprint);
    if (s.shardFingerprint) composite.add(s.shardFingerprint);
    if (s.workspaceFingerprintDigest) workspace.add(s.workspaceFingerprintDigest);
    if (s.manifestHash) manifestHashes.add(s.manifestHash);
  }
  const reasons = [];
  if (common.size !== 1) reasons.push({ code: "common_config_cardinality", size: common.size });
  if (assignment.size !== expectedTotal)
    reasons.push({
      code: "assignment_cardinality",
      size: assignment.size,
      expected: expectedTotal,
    });
  if (composite.size !== expectedTotal)
    reasons.push({ code: "composite_cardinality", size: composite.size, expected: expectedTotal });
  if (workspace.size !== 1) reasons.push({ code: "workspace_cardinality", size: workspace.size });
  if (manifestHashes.size !== 1)
    reasons.push({ code: "manifest_cardinality", size: manifestHashes.size });
  return { ok: reasons.length === 0, reasons };
}

/** Validate the uploaded expected manifest independently. */
export function verifyExpectedManifest(manifest) {
  const reasons = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, reasons: [{ code: "manifest_missing" }] };
  }
  if (manifest.schema !== MANIFEST_SCHEMA_VERSION) {
    reasons.push({ code: "manifest_schema", actual: manifest.schema });
  }
  if (!Array.isArray(manifest.files)) {
    reasons.push({ code: "manifest_files_missing" });
    return { ok: false, reasons };
  }
  if (manifest.count !== manifest.files.length) {
    reasons.push({ code: "manifest_count_mismatch" });
  }
  try {
    const sorted = dedupeAndSort(manifest.files);
    const recomputed = hashManifest(sorted);
    if (recomputed !== manifest.hash) {
      reasons.push({ code: "manifest_hash_mismatch", stored: manifest.hash, recomputed });
    }
  } catch (err) {
    reasons.push({ code: "manifest_duplicates", error: err.message });
  }
  return { ok: reasons.length === 0, reasons };
}

/** Union of assigned files across shards vs. expected manifest. */
export function coverageReport(shardSummaries, expectedManifest) {
  const owners = new Map();
  for (const s of shardSummaries) {
    for (const f of s.assignedFiles || []) {
      if (!owners.has(f)) owners.set(f, []);
      owners.get(f).push(s.shardIndex);
    }
  }
  const expected = new Set(expectedManifest?.files || []);
  const observed = new Set(owners.keys());
  const missing = [...expected].filter((f) => !observed.has(f)).sort();
  const extra = [...observed].filter((f) => !expected.has(f)).sort();
  const multiplyOwned = [];
  for (const [f, list] of owners)
    if (list.length > 1) multiplyOwned.push({ file: f, shards: list });
  return {
    ok: missing.length === 0 && extra.length === 0 && multiplyOwned.length === 0,
    missing,
    extra,
    multiplyOwned,
  };
}

/** Build the full report from an already-populated directory. */
export function buildReport({
  rootDir,
  expectedTotal = DEFAULT_SHARD_TOTAL,
  loadSummary = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")),
  verifyShard = verifyShardDirectory,
  loadExpectedManifest,
}) {
  const shardEntries = enumerateShardDirs(rootDir);
  const indexReport = shardIndexReport(shardEntries, expectedTotal);
  const perShard = shardEntries.map((e) => {
    let verify = null;
    let summary = null;
    try {
      verify = verifyShard(e.dir);
    } catch (err) {
      verify = { ok: false, reasons: [{ code: "verify_threw", error: err.message }] };
    }
    try {
      summary = loadSummary(e.dir);
    } catch (err) {
      summary = null;
    }
    return { ...e, verify, summary };
  });
  const shardSummaries = perShard.map((p) => p.summary).filter(Boolean);

  const expectedManifest =
    loadExpectedManifest?.() ??
    (() => {
      const p = path.join(rootDir, "vitest-controlled-aggregate", "expected-manifest.json");
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    })();

  const manifestReport = verifyExpectedManifest(expectedManifest);
  const fingerprints = fingerprintCardinality(shardSummaries, expectedTotal);
  const coverage = coverageReport(shardSummaries, expectedManifest);
  const aggregate = aggregateShards(shardSummaries, { manifest: expectedManifest || undefined });

  const perShardManifestMismatch = shardSummaries
    .filter((s) => expectedManifest && s.manifestHash !== expectedManifest.hash)
    .map((s) => ({ shardIndex: s.shardIndex, hash: s.manifestHash }));

  const ok =
    indexReport.ok &&
    fingerprints.ok &&
    coverage.ok &&
    manifestReport.ok &&
    perShard.every((p) => p.verify?.ok) &&
    aggregate.status === "complete" &&
    aggregate.reasons.length === 0 &&
    perShardManifestMismatch.length === 0;

  return {
    ok,
    rootDir,
    expectedTotal,
    indexReport,
    fingerprints,
    coverage,
    manifestReport,
    aggregate,
    perShard: perShard.map((p) => ({
      name: p.name,
      index: p.index,
      ok: p.verify?.ok ?? false,
      reasons: p.verify?.reasons ?? [],
    })),
    perShardManifestMismatch,
  };
}

/** Guarded gh-download wrapper — refuses to overwrite a nonempty dir. */
export function downloadArtifacts({
  runId,
  repo = DEFAULT_REPO,
  outDir,
  spawnImpl = spawnSync,
} = {}) {
  if (!runId) throw new Error("downloadArtifacts requires --run-id");
  if (!outDir) throw new Error("downloadArtifacts requires --out-dir");
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    throw new Error(`refusing to overwrite nonempty artifact directory: ${outDir}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const res = spawnImpl("gh", ["run", "download", String(runId), "--repo", repo, "--dir", outDir], {
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error(`gh run download exited ${res.status}`);
}

function parseArgv(argv) {
  const out = {
    runId: null,
    repo: DEFAULT_REPO,
    outDir: null,
    reuse: false,
    expectedTotal: DEFAULT_SHARD_TOTAL,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-id") out.runId = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
    else if (a === "--out-dir") out.outDir = argv[++i];
    else if (a === "--reuse") out.reuse = true;
    else if (a === "--expected-total") out.expectedTotal = Number(argv[++i]);
    else if (a === "--json") out.json = true;
  }
  return out;
}

export async function main(argv) {
  const args = parseArgv(argv);
  if (!args.outDir) {
    process.stderr.write("Usage: report-ci-artifacts.mjs (--reuse | --run-id ID) --out-dir DIR\n");
    return 64;
  }
  if (!args.reuse) downloadArtifacts({ runId: args.runId, repo: args.repo, outDir: args.outDir });
  const report = buildReport({ rootDir: args.outDir, expectedTotal: args.expectedTotal });
  if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else {
    process.stdout.write(
      `ok=${report.ok} aggregate=${report.aggregate.status} reasons=${report.aggregate.reasons.length}\n`,
    );
    process.stdout.write(
      `indexes: missing=${report.indexReport.missing.length} dupes=${report.indexReport.duplicates.length} out-of-range=${report.indexReport.outOfRange.length}\n`,
    );
  }
  return report.ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    },
  );
}
