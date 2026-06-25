/**
 * greenhouseRootZoneRules — medium-aware root-zone EC interpretation.
 */
import { describe, it, expect } from "vitest";
import { assessRootZoneEc } from "@/lib/greenhouseRootZoneRules";

const FORBIDDEN_KEYS = /^(command|device_id|action_queue|control|relay|execute)$/i;
function assertNoForbiddenKeys(obj: unknown, path = "$"): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    expect(FORBIDDEN_KEYS.test(k), `${path}.${k} is forbidden`).toBe(false);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

describe("assessRootZoneEc — medium awareness", () => {
  it("coco uses runoff-EC delta", () => {
    const r = assessRootZoneEc({
      medium: "coco",
      feedEcMscm: 1.6,
      runoffEcMscm: 1.8,
      source: "live",
    });
    expect(r.deltaUsed).toBe(true);
    expect(r.status).toBe("ok");
  });
  it("rockwool flags review when delta moderate", () => {
    const r = assessRootZoneEc({
      medium: "rockwool",
      feedEcMscm: 2.0,
      runoffEcMscm: 2.7,
      source: "manual",
    });
    expect(r.status).toBe("review");
    expect(r.deltaUsed).toBe(true);
  });
  it("rockwool flags risk when delta is large (never aggressive recommendation)", () => {
    const r = assessRootZoneEc({
      medium: "rockwool",
      feedEcMscm: 2.0,
      runoffEcMscm: 3.5,
      source: "live",
    });
    expect(r.status).toBe("risk");
    expect(r.reason).toMatch(/inspect/);
    // No flush/feed-change command in guidance.
    expect(r.guidance).not.toMatch(/flush|change.*feed/i);
  });
  it("living_soil does NOT use runoff EC as a primary health signal", () => {
    const r = assessRootZoneEc({
      medium: "living_soil",
      feedEcMscm: 1.0,
      runoffEcMscm: 3.0,
      source: "live",
    });
    expect(r.status).toBe("unknown");
    expect(r.deltaUsed).toBe(false);
    expect(r.reason).toMatch(/living_soil|peat/);
  });
  it("peat / soil also skip runoff-EC primary signal", () => {
    for (const medium of ["peat", "soil"]) {
      const r = assessRootZoneEc({
        medium,
        feedEcMscm: 1.0,
        runoffEcMscm: 3.0,
        source: "live",
      });
      expect(r.status).toBe("unknown");
      expect(r.deltaUsed).toBe(false);
    }
  });
});

describe("assessRootZoneEc — null safety & source handling", () => {
  it("returns unknown for unknown medium", () => {
    const r = assessRootZoneEc({
      medium: "wood_chips",
      feedEcMscm: 1.5,
      runoffEcMscm: 1.7,
      source: "live",
    });
    expect(r.status).toBe("unknown");
    expect(r.medium).toBeNull();
  });
  it("returns unknown for stale/invalid/noncanonical sources", () => {
    for (const source of ["stale", "invalid", "ecowitt", null, undefined]) {
      const r = assessRootZoneEc({
        medium: "coco",
        feedEcMscm: 1.5,
        runoffEcMscm: 1.7,
        source,
      });
      expect(r.status).toBe("unknown");
    }
  });
  it("returns unknown when feed or runoff missing/NaN", () => {
    expect(
      assessRootZoneEc({
        medium: "coco",
        feedEcMscm: null,
        runoffEcMscm: 1.7,
        source: "live",
      }).status,
    ).toBe("unknown");
    expect(
      assessRootZoneEc({
        medium: "coco",
        feedEcMscm: 1.5,
        runoffEcMscm: Number.NaN,
        source: "live",
      }).status,
    ).toBe("unknown");
  });
  it("never promotes manual/csv/demo to live in the resolved source", () => {
    for (const s of ["manual", "csv", "demo"] as const) {
      const r = assessRootZoneEc({
        medium: "coco",
        feedEcMscm: 1.5,
        runoffEcMscm: 1.6,
        source: s,
      });
      expect(r.source).toBe(s);
    }
  });
  it("emits no forbidden device-command keys", () => {
    const r = assessRootZoneEc({
      medium: "coco",
      feedEcMscm: 1.5,
      runoffEcMscm: 1.6,
      source: "live",
    });
    assertNoForbiddenKeys(r);
  });
});
