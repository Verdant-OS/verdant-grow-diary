/**
 * sensorSourceUrlRules — pure helpers that read & encode sensor source
 * URL query params shared between the Sensors page and the Timeline
 * page so source-summary clicks and the Sensors inline legend stay in
 * sync without introducing app-wide global state.
 *
 * Allowed source kinds (canonical):
 *   live | manual | csv | demo | stale | invalid
 *
 * Conventions:
 *   ?sensorSources=live,csv         -> multi-select OR
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  -> half-open date window [from, to)
 *   ?plantId=<id>                   -> optional plant scope (read by
 *                                       callers that support it)
 *
 * Rules:
 *  - Pure: no I/O, no React, no globals, no time.
 *  - Null-safe. Deterministic. Order-preserving for valid tokens.
 *  - Unknown / duplicate tokens are dropped silently rather than
 *    crashing — invalid query params must never break the page.
 */

import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import { SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";

const ALLOWED = new Set<TimelineSensorSourceKind>(SENSOR_SOURCE_KINDS);

export const SENSOR_SOURCES_PARAM = "sensorSources";
export const SENSOR_RANGE_FROM_PARAM = "from";
export const SENSOR_RANGE_TO_PARAM = "to";
export const SENSOR_PLANT_PARAM = "plantId";

/** Parse the `sensorSources` query param value into canonical kinds. */
export function parseSensorSourcesParam(
  raw: string | null | undefined,
): TimelineSensorSourceKind[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const out: TimelineSensorSourceKind[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    if (ALLOWED.has(v as TimelineSensorSourceKind)) {
      seen.add(v);
      out.push(v as TimelineSensorSourceKind);
    }
  }
  return out;
}

/** Encode a list of canonical kinds back into a stable query value. */
export function encodeSensorSourcesParam(
  kinds: ReadonlyArray<TimelineSensorSourceKind> | null | undefined,
): string {
  if (!Array.isArray(kinds) || kinds.length === 0) return "";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of kinds) {
    if (!k || seen.has(k)) continue;
    if (!ALLOWED.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.join(",");
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a plain YYYY-MM-DD date string, returning null otherwise. */
export function parseDateRangeParam(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!ISO_DATE_RE.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return v;
}

export interface BuildTimelineFilterUrlInput {
  sources?: ReadonlyArray<TimelineSensorSourceKind> | null;
  from?: string | null;
  to?: string | null;
  plantId?: string | null;
  growId?: string | null;
  /** Override base path; defaults to "/timeline". */
  base?: string;
}

/**
 * Build a Timeline URL with the supplied source/date/plant filters.
 * Empty/invalid inputs are dropped. Output is deterministic and safe
 * for `react-router` `<Link to=...>`.
 */
export function buildTimelineFilterUrl(input: BuildTimelineFilterUrlInput): string {
  const base = (input.base && input.base.trim()) || "/timeline";
  const params = new URLSearchParams();
  const sources = encodeSensorSourcesParam(input.sources ?? []);
  if (sources) params.set(SENSOR_SOURCES_PARAM, sources);
  const from = parseDateRangeParam(input.from ?? null);
  if (from) params.set(SENSOR_RANGE_FROM_PARAM, from);
  const to = parseDateRangeParam(input.to ?? null);
  if (to) params.set(SENSOR_RANGE_TO_PARAM, to);
  if (typeof input.plantId === "string" && input.plantId.trim()) {
    params.set(SENSOR_PLANT_PARAM, input.plantId.trim());
  }
  if (typeof input.growId === "string" && input.growId.trim()) {
    params.set("growId", input.growId.trim());
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Return `true` if the two source-kind arrays contain the same set of
 * canonical kinds (order-insensitive). Used by Timeline to avoid
 * redundant `setSearchParams` round-trips when state already matches
 * the URL.
 */
export function sensorSourcesEqual(
  a: ReadonlyArray<TimelineSensorSourceKind> | null | undefined,
  b: ReadonlyArray<TimelineSensorSourceKind> | null | undefined,
): boolean {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  const sa = new Set(aa);
  for (const v of bb) if (!sa.has(v)) return false;
  return true;
}
