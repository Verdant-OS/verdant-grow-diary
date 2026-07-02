/**
 * Tests for One-Tent Live Proof demo guardrails:
 *   - Step 2 guides operator to Manual Sensor Snapshot.
 *   - "Not ready" copy on incomplete steps.
 *   - Demo safety warning rendered without secrets.
 *   - Demo run mode banner rendered.
 *   - Quick Log target_not_owned reason is sanitized.
 */
import { describe, it, expect } from "vitest";
import {
  buildOneTentLiveProofViewModel,
  PROOF_DEMO_SAFETY_WARNING,
  PROOF_DEMO_RUN_STEPS,
} from "@/lib/oneTentLiveProofViewModel";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";

const CTX = {
  grow: { id: "grow-1", name: "Sour Diesel Auto" },
  tent: { id: "tent-1", name: "Flower" },
};
const EMPTY_SIGNALS = {
  snapshot: null,
  snapshotStatus: "ok" as const,
  hasMatchingOpenAlert: false,
  matchingAlertId: null,
  linkedActionExists: false,
  linkedActionId: null,
  linkedActionCompleted: null,
  timelineFollowupConfirmed: null,
  now: Date.parse("2026-06-23T12:00:00Z"),
};

describe("Step 2 — Manual Sensor Snapshot guidance", () => {
  it("step 2 label says 'Manual Sensor Snapshot'", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].label).toMatch(/manual sensor snapshot/i);
  });
  it("step 2 explains not to use Quick Log hardware notes for alert proof", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].message.toLowerCase()).toContain("quick log");
    expect(vm.steps[1].message.toLowerCase()).toContain("manual snapshot");
  });
  it("step 2 CTA links to /sensors?growId=...#manual-reading", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].ctaHref).toBe("/sensors?growId=grow-1#manual-reading");
  });
  it("step 2 includes refresh instruction after manual snapshot guidance", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].message.toLowerCase()).toContain("refresh proof status");
  });
});

describe("'Not ready' copy on incomplete steps", () => {
  it("step 2 says 'Not ready' when no fresh manual snapshot", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[1].message).toMatch(/not ready/i);
  });
  it("step 3 says 'Not ready: no open alert found for the selected grow.'", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, EMPTY_SIGNALS);
    expect(vm.steps[2].message).toMatch(
      /not ready: no open alert found for the selected grow/i,
    );
  });
  it("step 4 says 'Not ready: alert has not been added to Action Queue.'", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...EMPTY_SIGNALS,
      hasMatchingOpenAlert: true,
    });
    expect(vm.steps[3].message).toMatch(
      /not ready: alert has not been added to action queue/i,
    );
  });
  it("step 5 says 'Not ready: linked Action Queue item is not completed.'", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...EMPTY_SIGNALS,
      hasMatchingOpenAlert: true,
      linkedActionExists: true,
      linkedActionId: "act-7",
      linkedActionCompleted: false,
    });
    expect(vm.steps[4].message).toMatch(
      /not ready: linked action queue item is not completed/i,
    );
  });
});

describe("Demo safety warning + demo run banner", () => {
  it("warning copy mentions bridge token / webhook / integration", () => {
    expect(PROOF_DEMO_SAFETY_WARNING.toLowerCase()).toContain("bridge token");
    expect(PROOF_DEMO_SAFETY_WARNING.toLowerCase()).toContain("webhook");
    expect(PROOF_DEMO_SAFETY_WARNING.toLowerCase()).toContain("integration");
  });
  it("warning does not include token/secret/endpoint-shaped strings", () => {
    const text = PROOF_DEMO_SAFETY_WARNING;
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+/); // JWT
    expect(text).not.toMatch(/sk_[A-Za-z0-9]{8,}/);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/Bearer\s+/i);
  });
  it("demo run steps list the full recommended path", () => {
    expect(PROOF_DEMO_RUN_STEPS).toContain("Add Manual Snapshot");
    expect(PROOF_DEMO_RUN_STEPS).toContain("Open Alerts");
    expect(PROOF_DEMO_RUN_STEPS).toContain("Add to Action Queue");
    expect(PROOF_DEMO_RUN_STEPS).toContain("Complete Action");
    expect(PROOF_DEMO_RUN_STEPS).toContain("Open Timeline");
    expect(PROOF_DEMO_RUN_STEPS).toContain("Refresh Proof Status");
  });
});

describe("Quick Log save error sanitization", () => {
  it("target_not_owned → operator-safe re-select copy, no raw token", () => {
    const msg = quickLogReasonToOperatorMessage("target_not_owned");
    expect(msg).not.toContain("target_not_owned");
    expect(msg.toLowerCase()).toContain("no longer matches your workspace");
    expect(msg.toLowerCase()).toContain("re-select the plant");
  });
  it("grow_not_owned → same sanitized re-select copy", () => {
    const msg = quickLogReasonToOperatorMessage("grow_not_owned");
    expect(msg).not.toContain("grow_not_owned");
    expect(msg.toLowerCase()).toContain("re-select the plant");
  });
  it("unknown reason falls back to a calm generic message", () => {
    const msg = quickLogReasonToOperatorMessage("some_future_code");
    expect(msg).not.toContain("some_future_code");
    expect(msg.toLowerCase()).toContain("re-select");
  });
  it("save_failed → calm retry message, never raw code", () => {
    const msg = quickLogReasonToOperatorMessage("save_failed");
    expect(msg).not.toContain("save_failed");
    expect(msg.toLowerCase()).toContain("try again");
  });
});
