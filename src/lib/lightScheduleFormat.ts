/**
 * Pure formatter for tent light-schedule strings.
 *
 * Replaces ambiguous "On · 12/12" copy with a labeled, human-readable
 * form like "12/12 (light/dark)". Null-safe.
 *
 * Presenter-only. No I/O. No React.
 */

export interface LightScheduleParts {
  onHours: number;
  offHours: number;
}

/**
 * Parse "12/12", "18/6", "20/4", "24/0" style strings. Returns null
 * when the input is missing or malformed (never invents values).
 */
export function parseLightSchedule(
  schedule: string | null | undefined,
): LightScheduleParts | null {
  if (!schedule || typeof schedule !== "string") return null;
  const m = schedule.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!m) return null;
  const on = Number(m[1]);
  const off = Number(m[2]);
  if (!Number.isFinite(on) || !Number.isFinite(off)) return null;
  if (on < 0 || on > 24 || off < 0 || off > 24) return null;
  if (on + off !== 24) return null;
  return { onHours: on, offHours: off };
}

/**
 * Format a schedule string as "<on>/<off> (light/dark)". Returns
 * "Schedule unknown" for missing/malformed input — never a raw value.
 */
export function formatLightSchedule(
  schedule: string | null | undefined,
): string {
  const parts = parseLightSchedule(schedule);
  if (!parts) return "Schedule unknown";
  return `${parts.onHours}/${parts.offHours} (light/dark)`;
}

/**
 * Format the full "On" / "Off" line that tent cards render. When the
 * light is on, the schedule is appended in human-readable form.
 */
export function formatTentLightStatus(args: {
  on: boolean;
  schedule: string | null | undefined;
}): string {
  if (!args.on) return "Off";
  const parts = parseLightSchedule(args.schedule);
  if (!parts) return "On";
  return `On · ${parts.onHours}/${parts.offHours} (light/dark)`;
}
