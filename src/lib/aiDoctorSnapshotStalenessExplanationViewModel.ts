/**
 * aiDoctorSnapshotStalenessExplanationViewModel — pure helper that
 * explains, in one deterministic sentence, when the grower's most
 * recent manual sensor snapshot fell outside the 48h freshness cutoff.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no globals.
 *  - Never claims a diagnosis. Only reports snapshot age vs. the cutoff.
 *  - Uses the shared `AI_DOCTOR_SNAPSHOT_FRESH_MS` threshold — never
 *    hardcodes a different freshness window.
 */
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

export interface AiDoctorSnapshotStalenessExplanation {
  /** True when a snapshot exists AND is older than the freshness cutoff. */
  isStale: boolean;
  /** ISO timestamp of the latest manual snapshot, or null. */
  snapshotAtIso: string | null;
  /**
   * ISO timestamp of the exact freshness cutoff (now - 48h). Any snapshot
   * logged strictly before this instant is considered stale.
   */
  cutoffAtIso: string;
  /**
   * Human-readable sentence naming the 48h cutoff, the snapshot time,
   * and the exact cutoff time — empty string when not stale.
   */
  sentence: string;
}

export interface BuildAiDoctorSnapshotStalenessExplanationArgs {
  /** ISO string of the latest manual snapshot; null when none logged. */
  latestSnapshotAtIso: string | null;
  /** "Now" epoch ms — injectable for deterministic tests. */
  now?: number;
  /** Override the freshness window (ms). Defaults to the shared 48h. */
  snapshotFreshMs?: number;
  /**
   * Formatter for the two timestamps. Defaults to ISO strings so tests
   * stay deterministic; UI passes a locale-aware formatter.
   */
  formatDateTime?: (iso: string) => string;
}

const DEFAULT_FORMAT = (iso: string) => iso;

export function buildAiDoctorSnapshotStalenessExplanation(
  args: BuildAiDoctorSnapshotStalenessExplanationArgs,
): AiDoctorSnapshotStalenessExplanation {
  // JS `Date` is defined on ±8.64e15 ms from epoch. Values outside that
  // range make `new Date(x).toISOString()` throw "RangeError: Invalid
  // time value". Treat out-of-range `now` the same as non-finite: fall
  // back to the wall clock so the helper NEVER throws.
  const MAX_SAFE_DATE_MS = 8_640_000_000_000_000;
  const nowCandidate = args.now;
  const now =
    typeof nowCandidate === "number" &&
    Number.isFinite(nowCandidate) &&
    Math.abs(nowCandidate) <= MAX_SAFE_DATE_MS - AI_DOCTOR_SNAPSHOT_FRESH_MS
      ? nowCandidate
      : Date.now();
  const freshMs =
    typeof args.snapshotFreshMs === "number" &&
    Number.isFinite(args.snapshotFreshMs) &&
    args.snapshotFreshMs > 0
      ? args.snapshotFreshMs
      : AI_DOCTOR_SNAPSHOT_FRESH_MS;
  const format = args.formatDateTime ?? DEFAULT_FORMAT;

  const cutoffAtIso = new Date(now - freshMs).toISOString();

  const snapIso = args.latestSnapshotAtIso;
  if (!snapIso) {
    return { isStale: false, snapshotAtIso: null, cutoffAtIso, sentence: "" };
  }
  const snapMs = Date.parse(snapIso);
  if (!Number.isFinite(snapMs)) {
    return { isStale: false, snapshotAtIso: snapIso, cutoffAtIso, sentence: "" };
  }
  const isStale = now - snapMs > freshMs;
  if (!isStale) {
    return { isStale: false, snapshotAtIso: snapIso, cutoffAtIso, sentence: "" };
  }

  const hours = Math.round(freshMs / 3_600_000);
  const sentence =
    `Your most recent manual sensor snapshot (${format(snapIso)}) is older ` +
    `than the ${hours}h freshness cutoff (${format(cutoffAtIso)}). ` +
    `Add a fresh sensor snapshot to unblock a cautious AI Doctor review.`;

  return { isStale: true, snapshotAtIso: snapIso, cutoffAtIso, sentence };
}
