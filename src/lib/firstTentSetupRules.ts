/**
 * firstTentSetupRules — pure helpers for the "create a tent before adding
 * sensor data" gate.
 *
 * Active tent = visible to the current user (RLS-scoped at the data layer)
 * AND not archived. Grow link is intentionally not required because legacy
 * tents may have a null grow_id.
 *
 * No React, no Supabase, no I/O. Pure functions only.
 */

export type FirstTentSetupSurface =
  | "sensor_pairing"
  | "manual_sensor"
  | "quicklog_snapshot";

export interface FirstTentSetupCopy {
  title: string;
  body: string;
  cta: string;
}

interface TentLike {
  id?: string | null;
  is_archived?: boolean | null;
}

/** True when at least one non-archived tent exists. */
export function hasActiveTent(tents: readonly TentLike[] | null | undefined): boolean {
  if (!Array.isArray(tents)) return false;
  for (const t of tents) {
    if (!t || typeof t !== "object") continue;
    if (typeof t.id !== "string" || t.id.length === 0) continue;
    if (t.is_archived === true) continue;
    return true;
  }
  return false;
}

/** True when the user must create a tent before continuing on a sensor surface. */
export function shouldRequireFirstTentSetup(
  tents: readonly TentLike[] | null | undefined,
): boolean {
  return !hasActiveTent(tents);
}

const BASE_COPY: Omit<FirstTentSetupCopy, "title" | "body" | "cta"> = {};

/**
 * Surface-aware copy. The title/body/CTA are stable across surfaces today;
 * the surface argument lets us tune microcopy later without changing
 * call-sites.
 */
export function buildFirstTentSetupCopy(
  surface: FirstTentSetupSurface,
): FirstTentSetupCopy {
  void BASE_COPY;
  void surface;
  return {
    title: "Create a tent before adding sensor data",
    body:
      "Sensor readings need a grow-space anchor so Verdant can attach them to the right timeline, alerts, and AI Doctor context.",
    cta: "Create first tent",
  };
}
