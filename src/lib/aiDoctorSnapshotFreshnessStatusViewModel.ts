/**
 * aiDoctorSnapshotFreshnessStatusViewModel — pure helper that produces
 * a short, presenter-free freshness status for the latest manual sensor
 * snapshot on the AI Doctor readiness gate.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no globals.
 *  - Never claims a diagnosis. Only reports snapshot presence + age vs
 *    the shared 48h freshness cutoff.
 *  - Uses `AI_DOCTOR_SNAPSHOT_FRESH_MS` — never hardcodes a different
 *    freshness window.
 */
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

export type AiDoctorSnapshotFreshnessState = "fresh" | "stale" | "missing";

export interface AiDoctorSnapshotFreshnessStatus {
  state: AiDoctorSnapshotFreshnessState;
  /** Latest snapshot ISO or null. */
  snapshotAtIso: string | null;
  /** Age in whole minutes, or null when no snapshot. */
  ageMinutes: number | null;
  /** Short chip/badge label, e.g. "Fresh · 3h ago". */
  label: string;
  /** One-sentence description safe to render as helper text. */
  description: string;
}

export interface BuildAiDoctorSnapshotFreshnessStatusArgs {
  latestSnapshotAtIso: string | null;
  now?: number;
  snapshotFreshMs?: number;
}

function formatAge(ms: number): string {
  const abs = Math.max(ms, 0);
  const mins = Math.floor(abs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildAiDoctorSnapshotFreshnessStatus(
  args: BuildAiDoctorSnapshotFreshnessStatusArgs,
): AiDoctorSnapshotFreshnessStatus {
  const now =
    typeof args.now === "number" && Number.isFinite(args.now)
      ? args.now
      : Date.now();
  const freshMs =
    typeof args.snapshotFreshMs === "number" &&
    Number.isFinite(args.snapshotFreshMs) &&
    args.snapshotFreshMs > 0
      ? args.snapshotFreshMs
      : AI_DOCTOR_SNAPSHOT_FRESH_MS;
  const hoursCutoff = Math.round(freshMs / 3_600_000);

  const iso = args.latestSnapshotAtIso;
  if (!iso) {
    return {
      state: "missing",
      snapshotAtIso: null,
      ageMinutes: null,
      label: "No snapshot",
      description:
        `No manual sensor snapshot on file. Add one to reach the ${hoursCutoff}h freshness window.`,
    };
  }
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return {
      state: "missing",
      snapshotAtIso: iso,
      ageMinutes: null,
      label: "No snapshot",
      description:
        `No manual sensor snapshot on file. Add one to reach the ${hoursCutoff}h freshness window.`,
    };
  }
  const ageMs = now - t;
  const ageMinutes = Math.max(0, Math.floor(ageMs / 60_000));
  const ageText = formatAge(ageMs);
  const isFresh = ageMs <= freshMs;
  if (isFresh) {
    return {
      state: "fresh",
      snapshotAtIso: iso,
      ageMinutes,
      label: `Fresh · ${ageText}`,
      description:
        `Latest manual sensor snapshot is ${ageText} — inside the ${hoursCutoff}h freshness window.`,
    };
  }
  return {
    state: "stale",
    snapshotAtIso: iso,
    ageMinutes,
    label: `Stale · ${ageText}`,
    description:
      `Latest manual sensor snapshot is ${ageText} — older than the ${hoursCutoff}h freshness cutoff.`,
  };
}
