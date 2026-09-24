/**
 * plantLastActivityRules — the "Last activity" line on Plant Detail.
 *
 * QA 2026-09-24 (BUG-005): the line read "Updated 3 months ago" for a plant
 * created and logged today, because it formatted the plant's start date.
 * It now describes the newest diary entry for the plant, and says so
 * honestly when that read is loading, failed, or empty.
 *
 * Pure: `now` is injected.
 */
import { formatDistance } from "date-fns";

export interface PlantLastActivityInput {
  status: "loading" | "error" | "ready";
  rows: ReadonlyArray<{ entry_at?: string | null; created_at?: string | null }> | null | undefined;
  now: Date;
}

export const PLANT_LAST_ACTIVITY_LOADING = "Checking recent activity…";
export const PLANT_LAST_ACTIVITY_UNAVAILABLE = "Recent activity unavailable.";
export const PLANT_LAST_ACTIVITY_NONE = "No activity logged yet.";

function entryTime(row: { entry_at?: string | null; created_at?: string | null }): number | null {
  for (const value of [row.entry_at, row.created_at]) {
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

export function resolvePlantLastActivityLabel(input: PlantLastActivityInput): string {
  if (input.status === "loading") return PLANT_LAST_ACTIVITY_LOADING;
  if (input.status === "error" || !Array.isArray(input.rows))
    return PLANT_LAST_ACTIVITY_UNAVAILABLE;
  let latest: number | null = null;
  for (const row of input.rows) {
    const ms = entryTime(row);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  if (latest === null) return PLANT_LAST_ACTIVITY_NONE;
  const nowMs = input.now.getTime();
  // A clock-skewed future entry is still the latest activity, never "in 2 minutes".
  const at = new Date(Math.min(latest, nowMs));
  return `Updated ${formatDistance(at, input.now, { addSuffix: true })}`;
}
