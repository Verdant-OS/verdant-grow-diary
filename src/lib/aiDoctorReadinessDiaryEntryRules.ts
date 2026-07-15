/**
 * aiDoctorReadinessDiaryEntryRules — pure builder that turns an evaluated
 * AI Doctor readiness snapshot into a deterministic `diary_entries`
 * insert draft (no user_id, no ids other than the ones passed in).
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - Never claims a diagnosis. Only reports readiness state + snapshot age.
 *  - Never invents sensor readings; snapshot info is presence + age only.
 *  - Never returns a draft when required identity fields are missing.
 */
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import {
  buildAiDoctorSnapshotFreshnessStatus,
  type AiDoctorSnapshotFreshnessState,
} from "@/lib/aiDoctorSnapshotFreshnessStatusViewModel";

export interface AiDoctorReadinessDiaryDraft {
  grow_id: string;
  plant_id: string | null;
  tent_id: string | null;
  note: string;
  details: {
    kind: "ai_doctor_readiness_check";
    readiness: AiDoctorContextReadiness;
    allowed: boolean;
    snapshot_freshness: AiDoctorSnapshotFreshnessState;
    snapshot_at: string | null;
    snapshot_age_minutes: number | null;
    blocking_codes: readonly string[];
    checked_at: string;
  };
}

export type AiDoctorReadinessDiaryBuildResult =
  | { ok: true; draft: AiDoctorReadinessDiaryDraft }
  | { ok: false; reason: string };

export interface BuildAiDoctorReadinessDiaryEntryArgs {
  readiness: AiDoctorContextReadiness;
  latestSnapshotAtIso: string | null;
  blockingCodes?: readonly string[];
  growId: string | null | undefined;
  plantId?: string | null;
  tentId?: string | null;
  now?: number;
}

function readinessNote(
  readiness: AiDoctorContextReadiness,
  freshnessLabel: string,
): string {
  switch (readiness) {
    case "strong":
      return `AI Doctor readiness: allowed (strong context). Snapshot: ${freshnessLabel}.`;
    case "partial":
      return `AI Doctor readiness: allowed with limited confidence. Snapshot: ${freshnessLabel}.`;
    case "insufficient":
      return `AI Doctor readiness: blocked (insufficient context). Snapshot: ${freshnessLabel}.`;
  }
}

export function buildAiDoctorReadinessDiaryEntry(
  args: BuildAiDoctorReadinessDiaryEntryArgs,
): AiDoctorReadinessDiaryBuildResult {
  const growId = typeof args.growId === "string" ? args.growId.trim() : "";
  if (growId.length === 0) {
    return { ok: false, reason: "missing_grow_id" };
  }
  const nowMs =
    typeof args.now === "number" && Number.isFinite(args.now)
      ? args.now
      : Date.now();
  const freshness = buildAiDoctorSnapshotFreshnessStatus({
    latestSnapshotAtIso: args.latestSnapshotAtIso,
    now: nowMs,
  });
  const allowed = args.readiness !== "insufficient";
  const note = readinessNote(args.readiness, freshness.label);
  const blocking = Array.from(args.blockingCodes ?? []);

  return {
    ok: true,
    draft: {
      grow_id: growId,
      plant_id:
        typeof args.plantId === "string" && args.plantId.trim().length > 0
          ? args.plantId
          : null,
      tent_id:
        typeof args.tentId === "string" && args.tentId.trim().length > 0
          ? args.tentId
          : null,
      note,
      details: {
        kind: "ai_doctor_readiness_check",
        readiness: args.readiness,
        allowed,
        snapshot_freshness: freshness.state,
        snapshot_at: freshness.snapshotAtIso,
        snapshot_age_minutes: freshness.ageMinutes,
        blocking_codes: blocking,
        checked_at: new Date(nowMs).toISOString(),
      },
    },
  };
}
