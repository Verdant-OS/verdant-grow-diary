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

  it("complete identity but no handler routes to the real Plant Detail Quick Log surface", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: ID,
      hasOpenHandler: false,
    });
    expect(v.kind).toBe("recovery");
    expect(v.label).toBe("Open plant Quick Log");
    expect(v.recoveryMessage).toMatch(/plant overview.*Quick Log/i);
    expect(v.recoveryHref).toBe("/plants/p1#plant-overview");
    expect(v.prefill).toBeNull();
  });

  it("null identity routes to the real plant picker without claiming a sensor action ran", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: null,
      hasOpenHandler: true,
    });
    expect(v.kind).toBe("recovery");
    expect(v.label).toBe("Choose a plant");
    expect(v.recoveryMessage).toMatch(/Choose a plant before adding/i);
    expect(v.recoveryHref).toBe("/plants");
    expect(v.prefill).toBeNull();
  });

  it("missing grow assignment routes to Grows before offering a sensor entry", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: { ...ID, growId: null, tentId: null },
      hasOpenHandler: true,
    });
    expect(v).toMatchObject({
      kind: "recovery",
      label: "Review grow setup",
      recoveryHref: "/grows",
      prefill: null,
    });
    expect(v.recoveryMessage).toMatch(/grow assignment/i);
  });

  it("missing tent assignment routes to the existing Plant Detail assignment control", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "missing",
      identity: { ...ID, tentId: null },
      hasOpenHandler: true,
    });
    expect(v).toMatchObject({
      kind: "recovery",
      label: "Assign plant to a tent",
      recoveryHref: "/plants/p1#plant-overview",
      prefill: null,
    });
    expect(v.recoveryMessage).toMatch(/Assign this plant to a tent/i);
  });

  it("stale context with a missing tent stays degraded and uses assignment recovery", () => {
    const v = buildPlantSensorContextAuditCta({
      status: "stale",
      identity: { ...ID, tentId: null },
      hasOpenHandler: true,
    });
    expect(v.kind).toBe("recovery");
    expect(v.recoveryHref).toBe("/plants/p1#plant-overview");
    expect(v.recoveryMessage).toMatch(/fresh manual sensor snapshot/i);
    expect(v.recoveryMessage).not.toMatch(/\bhealthy\b|\blive\b/i);
    expect(v.prefill).toBeNull();
  });
});
