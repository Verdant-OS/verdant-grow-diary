/**
 * One-Tent Loop Live Proof View Model.
 *
 * Pure composer. Takes a `LoopEvidence` snapshot from the presenter and
 * returns a view-ready `LiveProofView` with a stable banner, safety copy,
 * and per-step rows built via `evaluateLoop` from oneTentLoopProofRules.
 *
 * Rules:
 *  - No I/O. No React. No fetch. Deterministic.
 *  - Never re-emits raw payloads, tokens, secret keys, or unknown fields.
 *  - Never labels missing / stale / invalid / unknown / demo-only as healthy.
 */
import {
  evaluateLoop,
  LOOP_STEP_IDS,
  type LoopEvidence,
  type LoopStepRow,
  type LoopStepStatus,
} from "./oneTentLoopProofRules";

export const LIVE_PROOF_BANNER =
  "Read-only proof view. This page checks whether the One-Tent Loop has evidence. It does not create logs, alerts, actions, AI results, or device commands.";

export const LIVE_PROOF_SAFETY_SUMMARY: readonly string[] = [
  "Missing, stale, invalid, unknown, or demo-only data is never shown as healthy.",
  "Manual snapshots are labeled Manual reading, never Live.",
  "Action Queue rows remain approval-required. No device command.",
  "Viewing this page does not create logs, alerts, actions, AI sessions, or device commands.",
];

export interface LiveProofStatusCounts {
  passed: number;
  needs_review: number;
  missing: number;
  blocked: number;
  stale: number;
  invalid: number;
  demo_only: number;
}

export interface LiveProofView {
  title: string;
  banner: string;
  safety_summary: string[];
  steps: LoopStepRow[];
  step_ids: readonly string[];
  counts: LiveProofStatusCounts;
  generated_at: string;
}

function countStatuses(rows: readonly LoopStepRow[]): LiveProofStatusCounts {
  const counts: LiveProofStatusCounts = {
    passed: 0,
    needs_review: 0,
    missing: 0,
    blocked: 0,
    stale: 0,
    invalid: 0,
    demo_only: 0,
  };
  for (const r of rows) counts[r.status as LoopStepStatus] += 1;
  return counts;
}

function normalizeGeneratedAt(now?: string | Date | number): string {
  if (now === undefined || now === null) return "2026-06-09T00:00:00.000Z";
  if (now instanceof Date) {
    return Number.isNaN(now.getTime()) ? "2026-06-09T00:00:00.000Z" : now.toISOString();
  }
  if (typeof now === "number" && Number.isFinite(now)) return new Date(now).toISOString();
  if (typeof now === "string" && now.length > 0) {
    const t = Date.parse(now);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return "2026-06-09T00:00:00.000Z";
}

export function buildOneTentLoopLiveProofView(
  evidence: LoopEvidence,
  now?: string | Date | number,
): LiveProofView {
  const steps = evaluateLoop(evidence);
  return {
    title: "One-Tent Loop — Live Proof",
    banner: LIVE_PROOF_BANNER,
    safety_summary: [...LIVE_PROOF_SAFETY_SUMMARY],
    steps,
    step_ids: LOOP_STEP_IDS,
    counts: countStatuses(steps),
    generated_at: normalizeGeneratedAt(now),
  };
}

/**
 * Build a plain-text proof summary suitable for a copyable text block.
 * Contains only the derived rows — no raw payloads, no tokens.
 */
export function buildOneTentLoopLiveProofTextReport(view: LiveProofView): string {
  const lines: string[] = [];
  lines.push(view.title);
  lines.push(`Generated at: ${view.generated_at}`);
  lines.push("");
  lines.push(view.banner);
  lines.push("");
  for (const s of view.steps) {
    lines.push(`- ${s.label} [${s.status}]`);
    for (const e of s.evidence) lines.push(`    evidence: ${e}`);
    for (const m of s.missing_info) lines.push(`    missing: ${m}`);
    lines.push(`    safety: ${s.safety_note}`);
  }
  lines.push("");
  lines.push("Safety summary:");
  for (const s of view.safety_summary) lines.push(`- ${s}`);
  return lines.join("\n");
}
