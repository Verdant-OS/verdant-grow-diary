import { describe, it, expect } from "vitest";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

describe("formatSnapshotTimestamp", () => {
  it("renders a localized human string with no microseconds or +00:00", () => {
    const out = formatSnapshotTimestamp("2026-05-31T13:44:12.345678+00:00", "en-US");
    expect(out).not.toMatch(/\.\d{3,}/); // no microseconds
    expect(out).not.toMatch(/\+\d{2}:\d{2}/); // no raw offset
    expect(out).not.toMatch(/T\d{2}:\d{2}/); // no raw ISO
    expect(out).toMatch(/2026/);
  });

  it("positively renders human-readable month, day, year, and 12-hour time", () => {
    // Use a fixed UTC instant. We intentionally use a Date built from UTC
    // parts so the formatter's local-timezone rendering produces a stable
    // human shape: "<Mon> <d>, 2026, <h>:<mm> <AM|PM>" regardless of TZ.
    //
    // We assert the calendar date and clock shape, but allow the exact
    // hour to vary by environment timezone. The test environment uses the
    // host TZ; an exact hour assertion would be flaky across CI/local.
    const d = new Date(Date.UTC(2026, 4, 31, 13, 44, 0));
    const out = formatSnapshotTimestamp(d, "en-US");
    // Year is stable across all timezones for this instant.
    expect(out).toContain("2026");
    // Month is May in every timezone offset that exists on Earth for this
    // UTC instant (May 30 18:00 PT through May 31 23:59 UTC+11).
    expect(out).toContain("May");
    // Localized 12-hour clock shape: "h:mm AM" or "h:mm PM" must be present.
    expect(out).toMatch(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/);
    // Comma separator from Intl.DateTimeFormat en-US between date and time.
    expect(out).toMatch(/,\s/);
    // No raw ISO artifacts leaked through.
    expect(out).not.toMatch(/\.\d{3,}/);
    expect(out).not.toMatch(/\+\d{2}:\d{2}/);
    expect(out).not.toMatch(/T\d{2}:\d{2}/);
  });

  it("never returns the raw ISO input verbatim", () => {
    const raw = "2026-05-31T13:44:12.345678+00:00";
    const out = formatSnapshotTimestamp(raw, "en-US");
    expect(out).not.toBe(raw);
  });

  it("is null-safe and never throws", () => {
    expect(formatSnapshotTimestamp(null)).toBe("Unknown time");
    expect(formatSnapshotTimestamp(undefined)).toBe("Unknown time");
    expect(formatSnapshotTimestamp("")).toBe("Unknown time");
    expect(formatSnapshotTimestamp("not-a-date")).toBe("Unknown time");
  });
});
