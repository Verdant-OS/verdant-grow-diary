import { describe, it, expect } from "vitest";
import {
  buildStaleSnapshotHelperCopy,
  STALE_HELPER_PREFIX,
  STALE_HELPER_SUFFIX,
} from "@/lib/quickLogStaleSnapshotHelperCopy";

describe("buildStaleSnapshotHelperCopy", () => {
  it("includes formatted captured timestamp when ISO is valid", () => {
    const iso = "2026-05-31T13:44:12.345678+00:00";
    const out = buildStaleSnapshotHelperCopy(iso, "en-US");
    expect(out.startsWith(STALE_HELPER_PREFIX)).toBe(true);
    expect(out.endsWith(STALE_HELPER_SUFFIX)).toBe(true);
    expect(out).toMatch(/Captured /);
    expect(out).toMatch(/2026/);
    // No raw ISO leakage.
    expect(out).not.toMatch(/T\d{2}:\d{2}/);
    expect(out).not.toMatch(/\+\d{2}:\d{2}/);
    // Never implies attached / live.
    expect(out).not.toMatch(/live/i);
    expect(out).not.toMatch(/attached as/i);
  });

  it("falls back without 'Captured ...' segment when timestamp is null", () => {
    const out = buildStaleSnapshotHelperCopy(null);
    expect(out).toBe(`${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`);
    expect(out).not.toMatch(/Captured/);
  });

  it("falls back when timestamp is invalid/unparseable", () => {
    const out = buildStaleSnapshotHelperCopy("not-a-date");
    expect(out).toBe(`${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`);
  });

  it("falls back on undefined/empty input", () => {
    expect(buildStaleSnapshotHelperCopy(undefined)).toBe(
      `${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`,
    );
    expect(buildStaleSnapshotHelperCopy("")).toBe(
      `${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`,
    );
  });
});
