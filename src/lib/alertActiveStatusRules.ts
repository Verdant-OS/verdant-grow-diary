/**
 * The alert statuses that still need the grower's attention.
 *
 * `acknowledged` is active: acknowledging records that the grower has seen the
 * alert, not that the condition is fixed. `resolved` and `dismissed` are
 * terminal. Environment-alert persistence and the Plant Detail assigned-tent
 * panel read this list; naming the statuses independently once made the
 * acknowledged path unreachable and once let persistence insert a duplicate
 * beside an acknowledged alert. Other readers still name the statuses inline
 * (growWalkContextReadModels.ts, growWalkTargetReadModels.ts,
 * growWalkEvidenceRules.ts) and are not covered here.
 *
 * Pure. No I/O.
 */
import type { AlertStatusRow } from "@/lib/alerts";

export const ACTIVE_ALERT_STATUSES: readonly AlertStatusRow[] = ["open", "acknowledged"];
