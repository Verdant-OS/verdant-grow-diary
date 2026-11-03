/**
 * Optional Quick Log reading time. Empty means now. No future instant,
 * and nothing older than the 7-day lookback. A datetime-local value is
 * read in the supplied zone so a Chicago grower is not shifted by UTC.
 */

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export class QuickLogReadingTime {
  static readonly LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
  static readonly FUTURE_MESSAGE = "Reading time cannot be in the future.";
  static readonly LOOKBACK_MESSAGE = "Reading time must be within the last 7 days.";
  static readonly INVALID_MESSAGE = "Enter a reading time.";

  static resolve(
    value: string | null | undefined,
    nowMs: number,
    timeZone?: string,
  ): { ok: true; iso: string } | { ok: false; message: string } {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return { ok: true, iso: new Date(nowMs).toISOString() };
    const ms = QuickLogReadingTime.parse(trimmed, timeZone);
    if (ms === null) return { ok: false, message: QuickLogReadingTime.INVALID_MESSAGE };
    if (ms > nowMs) return { ok: false, message: QuickLogReadingTime.FUTURE_MESSAGE };
    if (nowMs - ms > QuickLogReadingTime.LOOKBACK_MS) {
      return { ok: false, message: QuickLogReadingTime.LOOKBACK_MESSAGE };
    }
    return { ok: true, iso: new Date(ms).toISOString() };
  }

  static parse(value: string, timeZone?: string): number | null {
    if (!LOCAL_VALUE.test(value)) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (!timeZone) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const match = LOCAL_VALUE.exec(value);
    if (!match) return null;
    const wanted = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    );
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const asUtc = (ms: number): number | null => {
      const bag: Record<string, string> = {};
      for (const part of formatter.formatToParts(new Date(ms))) {
        if (part.type !== "literal") bag[part.type] = part.value;
      }
      if (!bag.year || !bag.month || !bag.day || bag.hour === undefined) return null;
      const hour = bag.hour === "24" ? 0 : Number(bag.hour);
      return Date.UTC(
        Number(bag.year),
        Number(bag.month) - 1,
        Number(bag.day),
        hour,
        Number(bag.minute),
        Number(bag.second),
      );
    };
    let ms = wanted;
    for (let i = 0; i < 3; i += 1) {
      const zoned = asUtc(ms);
      if (zoned === null) return null;
      const next = wanted - (zoned - ms);
      if (next === ms) break;
      ms = next;
    }
    return Number.isFinite(ms) ? ms : null;
  }
}
