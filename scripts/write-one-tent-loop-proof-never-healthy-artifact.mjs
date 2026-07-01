#!/usr/bin/env node
/**
 * write-one-tent-loop-proof-never-healthy-artifact.mjs
 *
 * Generates a deterministic, sanitized proof text file for the
 * One-Tent Loop Proof never-healthy safety gate. Used by CI to upload
 * a debuggable artifact on failure so a human can inspect exactly what
 * the pure rules produced for hostile / malformed telemetry — without
 * exposing raw payloads, tokens, or secrets.
 *
 * SAFETY:
 *   - No network calls.
 *   - No filesystem writes outside the workspace `artifacts/` folder.
 *   - No credentials, service_role, bridge_token, or raw payload
 *     values are written; a post-render scrubber refuses to emit any
 *     line matching those forbidden substrings.
 *   - Pure: runs the same evaluators + view-model the app uses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

// Register a lightweight TS loader if available so we can import the
// rules module directly. Falls back to a helpful error if unavailable.
try {
  register("ts-node/esm", pathToFileURL("./"));
} catch {
  // ts-node is optional; the CI image runs this via `bun` which
  // handles TS natively. When invoked with `node` directly outside CI
  // ts-node may not be present — that is fine, we surface a clear
  // error below.
}

const RULES_MOD = "../src/lib/oneTentLoopProofRules.ts";
const VIEW_MOD = "../src/lib/oneTentLoopLiveProofViewModel.ts";

let rules;
let view;
try {
  rules = await import(new URL(RULES_MOD, import.meta.url).href);
  view = await import(new URL(VIEW_MOD, import.meta.url).href);
} catch (err) {
  console.error(
    "[artifact] Could not load rules/view modules. Run via `bun` " +
      "(bun run artifact:one-tent-loop-proof-never-healthy) or with " +
      "ts-node/esm registered.\n" +
      String(err),
  );
  process.exit(2);
}

const NOW_MS = Date.parse("2026-06-09T12:00:00.000Z");
const FRESH_ISO = "2026-06-09T11:58:00.000Z";
const STALE_ISO = "2026-06-09T11:30:00.000Z";
const OLD_ISO = "2026-06-01T00:00:00.000Z";

/** Deterministic hostile cases mirroring the fuzz suite. */
const CASES = [
  { name: "missing snapshot", snap: null },
  { name: "empty snapshot", snap: {} },
  { name: "unknown source label", snap: { source: "unknown", captured_at: FRESH_ISO } },
  { name: "hostile source healthy", snap: { source: "healthy", captured_at: FRESH_ISO } },
  { name: "hostile source service_role", snap: { source: "service_role", captured_at: FRESH_ISO } },
  { name: "stale live snapshot", snap: { source: "live", captured_at: STALE_ISO, confidence: 0.9 } },
  { name: "very old manual snapshot", snap: { source: "manual", captured_at: OLD_ISO } },
  { name: "demo source", snap: { source: "demo", captured_at: FRESH_ISO } },
  { name: "invalid source", snap: { source: "invalid", captured_at: FRESH_ISO } },
  { name: "unknown top-level key (readings)", snap: { source: "live", captured_at: FRESH_ISO, readings: { temp_f: "NaN" } } },
  { name: "unknown top-level key (metrics)", snap: { source: "live", captured_at: FRESH_ISO, metrics: { vpd: "Infinity" } } },
];

function baseEvidence(snap) {
  return {
    grow: { id: "g1", name: "G", stage: "veg", status: "active" },
    tent: { id: "t1", name: "T", grow_id: "g1", has_environment_target: true },
    plant: {
      id: "p1",
      name: "P",
      stage: "veg",
      medium: "coco",
      pot_size: "3 gal",
      tent_id: "t1",
    },
    latest_quick_log: null,
    timeline: null,
    latest_sensor_snapshot: snap,
    latest_ai_doctor: null,
    latest_alert: null,
    latest_action_queue: null,
    latest_follow_up: null,
    now_ms: NOW_MS,
  };
}

// Forbidden substrings must never appear in the emitted artifact.
const FORBIDDEN = [
  "service_role",
  "bridge_token",
  "raw_payload",
  "eyJhbGci",
  "sk_live_",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function scrub(text) {
  const lower = text.toLowerCase();
  for (const f of FORBIDDEN) {
    if (lower.includes(f.toLowerCase())) {
      throw new Error(
        `[artifact] REFUSING to emit — forbidden token "${f}" found in rendered proof. ` +
          `This means the rules layer leaked untrusted input into user-facing copy. ` +
          `Fix the sanitizer, not this script.`,
      );
    }
  }
  return text;
}

const chunks = [];
chunks.push("# One-Tent Loop Proof — never-healthy artifact");
chunks.push(`# Generated at: ${new Date(NOW_MS).toISOString()}`);
chunks.push("# Read-only. No writes. No network. No secrets.");
chunks.push("");

for (const c of CASES) {
  const evidence = baseEvidence(c.snap);
  const v = view.buildOneTentLoopLiveProofView(evidence, NOW_MS);
  const report = view.buildOneTentLoopLiveProofTextReport(v);
  const sensor = v.steps.find((s) => s.id === "sensor-snapshot");
  chunks.push(`## Case: ${c.name}`);
  chunks.push(`sensor.status = ${sensor?.status}`);
  chunks.push(`sensor.provenance = ${sensor?.provenance ?? "unknown"}`);
  chunks.push(`sensor.source = ${sensor?.source ?? "unknown"}`);
  chunks.push("--- report ---");
  chunks.push(report);
  chunks.push("");
}

const body = scrub(chunks.join("\n"));

const outPath = resolve(
  process.cwd(),
  "artifacts/one-tent-loop-proof/never-healthy-proof-report.txt",
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, body, "utf8");
console.log(`[artifact] wrote ${outPath} (${body.length} bytes)`);
