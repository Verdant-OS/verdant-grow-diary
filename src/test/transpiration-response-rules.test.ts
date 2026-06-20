import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateTranspirationWindow,
  type TranspirationWindowInput,
} from "@/lib/transpirationResponseRules";

const baseVpd = (start: string) => [
  { capturedAt: start, valueKpa: 1.0 },
  { capturedAt: addH(start, 1), valueKpa: 1.2 },
  { capturedAt: addH(start, 2), valueKpa: 1.4 },
  { capturedAt: addH(start, 3), valueKpa: 1.4 },
];

function addH(iso: string, h: number): string {
  return new Date(Date.parse(iso) + h * 3_600_000).toISOString();
}

function baseInput(
  overrides: Partial<TranspirationWindowInput> = {},
): TranspirationWindowInput {
  const startTime = "2026-06-13T08:00:00.000Z";
  const endTime = "2026-06-13T12:00:00.000Z";
  return {
    windowId: "w1",
    plantId: "p1",
    tentId: "t1",
    stage: "flower_mid",
    startTime,
    endTime,
    startWeightG: 5000,
    endWeightG: 4800,
    vpdReadings: baseVpd(startTime),
    sizeBasis: "plant_weight_kg",
    sizeProxyValue: 1.2,
    weightSource: "load_cell",
    boundarySource: "diary_event",
    now: addH(endTime, 1),
    ...overrides,
  };
}

describe("evaluateTranspirationWindow", () => {
  it("load_cell + plant_weight_kg → primary metric, high confidence", () => {
    const r = evaluateTranspirationWindow(baseInput());
    expect(r.status).toBe("valid");
    expect(r.confidence).toBe("high");
    expect(r.waterLossG).toBe(200);
    expect(r.waterLossRatePerVpdPerSize).not.toBeNull();
    expect(r.waterLossRatePerVpd).not.toBeNull();
    expect(r.warnings).not.toContain("size_unnormalized");
  });

  it("manual + plant_weight_kg → primary metric, medium confidence", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ weightSource: "manual" }),
    );
    expect(r.status).toBe("valid");
    expect(r.confidence).toBe("medium");
    expect(r.waterLossRatePerVpdPerSize).not.toBeNull();
  });

  it("valid weight but no size proxy → primary null, supporting present, low + size_unnormalized", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ sizeBasis: "none", sizeProxyValue: null }),
    );
    expect(r.status).toBe("valid");
    expect(r.confidence).toBe("low");
    expect(r.waterLossRatePerVpdPerSize).toBeNull();
    expect(r.waterLossRatePerVpd).not.toBeNull();
    expect(r.warnings).toContain("size_unnormalized");
  });

  it("missing VPD → insufficient", () => {
    const r = evaluateTranspirationWindow(baseInput({ vpdReadings: [] }));
    expect(r.status).toBe("insufficient");
    expect(r.confidence).toBe("insufficient");
    expect(r.warnings).toContain("missing_vpd");
  });

  it("zero VPD → insufficient (unrealistic)", () => {
    const start = "2026-06-13T08:00:00.000Z";
    const r = evaluateTranspirationWindow(
      baseInput({
        vpdReadings: [
          { capturedAt: start, valueKpa: 0 },
          { capturedAt: addH(start, 1), valueKpa: 0 },
        ],
      }),
    );
    expect(r.status).toBe("insufficient");
    expect(r.warnings).toContain("unrealistic_vpd");
  });

  it("unrealistic VPD (too high) → insufficient", () => {
    const start = "2026-06-13T08:00:00.000Z";
    const r = evaluateTranspirationWindow(
      baseInput({
        vpdReadings: [
          { capturedAt: start, valueKpa: 99 },
          { capturedAt: addH(start, 1), valueKpa: 99 },
        ],
      }),
    );
    expect(r.status).toBe("insufficient");
    expect(r.warnings).toContain("unrealistic_vpd");
  });

  it("negative/zero duration → invalid", () => {
    const r = evaluateTranspirationWindow(
      baseInput({
        startTime: "2026-06-13T12:00:00.000Z",
        endTime: "2026-06-13T08:00:00.000Z",
      }),
    );
    expect(r.status).toBe("invalid");
  });

  it("end weight >= start weight → invalid", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ startWeightG: 4000, endWeightG: 4200 }),
    );
    expect(r.status).toBe("invalid");
    expect(r.warnings).toContain("end_weight_not_less_than_start");
  });

  it("missing start or end weight → insufficient", () => {
    const r1 = evaluateTranspirationWindow(baseInput({ startWeightG: null }));
    const r2 = evaluateTranspirationWindow(baseInput({ endWeightG: null }));
    expect(r1.status).toBe("insufficient");
    expect(r2.status).toBe("insufficient");
  });

  it("weight-jump-only boundary → insufficient", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ boundarySource: "weight_jump_only" }),
    );
    expect(r.status).toBe("insufficient");
    expect(r.warnings).toContain("unreliable_boundary");
  });

  it("stale weight → stale", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ now: addH("2026-06-13T12:00:00.000Z", 48) }),
    );
    expect(r.status).toBe("stale");
    expect(r.warnings).toContain("stale_weight");
  });

  it("soil moisture proxy does not compute weight-based metrics", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ weightSource: "soil_moisture_proxy" }),
    );
    expect(r.status).toBe("insufficient");
    expect(r.waterLossRatePerVpd).toBeNull();
    expect(r.waterLossRatePerVpdPerSize).toBeNull();
    expect(r.warnings).toContain("soil_moisture_proxy_low_confidence");
  });

  it("primary metric never defaults size proxy to 1", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ sizeBasis: "plant_weight_kg", sizeProxyValue: 0 }),
    );
    // size proxy 0 is not qualified → primary null, size_unnormalized warning
    expect(r.waterLossRatePerVpdPerSize).toBeNull();
    expect(r.warnings).toContain("size_unnormalized");
  });

  it("warnings and reasons are deterministically sorted", () => {
    const r = evaluateTranspirationWindow(
      baseInput({ sizeBasis: "none", sizeProxyValue: null }),
    );
    const w = r.warnings;
    const sortedW = [...w].sort();
    expect(w).toEqual(sortedW);
    const reasons = r.confidenceReasons;
    expect(reasons).toEqual([...reasons].sort());
  });

  it("source summary surfaces weight/boundary/size labels", () => {
    const r = evaluateTranspirationWindow(baseInput());
    expect(r.sourceSummary).toContain("weight_source:load_cell");
    expect(r.sourceSummary).toContain("boundary_source:diary_event");
    expect(r.sourceSummary).toContain("size_basis:plant_weight_kg");
  });
});

describe("transpirationResponseRules static safety", () => {
  const raw = readFileSync(
    "src/lib/transpirationResponseRules.ts",
    "utf8",
  );
  // Strip block and line comments so prose like "No alerts" / "No device"
  // does not trip the banned-term scanner.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .toLowerCase();

  const banned = [
    "react",
    "supabase",
    "fetch(",
    ".rpc(",
    ".insert(",
    ".update(",
    ".delete(",
    ".upsert(",
    "action_queue",
    "alerts",
    "openai",
    "ai-doctor",
    "device",
    "relay",
    "actuator",
  ];

  for (const term of banned) {
    it(`does not reference '${term}'`, () => {
      expect(src).not.toContain(term);
    });
  }
});
