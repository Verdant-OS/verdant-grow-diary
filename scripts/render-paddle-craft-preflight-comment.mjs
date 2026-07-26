#!/usr/bin/env node
// Renders the sticky PR comment for the Paddle Craft catalog preflight.
//
// This module is deliberately parser-only: it never talks to Paddle, never
// echoes raw log content, and never trusts anything except the exit code +
// the small set of structured lines the verifier emits. Everything else
// (`pri_...` internal ids, API response bodies, header dumps) is dropped
// on the floor so a passing or errored line can't leak into a PR comment.
//
// Preferred input path: `--report <path>` reads the verifier's JSON
// report (see scripts/verify-paddle-craft-catalog.ts `finalize()`) which
// carries the same fields already-classified. `--log <path>` remains the
// fallback for older CI runs / local ad-hoc invocations that don't emit
// the report file — behaviour is identical when the log is well-formed.
//
// Callable as a CLI:
//   node scripts/render-paddle-craft-preflight-comment.mjs \
//     [--report path/to/report.json | --log path/to/log] \
//     --rc <exit-code> --event <pull_request|schedule|...> \
//     [--out path/to/comment.md] [--json]
//
// Exit code is always 0 — this script only renders. The caller decides
// whether to fail the build based on the JSON verdict written to stdout
// or the `--json` field emitted with `--json`.

import { readFileSync, writeFileSync } from "node:fs";

export const COMMENT_MARKER = "<!-- paddle-craft-catalog-preflight -->";

// The verifier prints one line per (env, external_id):
//   ✓ [sandbox] craft_monthly — active price pri_...
//   ✗ [live] craft_annual — no price entity found (checked active + archived)
//   • [live] craft_monthly — PADDLE_LIVE_API_KEY not set
// Plus one SUMMARY line: SUMMARY: pass=<n> fail=<n> skip=<n>
const LINE_RE = /^([✓✗•])\s+\[(sandbox|live)\]\s+(\S+)\s+—\s+(.+?)\s*$/u;
const SUMMARY_RE = /^SUMMARY:\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+)\s*$/;
const KEY_UNSET_RE = /_API_KEY is not set/;

/**
 * Classify a fail detail into a category. Different causes get different
 * remedies — telling an operator to "create the price" during a Paddle
 * outage sends them the wrong way.
 */
export function classifyFailure(detail) {
  const apiMatch = /^Paddle API (\d{3})/.exec(detail);
  if (apiMatch) {
    return { kind: "api_error", httpStatus: Number(apiMatch[1]) };
  }
  if (/none are active/i.test(detail)) {
    return { kind: "inactive" };
  }
  return { kind: "missing" };
}

function safeReadLog(logPath) {
  if (!logPath) return null;
  try {
    return readFileSync(logPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Parse verifier output into structured rows. Only recognised lines are
 * kept — everything else (banners, stray fetch errors, raw response
 * bodies) is discarded so it can never reach a PR comment.
 */
export function parseVerifierLog(logText) {
  const rows = [];
  let summary = null;
  let keyUnsetMentioned = false;
  if (typeof logText !== "string") {
    return { rows, summary, keyUnsetMentioned };
  }
  for (const rawLine of logText.split(/\r?\n/)) {
    if (KEY_UNSET_RE.test(rawLine)) keyUnsetMentioned = true;
    const m = LINE_RE.exec(rawLine);
    if (m) {
      const [, glyph, env, externalId, detail] = m;
      const status = glyph === "✓" ? "pass" : glyph === "✗" ? "fail" : "skip";
      const row = { env, externalId, status };
      if (status === "fail") row.cause = classifyFailure(detail);
      rows.push(row);
      continue;
    }
    const s = SUMMARY_RE.exec(rawLine);
    if (s) {
      summary = { pass: Number(s[1]), fail: Number(s[2]), skip: Number(s[3]) };
    }
  }
  return { rows, summary, keyUnsetMentioned };
}

/**
 * Convert the verifier's JSON report (see verify-paddle-craft-catalog.ts
 * `finalize()`) into the same `parsed` shape parseVerifierLog produces.
 * This is the preferred input path — it avoids re-parsing the human log
 * entirely, so glyph encoding, log truncation, or stray banner lines
 * can't drift the renderer's view of what the verifier saw.
 *
 * The report is treated as untrusted input: unknown status values,
 * unknown cause kinds, missing summary fields, and non-string ids are
 * all rejected so a malformed file can't smuggle unclassified failures
 * past the remedy switch.
 */
export function parseVerifierReport(report) {
  const parsed = { rows: [], summary: null, keyUnsetMentioned: false };
  if (!report || typeof report !== "object") return parsed;
  const rawRows = Array.isArray(report.rows) ? report.rows : [];
  const KNOWN_CAUSE_KINDS = new Set([
    "api_error",
    "inactive",
    "missing",
    "coverage_gap",
    "enumeration_error",
  ]);
  for (const raw of rawRows) {
    if (!raw || typeof raw !== "object") continue;
    const { env, externalId, status, cause } = raw;
    if (env !== "sandbox" && env !== "live") continue;
    if (typeof externalId !== "string" || externalId.length === 0) continue;
    if (status !== "pass" && status !== "fail" && status !== "skip") continue;
    const row = { env, externalId, status };
    if (status === "fail") {
      if (
        cause &&
        typeof cause === "object" &&
        typeof cause.kind === "string" &&
        KNOWN_CAUSE_KINDS.has(cause.kind)
      ) {
        const normalized = { kind: cause.kind };
        if (cause.kind === "api_error" && Number.isFinite(cause.httpStatus)) {
          normalized.httpStatus = Number(cause.httpStatus);
        }
        row.cause = normalized;
      } else {
        row.cause = { kind: "missing" };
      }
    }
    parsed.rows.push(row);
  }
  const s = report.summary;
  if (s && typeof s === "object") {
    const pass = Number(s.pass);
    const fail = Number(s.fail);
    const skip = Number(s.skip);
    if ([pass, fail, skip].every((n) => Number.isFinite(n))) {
      parsed.summary = { pass, fail, skip };
    }
  }
  parsed.keyUnsetMentioned = Boolean(report.keyUnset);
  return parsed;
}

function safeReadReport(reportPath) {
  if (!reportPath) return null;
  try {
    return JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Decide the overall verdict.
 *
 * Exit code is authoritative. The narrow "unconfigured warning" branch
 * requires ALL of:
 *   - rc === 2
 *   - the log mentions `_API_KEY is not set`
 *   - the verifier reports zero failures in its SUMMARY line
 *   - the run was triggered by a pull_request
 *
 * Any other combination is treated as unverified/failed. In particular,
 * a run with the sandbox key set that records a real ✗ on sandbox and
 * then exits 2 on the missing live key is NOT eligible for the warning
 * — the SUMMARY fail count > 0 blocks it.
 */
export function decideVerdict({ rc, parsed, eventName }) {
  const summary = parsed.summary;
  const rows = parsed.rows;

  if (rc === 0) {
    // Guard against the parser seeing zero rows: a genuinely passing run
    // must have produced at least one recognised line. If not, treat as
    // unverified.
    if (rows.length === 0) {
      return { level: "fail", kind: "no_output", shouldFail: true };
    }
    return { level: "pass", kind: "verified", shouldFail: false };
  }

  if (rc === 2) {
    const failsInSummary = summary?.fail ?? Number.POSITIVE_INFINITY;
    const isPr = eventName === "pull_request";
    if (parsed.keyUnsetMentioned && failsInSummary === 0 && isPr) {
      return { level: "warn", kind: "unconfigured", shouldFail: false };
    }
    // Non-PR runs (schedule / workflow_dispatch) have no PR comment to
    // carry the warning, so they must fail loudly. Same for any rc=2
    // that also has real ✗ rows.
    return {
      level: "fail",
      kind: parsed.keyUnsetMentioned ? "unconfigured_non_pr_or_with_failures" : "misconfigured",
      shouldFail: true,
    };
  }

  // rc === 1 or anything else: verifier reported failures, or crashed.
  return { level: "fail", kind: "catalog_or_crash", shouldFail: true };
}

function remedyForFailRow(row) {
  const cause = row.cause ?? { kind: "missing" };
  if (cause.kind === "api_error") {
    return `Paddle API error (HTTP ${cause.httpStatus}) — check credentials / Paddle status.`;
  }
  if (cause.kind === "inactive") {
    return "Price exists but is not active — un-archive or re-create as active.";
  }
  if (cause.kind === "coverage_gap") {
    // The inverse of "missing": the price EXISTS and is active, but the app
    // does not know it is sellable. Telling an operator to create a price they
    // are looking at sends them the wrong way entirely.
    return (
      "Active in Paddle but not sellable by the app — add this external_id to " +
      "`PAID_PLAN_IDS` in src/lib/paidPlanAllowlist.ts (and to `CREDIT_PACK_IDS` if it is a pack)."
    );
  }
  if (cause.kind === "enumeration_error") {
    return "Could not enumerate the catalog — check credentials / Paddle status, then re-run.";
  }
  return "Missing from catalog — create the price via `create_price` with this external_id.";
}

/**
 * Build the sticky-comment markdown. Only parsed fields flow in — never
 * the raw log, never the fail-detail text (which can embed request
 * context up to 200 chars in the API-error path).
 */
export function renderComment({ verdict, parsed, runUrl, artifactHint }) {
  const lines = [];
  lines.push(COMMENT_MARKER);
  lines.push("### Paddle Craft catalog preflight");
  lines.push("");

  if (verdict.level === "pass") {
    lines.push("✅ **Verified** — all required Craft price ids are active in sandbox and live.");
  } else if (verdict.level === "warn") {
    lines.push(
      "⚠️ **Not verified — API keys unset.** Configure `PADDLE_SANDBOX_API_KEY` and `PADDLE_LIVE_API_KEY` (read scope) to enable this gate. Not blocking this PR.",
    );
  } else {
    lines.push("❌ **Catalog check failed.** See table below.");
  }

  lines.push("");
  lines.push("| env | external_id | status | remedy |");
  lines.push("| --- | --- | --- | --- |");

  // Deterministic ordering: sandbox before live, then external_id asc.
  const sorted = [...parsed.rows].sort((a, b) => {
    if (a.env !== b.env) return a.env === "sandbox" ? -1 : 1;
    return a.externalId.localeCompare(b.externalId);
  });

  if (sorted.length === 0) {
    lines.push("| — | — | not verified | verifier produced no recognised output |");
  } else {
    for (const row of sorted) {
      if (row.status === "pass") {
        lines.push(`| ${row.env} | \`${row.externalId}\` | ✅ pass | — |`);
      } else if (row.status === "skip") {
        lines.push(
          `| ${row.env} | \`${row.externalId}\` | ⚠️ not verified — API key unset | configure the secret |`,
        );
      } else {
        lines.push(`| ${row.env} | \`${row.externalId}\` | ❌ fail | ${remedyForFailRow(row)} |`);
      }
    }
  }

  lines.push("");
  if (parsed.summary) {
    const s = parsed.summary;
    lines.push(`_pass=${s.pass} · fail=${s.fail} · skip=${s.skip}_`);
  } else {
    lines.push("_no SUMMARY line — verifier did not complete cleanly._");
  }
  if (runUrl) {
    lines.push("");
    lines.push(
      `[Full log in the workflow run](${runUrl})${artifactHint ? ` · artifact: \`${artifactHint}\`` : ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = { log: null, report: null, rc: null, event: null, out: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--log") out.log = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--rc") out.rc = Number(argv[++i]);
    else if (a === "--event") out.event = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--run-url") out.runUrl = argv[++i];
    else if (a === "--artifact") out.artifact = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function isMain() {
  try {
    const invoked = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : "";
    return invoked === import.meta.url;
  } catch {
    return false;
  }
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (args.rc === null || Number.isNaN(args.rc)) {
    console.error("--rc <exit-code> is required");
    process.exit(64);
  }
  // Prefer the JSON report when present — it carries pre-classified rows
  // and can't drift on log encoding. Fall back to log parsing only when
  // the report is missing or unreadable, so this script stays compatible
  // with older CI runs and local ad-hoc invocations.
  let parsed;
  let inputMode;
  const report = safeReadReport(args.report);
  if (report) {
    parsed = parseVerifierReport(report);
    inputMode = "report";
  } else {
    if (args.report) {
      console.error(
        `--report ${args.report} not readable — falling back to --log`,
      );
    }
    const logText = safeReadLog(args.log) ?? "";
    parsed = parseVerifierLog(logText);
    inputMode = "log";
  }
  const verdict = decideVerdict({ rc: args.rc, parsed, eventName: args.event ?? "" });
  const comment = renderComment({
    verdict,
    parsed,
    runUrl: args.runUrl,
    artifactHint: args.artifact,
  });
  if (args.out) writeFileSync(args.out, comment, "utf8");
  if (args.json) {
    process.stdout.write(
      JSON.stringify({
        verdict,
        summary: parsed.summary,
        rowCount: parsed.rows.length,
        inputMode,
      }) + "\n",
    );
  } else {
    process.stdout.write(comment);
  }
}
