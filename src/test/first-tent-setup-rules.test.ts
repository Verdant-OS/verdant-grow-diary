import { describe, it, expect } from "vitest";
import {
  hasActiveTent,
  shouldRequireFirstTentSetup,
  buildFirstTentSetupCopy,
} from "@/lib/firstTentSetupRules";

describe("firstTentSetupRules", () => {
  it("returns false setup-required when at least one active tent exists", () => {
    const tents = [{ id: "t1", is_archived: false }];
    expect(hasActiveTent(tents)).toBe(true);
    expect(shouldRequireFirstTentSetup(tents)).toBe(false);
  });

  it("ignores archived tents", () => {
    const tents = [
      { id: "t1", is_archived: true },
      { id: "t2", is_archived: true },
    ];
    expect(hasActiveTent(tents)).toBe(false);
    expect(shouldRequireFirstTentSetup(tents)).toBe(true);
  });

  it("requires setup for empty / nullish input", () => {
    expect(shouldRequireFirstTentSetup([])).toBe(true);
    expect(shouldRequireFirstTentSetup(null)).toBe(true);
    expect(shouldRequireFirstTentSetup(undefined)).toBe(true);
  });

  it("rejects malformed rows without an id", () => {
    const tents = [
      { id: "", is_archived: false },
      { id: null as unknown as string, is_archived: false },
    ];
    expect(hasActiveTent(tents)).toBe(false);
  });

  it("mixes archived and active correctly", () => {
    const tents = [
      { id: "t1", is_archived: true },
      { id: "t2", is_archived: false },
    ];
    expect(hasActiveTent(tents)).toBe(true);
    expect(shouldRequireFirstTentSetup(tents)).toBe(false);
  });

  it("provides surface-aware copy that never fakes live data", () => {
    for (const surface of ["sensor_pairing", "manual_sensor", "quicklog_snapshot"] as const) {
      const copy = buildFirstTentSetupCopy(surface);
      expect(copy.title).toMatch(/Create a tent/i);
      expect(copy.body).toMatch(/grow-space anchor/i);
      expect(copy.cta).toMatch(/Create first tent/i);
      const blob = `${copy.title} ${copy.body} ${copy.cta}`.toLowerCase();
      expect(blob).not.toMatch(/live|demo|fake/);
    }
  });
});
