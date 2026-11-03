/**
 * One clock for grower-facing time labels.
 *
 * Zone is the saved account zone when that preference exists, and the
 * browser zone until then. Callers pass an explicit zone in tests.
 */

export interface GrowerTimeLabelOptions {
  timeZone?: string;
  day?: "numeric" | "2-digit";
  includeYear?: boolean;
  includeZone?: boolean;
  hour?: "numeric" | "2-digit";
}

export class GrowerTimeLabel {
  static formatAbsolute(
    iso: string | null | undefined,
    options?: GrowerTimeLabelOptions,
  ): string | null {
    if (typeof iso !== "string" || iso.length === 0) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    const day = options?.day ?? "numeric";
    const includeYear = options?.includeYear !== false;
    const includeZone = options?.includeZone !== false;
    const hour = options?.hour ?? "numeric";
    const format: Intl.DateTimeFormatOptions = {
      month: "short",
      day,
      hour,
      minute: "2-digit",
      ...(includeYear ? { year: "numeric" as const } : {}),
      ...(includeZone ? { timeZoneName: "short" as const } : {}),
      ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
    };
    try {
      return new Intl.DateTimeFormat("en-US", format).format(new Date(ms));
    } catch {
      const { timeZone: _ignored, ...withoutZone } = format;
      return new Intl.DateTimeFormat("en-US", withoutZone).format(new Date(ms));
    }
  }

  static zoneAbbreviation(date: Date, timeZone?: string): string {
    try {
      const short = new Intl.DateTimeFormat("en-US", {
        timeZoneName: "short",
        ...(timeZone ? { timeZone } : {}),
      })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value;
      if (short && short.trim()) return short.trim();
    } catch {
      /* An unknown zone name falls through to a fixed label. */
    }
    return "local";
  }
}
