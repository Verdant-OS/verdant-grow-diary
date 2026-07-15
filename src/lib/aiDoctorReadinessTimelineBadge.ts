/**
 * aiDoctorReadinessTimelineBadge — pure presenter helper for the diary
 * timeline badge on AI Doctor readiness-check entries.
 *
 * Display-only. No I/O, no Supabase, no RPC, no model calls, no Action
 * Queue, no alerts, no writes. Safe against malformed `details` blobs.
 *
 * Honesty contract:
 *  - Derives EVERYTHING from the STORED details written at check time
 *    (`snapshot_freshness`, `snapshot_age_minutes`, `snapshot_at`).
 *    It never re-grades a historical check against the current clock —
 *    a check logged as "fresh" three days ago stays labeled as fresh
 *    AT CHECK TIME, and the copy says so ("at check").
 *  - Unknown/malformed freshness values render as the neutral
 *    no-snapshot state; nothing is ever invented.
 */
import { AI_DOCTOR_READINESS_CHECK_KIND } from "@/lib/aiDoctorReadinessDiaryEntryRules";

export type AiDoctorReadinessBadgeVariant = "positive" | "warning" | "neutral";

export interface AiDoctorReadinessTimelineBadgeViewModel {
  /** Freshness recorded at check time. Malformed values collapse to "missing". */
  freshness: "fresh" | "stale" | "missing";
  variant: AiDoctorReadinessBadgeVariant;
  /** Short pill text, e.g. "Snapshot fresh · 3h old at check". */
  label: string;
  /** Screen-reader / tooltip sentence. */
  ariaLabel: string;
  /** ISO of the snapshot graded at check time, or null. */
  snapshotAtIso: string | null;
}

/**
 * Loose event shape — usable from raw rows, normalized entries, and
 * view-model items alike (same posture as aiDoctorCheckInEventBadge).
 */
export interface AiDoctorReadinessEventLike {
  details?: unknown;
}

function readDetails(event: AiDoctorReadinessEventLike | null | undefined): Record<string, unknown> | null {
  if (!event || typeof event !== "object") return null;
  const details = (event as { details?: unknown }).details;
  if (details == null || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

export function isAiDoctorReadinessCheckEvent(
  event: AiDoctorReadinessEventLike | null | undefined,
): boolean {
  const details = readDetails(event);
  return !!details && details.kind === AI_DOCTOR_READINESS_CHECK_KIND;
}

/**
 * Format a stored age-in-minutes into the same buckets the freshness
 * status lib uses ("Xm" / "Xh" / "Xd"), suffixed with "old at check" so
 * the age is never mistaken for age-as-of-now.
 */
function formatAgeAtCheck(ageMinutes: number): string {
  if (ageMinutes < 1) return "under 1m old at check";
  if (ageMinutes < 60) return `${Math.floor(ageMinutes)}m old at check`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 48) return `${hours}h old at check`;
  const days = Math.floor(hours / 24);
  return `${days}d old at check`;
}

export function buildAiDoctorReadinessTimelineBadge(
  event: AiDoctorReadinessEventLike | null | undefined,
): AiDoctorReadinessTimelineBadgeViewModel | null {
  const details = readDetails(event);
  if (!details || details.kind !== AI_DOCTOR_READINESS_CHECK_KIND) return null;

  const rawFreshness = details.snapshot_freshness;
  const rawAge = details.snapshot_age_minutes;
  const rawAt = details.snapshot_at;

  const snapshotAtIso =
    typeof rawAt === "string" && Number.isFinite(Date.parse(rawAt)) ? rawAt : null;
  const ageMinutes =
    typeof rawAge === "number" && Number.isFinite(rawAge) && rawAge >= 0
      ? rawAge
      : null;

  if (rawFreshness === "fresh" || rawFreshness === "stale") {
    const ageText = ageMinutes !== null ? formatAgeAtCheck(ageMinutes) : "age unrecorded";
    if (rawFreshness === "fresh") {
      return {
        freshness: "fresh",
        variant: "positive",
        label: `Snapshot fresh · ${ageText}`,
        ariaLabel: `AI Doctor readiness check: manual sensor snapshot was fresh, ${ageText}`,
        snapshotAtIso,
      };
    }
    return {
      freshness: "stale",
      variant: "warning",
      label: `Snapshot stale · ${ageText}`,
      ariaLabel: `AI Doctor readiness check: manual sensor snapshot was stale, ${ageText}`,
      snapshotAtIso,
    };
  }

  // "missing" and any malformed value collapse to the honest neutral state.
  return {
    freshness: "missing",
    variant: "neutral",
    label: "No snapshot at check",
    ariaLabel: "AI Doctor readiness check: no manual sensor snapshot on file at check time",
    snapshotAtIso: null,
  };
}
