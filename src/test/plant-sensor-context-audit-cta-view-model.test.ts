import { describe, it, expect } from "vitest";
import { buildPlantSensorContextAuditCta } from "@/lib/plantSensorContextAuditCtaViewModel";

const ID = {
  plantId: "p1",
  plantName: "Plant A",
  growId: "g1",
  tentId: "t1",
  tentName: "Tent A",
};

describe("buildPlantSensorContextAuditCta", () => {
  it("missing + handler + identity → add CTA with identity-only manual prefill", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: ID,
      hasOpenHandler: true,
    });
    expect(v.kind).toBe("add");
    expect(v.label).toBe("Add manual sensor snapshot");
    expect(v.prefill).toMatchObject({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
      source: "manual",
    });
    // No sensor values may leak into prefill.
    const json = JSON.stringify(v.prefill);
    expect(json).not.toMatch(/temp|humidity|ec|ph|vpd|co2|moisture/i);
  });

  it("stale + handler + identity → refresh CTA", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "stale",
      identity: ID,
      hasOpenHandler: true,
    });
    expect(v.kind).toBe("refresh");
    expect(v.label).toBe("Add fresh sensor snapshot");
    expect(v.prefill?.source).toBe("manual");
  });

  it("strong → no CTA", () => {
    expect(
      buildPlantSensorContextAuditCta({
        status: "strong",
        identity: ID,
        hasOpenHandler: true,
      }).kind,
    ).toBe("none");
  });

  it("limited → no CTA", () => {
    expect(
      buildPlantSensorContextAuditCta({
        status: "limited",
        identity: ID,
        hasOpenHandler: true,
      }).kind,
    ).toBe("none");
  });

  it("missing but no handler → inert fallback", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: ID,
      hasOpenHandler: false,
    });
    expect(v.kind).toBe("inert");
    expect(v.inertMessage).toMatch(/not wired here yet/);
    expect(v.prefill).toBeNull();
  });

  it("missing but no identity → inert fallback", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: null,
      hasOpenHandler: true,
    });
    expect(v.kind).toBe("inert");
    expect(v.prefill).toBeNull();
  });
});
