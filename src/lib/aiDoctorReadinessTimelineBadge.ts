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
 *    the FULL, SELF-CONSISTENT evidence the builder always writes for
 *    them: a parseable `snapshot_at`, a finite `snapshot_age_minutes`,
 *    a parseable `checked_at`, an age that agrees with
 *    `checked_at - snapshot_at`, and a grade that agrees with that age
 *    under the shared 48h window. Any missing, malformed, or mutually
 *    contradictory field collapses to the neutral no-snapshot state, so
 *    corrupted rows can never present unknown telemetry as fresh.
 *    (Consistency is judged against CHECK time — never the current
 *    clock — so old-but-coherent entries keep their historical grade.)
 */
import { AI_DOCTOR_READINESS_CHECK_KIND } from "@/lib/aiDoctorReadinessDiaryEntryRules";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

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
  const rawCheckedAt = details.checked_at;

  const snapshotAtIso =
    typeof rawAt === "string" && Number.isFinite(Date.parse(rawAt)) ? rawAt : null;
  const ageMinutes =
    typeof rawAge === "number" && Number.isFinite(rawAge) && rawAge >= 0
      ? rawAge
      : null;
  const checkedAtMs =
    typeof rawCheckedAt === "string" && Number.isFinite(Date.parse(rawCheckedAt))
      ? Date.parse(rawCheckedAt)
      : null;

  // Fresh/stale claims must carry the full evidence the builder writes
  // for them AND that evidence must agree with itself at CHECK time:
  // the recorded age must match `checked_at - snapshot_at` (builder
  // floors to whole minutes; allow 1 minute of slack), and the recorded
  // grade must match that age under the shared 48h window. A row saying
  // "fresh" over a years-old timestamp with `snapshot_age_minutes: 5`
  // is corrupted, not fresh.
  const evidenceIsCoherent = (() => {
    if (snapshotAtIso === null || ageMinutes === null || checkedAtMs === null) {
      return false;
    }
    const ageAtCheckMs = checkedAtMs - Date.parse(snapshotAtIso);
    if (ageAtCheckMs < 0) return false;
    if (Math.abs(Math.floor(ageAtCheckMs / 60_000) - ageMinutes) > 1) return false;
    const gradeAtCheck = ageAtCheckMs <= AI_DOCTOR_SNAPSHOT_FRESH_MS ? "fresh" : "stale";
    return gradeAtCheck === rawFreshness;
  })();

  if ((rawFreshness === "fresh" || rawFreshness === "stale") && evidenceIsCoherent) {
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
