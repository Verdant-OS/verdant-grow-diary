/**
 * oneTentLoopHandoffIds — pick already-loaded One-Tent Loop ids for
 * existing next-step cards. Never invents a default among many.
 *
 * Pure module. No I/O, no React, no remote calls.
 */

import type { OneTentLoopIds } from "@/lib/oneTentLoopNavigationRules";

function trimmedId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length > 0 ? id : null;
}

/**
 * Return the id only when the list resolves to exactly one unique
 * non-empty value. Zero, many, or blank inputs stay `null`.
 */
export function pickSoleLoadedId(
  ids: ReadonlyArray<string | null | undefined>,
): string | null {
  const unique = new Set<string>();
  for (const raw of ids) {
    const id = trimmedId(raw);
    if (id) unique.add(id);
  }
  if (unique.size !== 1) return null;
  const [sole] = unique;
  return sole ?? null;
}

/**
 * First non-empty id in caller-defined priority order.
 * Use only when a row is already selected (URL focus, drawer, highlight).
 * Do not use this to pick a default tent or plant among many.
 */
export function pickFirstLoadedId(
  ids: ReadonlyArray<string | null | undefined>,
): string | null {
  for (const raw of ids) {
    const id = trimmedId(raw);
    if (id) return id;
  }
  return null;
}

export type OneTentLoopHandoffIdSource = {
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
  alert_id?: string | null;
};

/**
 * Handoff ids from already-visible AI Doctor session rows.
 * Each field is passed only when every visible row agrees on one value.
 * Sessions have no alert column today, so `alertId` stays null unless a
 * future row actually carries `alert_id`.
 */
export function pickAiDoctorSessionLoopHandoffIds(
  rows: ReadonlyArray<OneTentLoopHandoffIdSource>,
): OneTentLoopIds {
  return {
    plantId: pickSoleLoadedId(rows.map((row) => row.plant_id)),
    tentId: pickSoleLoadedId(rows.map((row) => row.tent_id)),
    growId: pickSoleLoadedId(rows.map((row) => row.grow_id)),
    alertId: pickSoleLoadedId(rows.map((row) => row.alert_id)),
  };
}
