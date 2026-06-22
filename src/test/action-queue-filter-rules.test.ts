import { describe, it, expect } from "vitest";
import {
  normalizeActionSearchQuery,
  actionMatchesSearch,
  actionMatchesTraceFailedFilter,
  applyActionQueueListPipeline,
  collectActionSearchFields,
} from "@/lib/actionQueueFilterRules";

const ROW_A = {
  id: "aq-1",
  action_type: "lower_humidity",
  suggested_change: "Lower humidity to 55%",
  reason: "VPD too low for stage [alert:abc-123-def]",
  source: "environment_alert",
  plant_id: "plant-1",
};
const ROW_B = {
  id: "aq-2",
  action_type: "feed_calmag",
  suggested_change: "Add CalMag at next feed",
  reason: "Tip burn observed [session:doc-1]",
  source: "ai_doctor",
  plant_id: "plant-2",
};

const LOOKUPS = {
  sourceLabelFor: (r: { source?: string | null }) =>
    r.source === "ai_doctor" ? "AI Doctor" : "Environment Alerts",
  plantsById: {
    "plant-1": { name: "Blue Dream A" },
    "plant-2": { name: "Northern Lights" },
  },
};

describe("normalizeActionSearchQuery", () => {
  it("trims and lower-cases; null/undefined safe", () => {
    expect(normalizeActionSearchQuery("  CalMag ")).toBe("calmag");
    expect(normalizeActionSearchQuery(null)).toBe("");
    expect(normalizeActionSearchQuery(undefined)).toBe("");
  });
});

describe("collectActionSearchFields", () => {
  it("never includes raw back-pointer tokens, IDs, or hidden metadata", () => {
    const fields = collectActionSearchFields(ROW_A, LOOKUPS).join(" | ");
    expect(fields.includes("[alert:")).toBe(false);
    expect(fields.includes("abc-123-def")).toBe(false);
    expect(fields.includes("aq-1")).toBe(false);
    expect(fields.includes("plant-1")).toBe(false);
  });
});

describe("actionMatchesSearch", () => {
  it("empty query matches everything", () => {
    expect(actionMatchesSearch(ROW_A, "")).toBe(true);
    expect(actionMatchesSearch(ROW_A, null)).toBe(true);
  });
  it("matches by plant name (via lookups)", () => {
    expect(actionMatchesSearch(ROW_A, "blue dream", LOOKUPS)).toBe(true);
    expect(actionMatchesSearch(ROW_B, "blue dream", LOOKUPS)).toBe(false);
  });
  it("matches by source label", () => {
    expect(actionMatchesSearch(ROW_B, "ai doctor", LOOKUPS)).toBe(true);
  });
  it("matches by reason summary (back-pointer stripped)", () => {
    expect(actionMatchesSearch(ROW_A, "vpd", LOOKUPS)).toBe(true);
  });
  it("matches by action title / recommendation", () => {
    expect(actionMatchesSearch(ROW_B, "calmag", LOOKUPS)).toBe(true);
  });
  it("does not match by internal UUIDs or back-pointer ids", () => {
    expect(actionMatchesSearch(ROW_A, "abc-123-def", LOOKUPS)).toBe(false);
    expect(actionMatchesSearch(ROW_A, "aq-1", LOOKUPS)).toBe(false);
  });
  it("is case-insensitive and deterministic", () => {
    const a = actionMatchesSearch(ROW_B, "CALMAG", LOOKUPS);
    const b = actionMatchesSearch(ROW_B, "calmag", LOOKUPS);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });
});

describe("actionMatchesTraceFailedFilter", () => {
  it("returns false when no failure or different id", () => {
    expect(actionMatchesTraceFailedFilter(ROW_A, null)).toBe(false);
    expect(
      actionMatchesTraceFailedFilter(ROW_A, { actionId: "other" }),
    ).toBe(false);
  });
  it("returns true when failure matches row id", () => {
    expect(
      actionMatchesTraceFailedFilter(ROW_A, { actionId: "aq-1" }),
    ).toBe(true);
  });
});

describe("applyActionQueueListPipeline", () => {
  it("composes trace filter then search", () => {
    const out = applyActionQueueListPipeline({
      rows: [ROW_A, ROW_B],
      query: "calmag",
      traceFilter: "trace_failed",
      traceFailure: { actionId: "aq-2" },
      lookups: LOOKUPS,
    });
    expect(out.map((r) => r.id)).toEqual(["aq-2"]);
  });
  it("trace filter alone narrows to failed rows", () => {
    const out = applyActionQueueListPipeline({
      rows: [ROW_A, ROW_B],
      query: "",
      traceFilter: "trace_failed",
      traceFailure: { actionId: "aq-1" },
    });
    expect(out.map((r) => r.id)).toEqual(["aq-1"]);
  });
  it("no filter, no query → returns all (copy)", () => {
    const out = applyActionQueueListPipeline({
      rows: [ROW_A, ROW_B],
      query: "",
      traceFilter: "none",
      traceFailure: null,
    });
    expect(out.map((r) => r.id)).toEqual(["aq-1", "aq-2"]);
  });
});
