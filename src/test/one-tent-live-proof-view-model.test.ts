import { describe, it, expect } from "vitest";
import {
  PROOF_SAFETY_BADGES,
  buildOneTentLiveProofViewModel,
} from "@/lib/oneTentLiveProofViewModel";
import { STALE_THRESHOLD_MS, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-06-23T12:00:00Z");
const FRESH_TS = new Date(NOW - 5 * 60_000).toISOString();
const STALE_TS = new Date(NOW - STALE_THRESHOLD_MS - 60_000).toISOString();

function snap(
  overrides: Partial<SensorSnapshot> & {
    source: SensorSnapshot["source"];
    ts: string | null;
  },
): SensorSnapshot {
  return {
    source: overrides.source,
    ts: overrides.ts,
    temp: null,
    rh: null,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
    csvVendor: null,
    ...overrides,
  };
}

const NO_CONTEXT = {};
const FULL_CTX = {
  grow: { id: "grow-1", name: "Sour Diesel Auto" },
  tent: { id: "tent-1", name: "Flower" },
  plant: { id: "plant-1", name: "Sour Diesel Autoflower" },
};

const EMPTY_SIGNALS = {
  snapshot: null,
  snapshotStatus: "ok" as const,
  hasMatchingOpenAlert: false,
  linkedActionExists: false,
  linkedActionCompleted: null,
  timelineFollowupConfirmed: null,
  now: NOW,
};

describe("buildOneTentLiveProofViewModel — step derivation", () => {
  it("no context → step 1 pending, proof incomplete", () => {
    const vm = buildOneTentLiveProofViewModel(NO_CONTEXT, EMPTY_SIGNALS);
    expect(vm.steps[0].status).toBe("pending");
    expect(vm.proofComplete).toBe(false);
    expect(vm.nextRecommendedStepId).toBe(1);
    expect(vm.selectionSummary).toBeNull();
  });
  it("context selected → step 1 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, EMPTY_SIGNALS);
    expect(vm.steps[0].status).toBe("complete");
    expect(vm.selectionSummary).toContain("Sour Diesel Auto");
    expect(vm.selectionSummary).toContain("Flower");
  });
  it("fresh manual snapshot inside window → step 2 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "manual", ts: FRESH_TS }),
    });
    expect(vm.steps[1].status).toBe("complete");
  });
  it("stale manual snapshot → step 2 stale", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "manual", ts: STALE_TS }),
    });
    expect(vm.steps[1].status).toBe("stale");
  });
  it("csv/context-only snapshot → step 2 pending, not complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "csv", ts: FRESH_TS }),
    });
    expect(vm.steps[1].status).toBe("pending");
    expect(vm.steps[1].message.toLowerCase()).toContain("context-only");
  });
  it("matching open alert → step 3 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "manual", ts: FRESH_TS }),
      hasMatchingOpenAlert: true,
    });
    expect(vm.steps[2].status).toBe("complete");
  });
  it("no matching alert → step 3 pending with safe explanation", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "manual", ts: FRESH_TS }),
      hasMatchingOpenAlert: false,
    });
    expect(vm.steps[2].status).toBe("pending");
    expect(vm.steps[2].message.toLowerCase()).toMatch(/no matching alert/);
  });
  it("linked action exists → step 4 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      hasMatchingOpenAlert: true,
      linkedActionExists: true,
    });
    expect(vm.steps[3].status).toBe("complete");
  });
  it("linked action completed → step 5 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      linkedActionExists: true,
      linkedActionCompleted: true,
    });
    expect(vm.steps[4].status).toBe("complete");
  });
  it("completion unknown → step 5 needs-confirmation", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, EMPTY_SIGNALS);
    expect(vm.steps[4].status).toBe("needs-confirmation");
  });
  it("timeline follow-up confirmed → step 6 complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      timelineFollowupConfirmed: true,
    });
    expect(vm.steps[5].status).toBe("complete");
  });
  it("missing timeline proof → step 6 needs-confirmation", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, EMPTY_SIGNALS);
    expect(vm.steps[5].status).toBe("needs-confirmation");
    expect(vm.needsOperatorConfirmation).toBe(true);
  });
  it("full valid chain → proof complete", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, {
      ...EMPTY_SIGNALS,
      snapshot: snap({ source: "manual", ts: FRESH_TS }),
      hasMatchingOpenAlert: true,
      linkedActionExists: true,
      linkedActionCompleted: true,
      timelineFollowupConfirmed: true,
    });
    expect(vm.proofComplete).toBe(true);
    expect(vm.needsOperatorConfirmation).toBe(false);
    expect(vm.nextRecommendedStepId).toBeNull();
  });
  it("never emits automation/device-control copy", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, EMPTY_SIGNALS);
    const blob = vm.steps
      .map((s) => `${s.label} ${s.message}`)
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(/automatic action|device control|ai fixed/);
  });
  it("exposes the canonical safety badges", () => {
    const vm = buildOneTentLiveProofViewModel(NO_CONTEXT, EMPTY_SIGNALS);
    expect(vm.safetyBadges).toBe(PROOF_SAFETY_BADGES);
    const labels = vm.safetyBadges.map((b) => b.label.toLowerCase());
    expect(labels.some((l) => l.includes("no fake live"))).toBe(true);
    expect(labels.some((l) => l.includes("grower-approved"))).toBe(true);
    expect(labels.some((l) => l.includes("no device control"))).toBe(true);
  });
  it("CTAs link to existing routes: sensors#manual-reading, /alerts, /actions, /timeline", () => {
    const vm = buildOneTentLiveProofViewModel(FULL_CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].ctaHref).toContain("/sensors");
    expect(vm.steps[1].ctaHref).toContain("#manual-reading");
    expect(vm.steps[2].ctaHref).toMatch(/^\/alerts/);
    expect(vm.steps[3].ctaHref).toMatch(/^\/alerts/);
    expect(vm.steps[4].ctaHref).toMatch(/^\/actions/);
    expect(vm.steps[5].ctaHref).toMatch(/^\/timeline/);
  });
});
