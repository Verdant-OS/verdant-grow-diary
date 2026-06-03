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
