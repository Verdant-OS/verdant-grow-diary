/**
 * Pure unit tests for the Dashboard Action Queue view model.
 * No I/O. No React. No Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  APPROVAL_QUEUE_EMPTY_COPY,
  SAFE_BY_DESIGN_COPY,
  buildApprovalQueueViewItems,
  mapRiskToSeverity,
} from "@/lib/dashboardActionQueueViewModel";

const BASE = {
  id: "a1",
  risk_level: "medium",
  suggested_change: "Lower VPD slightly",
  reason: "RH below target during lights-on.",
  created_at: "2026-06-04T12:00:00Z",
  tent_id: "tent-1",
  plant_id: "plant-1",
  source: "ai_doctor",
  status: "pending_approval",
};

describe("mapRiskToSeverity", () => {
  it("maps high/critical/danger to critical", () => {
    expect(mapRiskToSeverity("high")).toBe("critical");
    expect(mapRiskToSeverity("Critical")).toBe("critical");
    expect(mapRiskToSeverity("danger")).toBe("critical");
  });
  it("maps low/info to info", () => {
    expect(mapRiskToSeverity("low")).toBe("info");
    expect(mapRiskToSeverity("informational")).toBe("info");
  });
  it("defaults unknown/null to warning", () => {
    expect(mapRiskToSeverity("medium")).toBe("warning");
    expect(mapRiskToSeverity(null)).toBe("warning");
    expect(mapRiskToSeverity(undefined)).toBe("warning");
    expect(mapRiskToSeverity(123 as unknown)).toBe("warning");
  });
});

describe("buildApprovalQueueViewItems", () => {
  it("returns an empty array for non-array input", () => {
    expect(buildApprovalQueueViewItems(null as unknown as [])).toEqual([]);
    expect(buildApprovalQueueViewItems(undefined as unknown as [])).toEqual([]);
  });

  it("maps title/reason/severity/createdAt verbatim", () => {
    const vm = buildApprovalQueueViewItems([BASE]);
    expect(vm[0].title).toBe("Lower VPD slightly");
    expect(vm[0].reason).toContain("RH below target");
    expect(vm[0].severity).toBe("warning");
    expect(vm[0].riskLevelLabel).toBe("medium");
    expect(vm[0].createdAt).toBe(BASE.created_at);
    expect(vm[0].status).toBe("pending_approval");
  });

  it("resolves tent/plant labels from lookups when available", () => {
    const vm = buildApprovalQueueViewItems([BASE], {
      tentsById: { "tent-1": { name: "Veg Tent" } },
      plantsById: { "plant-1": { nickname: "Bruce", strain: "GG4" } },
    });
    expect(vm[0].tentName).toBe("Veg Tent");
    expect(vm[0].plantLabel).toBe("Bruce");
  });

  it("falls back from nickname to strain", () => {
    const vm = buildApprovalQueueViewItems(
      [{ ...BASE, plant_id: "p2" }],
      { plantsById: { p2: { strain: "GG4" } } },
    );
    expect(vm[0].plantLabel).toBe("GG4");
  });

  it("leaves tent/plant labels null when lookups are missing", () => {
    const vm = buildApprovalQueueViewItems([BASE]);
    expect(vm[0].tentName).toBeNull();
    expect(vm[0].plantLabel).toBeNull();
  });

  it("preserves the source label when present", () => {
    const vm = buildApprovalQueueViewItems([BASE]);
    expect(vm[0].sourceLabel).toBe("ai_doctor");
  });

  it("returns null source label when source is blank/whitespace", () => {
    const vm = buildApprovalQueueViewItems([{ ...BASE, source: "   " }]);
    expect(vm[0].sourceLabel).toBeNull();
  });

  it("defaults missing risk_level to 'unspecified' and severity 'warning'", () => {
    const vm = buildApprovalQueueViewItems([{ ...BASE, risk_level: "" }]);
    expect(vm[0].riskLevelLabel).toBe("unspecified");
    expect(vm[0].severity).toBe("warning");
  });
});

describe("SAFE_BY_DESIGN_COPY", () => {
  it("includes Safe by Design / Read-Only / Approval Required and explainer", () => {
    expect(SAFE_BY_DESIGN_COPY.badge).toBe("Safe by Design");
    expect(SAFE_BY_DESIGN_COPY.readOnly).toBe("Read-Only");
    expect(SAFE_BY_DESIGN_COPY.approvalRequired).toBe("Approval Required");
    expect(SAFE_BY_DESIGN_COPY.explainer.toLowerCase()).toContain(
      "verdant suggests",
    );
    expect(SAFE_BY_DESIGN_COPY.explainer.toLowerCase()).toContain(
      "grower approves",
    );
    expect(SAFE_BY_DESIGN_COPY.explainer.toLowerCase()).toContain(
      "no device control",
    );
  });
});

describe("APPROVAL_QUEUE_EMPTY_COPY", () => {
  it("uses calm honest copy that never implies automation", () => {
    expect(APPROVAL_QUEUE_EMPTY_COPY.title.toLowerCase()).toContain(
      "no recommendations awaiting approval",
    );
    expect(APPROVAL_QUEUE_EMPTY_COPY.hint.toLowerCase()).not.toContain(
      "autopilot",
    );
    expect(APPROVAL_QUEUE_EMPTY_COPY.hint.toLowerCase()).not.toContain(
      "automatically",
    );
  });
});
