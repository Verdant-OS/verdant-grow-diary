/**
 * environmentCheckViewModel tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckDiaryViewModel,
  isEnvironmentCheckKind,
} from "@/lib/environmentCheckViewModel";

const FORBIDDEN = /^(command|device_id|action_queue|control|relay|execute)$/i;
function assertSafe(obj: unknown, path = "$"): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    expect(FORBIDDEN.test(k), `${path}.${k} forbidden`).toBe(false);
    assertSafe(v, `${path}.${k}`);
  }
}

describe("isEnvironmentCheckKind", () => {
  it("recognizes environment-check kinds", () => {
    expect(isEnvironmentCheckKind("environment")).toBe(true);
    expect(isEnvironmentCheckKind("sensor-snapshot")).toBe(true);
    expect(isEnvironmentCheckKind("measurement")).toBe(true);
    expect(isEnvironmentCheckKind("watering")).toBe(false);
    expect(isEnvironmentCheckKind(null)).toBe(false);
  });
});

describe("buildEnvironmentCheckDiaryViewModel", () => {
  const occurredAt = "2026-06-11T12:00:00Z";

  it("returns valid for in-band VPD on a live source", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e1",
      occurredAt,
      kind: "environment",
      snapshot: {
        source: "live",
        tempC: 24,
        rhPercent: 60,
        vpdBand: { minKpa: 0.8, maxKpa: 1.5 },
      },
    });
    expect(vm.status).toBe("valid");
    expect(vm.statusTone).toBe("success");
    expect(vm.reviewPrompt).toBeNull();
    expect(vm.sourceLabel).toBe("live");
    assertSafe(vm);
  });

  it("marks invalid telemetry as invalid, never healthy", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e2",
      occurredAt,
      kind: "environment",
      snapshot: {
        source: "not_a_real_source",
        tempC: 24,
        rhPercent: 60,
      },
    });
    expect(vm.status).toBe("invalid");
    expect(vm.statusTone).toBe("danger");
    expect(vm.sourceLabel).toBe("invalid");
  });

  it("stale source returns review_required", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e3",
      occurredAt,
      kind: "environment",
      snapshot: { source: "stale", tempC: 24, rhPercent: 60 },
    });
    expect(vm.status).toBe("review_required");
    expect(vm.statusTone).toBe("warning");
  });

  it("DST-ambiguous DLI window surfaces dst_ambiguous and is not styled as success", () => {
    // Pacific spring-forward 2026-03-08
    const samples = [
      { ts: "2026-03-08T09:00:00Z", ppfd: 200, source: "live" },
      { ts: "2026-03-09T00:00:00Z", ppfd: 200, source: "live" },
    ];
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e4",
      occurredAt,
      kind: "environment",
      snapshot: {
        source: "live",
        ppfdSamples: samples,
        tzIana: "America/Los_Angeles",
      },
    });
    expect(vm.status).toBe("dst_ambiguous");
    expect(vm.statusTone).not.toBe("success");
    expect(vm.reviewPrompt).toMatch(/DST/);
    const ann = vm.ruleAnnotations.find((a) => a.ruleId === "light.dli");
    expect(ann?.status).toBe("dst_ambiguous");
  });

  it("VPD out of band → review_required", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e5",
      occurredAt,
      kind: "environment",
      snapshot: {
        source: "live",
        tempC: 30,
        rhPercent: 30,
        vpdBand: { minKpa: 0.8, maxKpa: 1.3 },
      },
    });
    expect(vm.status).toBe("review_required");
    expect(vm.reviewPrompt).toMatch(/review/i);
  });

  it("missing snapshot → review_required with prompt", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e6",
      occurredAt,
      kind: "environment",
      snapshot: null,
    });
    expect(vm.status).toBe("review_required");
    expect(vm.reviewPrompt).toBeTruthy();
  });

  it("emits no forbidden device-command keys", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      entryId: "e7",
      occurredAt,
      kind: "environment",
      snapshot: {
        source: "live",
        tempC: 24,
        rhPercent: 60,
        rootZone: {
          medium: "coco",
          feedEcMscm: 1.5,
          runoffEcMscm: 1.6,
          source: "live",
        },
      },
    });
    assertSafe(vm);
  });

  it("is deterministic across repeated calls", () => {
    const input = {
      entryId: "e8",
      occurredAt,
      kind: "environment",
      snapshot: { source: "live" as const, tempC: 24, rhPercent: 60 },
    };
    const a = buildEnvironmentCheckDiaryViewModel(input);
    const b = buildEnvironmentCheckDiaryViewModel(input);
    expect(a).toEqual(b);
  });
});
