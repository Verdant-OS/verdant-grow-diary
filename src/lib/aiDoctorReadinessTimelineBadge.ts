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
 *  - `details` is untrusted JSON. The positive/warning variants require
 *    the FULL evidence the builder always writes for them (a parseable
 *    `snapshot_at` AND a finite `snapshot_age_minutes`); any missing or
 *    malformed field collapses to the neutral no-snapshot state, so
 *    corrupted rows can never present unknown telemetry as fresh.
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

  // Fresh/stale claims must carry the full evidence the builder writes
  // for them: a parseable timestamp AND a recorded age. A bare
  // `snapshot_freshness: "fresh"` in corrupted details is not enough to
  // render a positive state.
  if (
    (rawFreshness === "fresh" || rawFreshness === "stale") &&
    snapshotAtIso !== null &&
    ageMinutes !== null
  ) {
    const ageText = formatAgeAtCheck(ageMinutes);
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

  // "missing", malformed freshness values, and fresh/stale claims with
  // incomplete evidence all collapse to the honest neutral state.
  return {
    freshness: "missing",
    variant: "neutral",
    label: "No snapshot at check",
    ariaLabel: "AI Doctor readiness check: no manual sensor snapshot on file at check time",
    snapshotAtIso: null,
  };
}
