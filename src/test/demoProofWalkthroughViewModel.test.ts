import { describe, it, expect } from "vitest";
import {
  buildDemoProofWalkthroughViewModel,
  DEMO_PROOF_WALKTHROUGH_ROUTE,
  PROOF_WINDOW_LABEL,
} from "@/lib/demoProofWalkthroughViewModel";

const EXPECTED_ORDER = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ecowitt-live-row-proof",
  "ecowitt-ingest-audit-proof",
  "ai-doctor-readiness",
  "alerts",
  "action-queue",
  "one-tent-live-proof",
];

const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
const ISO_SECOND_RE =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/;
const FORBIDDEN_TOKENS = [
  "service_role",
  "SERVICE_ROLE",
  "bridge_token",
  "BRIDGE_TOKEN",
  "raw_payload",
  "anon_key",
  "ANON_KEY",
  "MAC=",
  "user_id",
];

describe("demoProofWalkthroughViewModel", () => {
  const vm = buildDemoProofWalkthroughViewModel();

  it("exposes the canonical internal route", () => {
    expect(DEMO_PROOF_WALKTHROUGH_ROUTE).toBe(
      "/internal/demo-proof-walkthrough",
    );
  });

  it("uses the current-proof-window scope label, not all-time", () => {
    expect(PROOF_WINDOW_LABEL).toMatch(/current proof window/i);
    expect(PROOF_WINDOW_LABEL).not.toMatch(/all-time|forever|complete/i);
  });

  it("orders steps as the V0 One-Tent Loop", () => {
    expect(vm.steps.map((s) => s.id)).toEqual(EXPECTED_ORDER);
    vm.steps.forEach((s, i) => {
      expect(s.order).toBe(i + 1);
    });
  });

  it("every step has label, purpose, evidence, href, safety note, statusKind", () => {
    for (const s of vm.steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.purpose.length).toBeGreaterThan(0);
      expect(s.expectedEvidence.length).toBeGreaterThan(0);
      expect(s.href.length).toBeGreaterThan(0);
      expect(s.safetyNote.length).toBeGreaterThan(0);
      expect([
        "ready",
        "operator_only",
        "limited",
        "unavailable",
      ]).toContain(s.statusKind);
    }
  });

  it("operator-mode steps include ?operator=1 and are marked operator_only", () => {
    const operatorSteps = vm.steps.filter((s) =>
      s.id.startsWith("ecowitt-"),
    );
    expect(operatorSteps.length).toBe(2);
    for (const s of operatorSteps) {
      expect(s.href).toContain("?operator=1");
      expect(s.statusKind).toBe("operator_only");
      expect(s.safetyNote).toMatch(/URL surface gate/i);
    }
  });

  it("safety summary calls out URL surface gate, no automation, no device control", () => {
    const joined = vm.safetySummary.join(" ");
    expect(joined).toMatch(/URL surface gate/i);
    expect(joined).toMatch(/no device control or automation/i);
    expect(joined).toMatch(/Verdant suggests; growers approve/i);
    expect(joined).toMatch(/Read-only walkthrough/i);
  });

  it("never includes raw payloads, secrets, MACs, UUIDs, or ISO-second timestamps", () => {
    const blob = JSON.stringify(vm);
    expect(blob).not.toMatch(UUID_RE);
    expect(blob).not.toMatch(ISO_SECOND_RE);
    for (const tok of FORBIDDEN_TOKENS) {
      expect(blob).not.toContain(tok);
    }
  });

  it("never claims live, healthy, or auto-execute for stale/invalid/blocked", () => {
    const blob = JSON.stringify(vm).toLowerCase();
    expect(blob).not.toMatch(/auto[- ]execute/);
    expect(blob).not.toMatch(/auto[- ]?run/);
    expect(blob).not.toMatch(/fake live/);
    expect(blob).not.toContain("healthy");
  });

  it("'what this proves' and 'what this does not prove' are non-empty and distinct", () => {
    expect(vm.whatThisProves.length).toBeGreaterThanOrEqual(3);
    expect(vm.whatThisDoesNotProve.length).toBeGreaterThanOrEqual(3);
    const proves = new Set(vm.whatThisProves);
    for (const x of vm.whatThisDoesNotProve) {
      expect(proves.has(x)).toBe(false);
    }
  });
});
