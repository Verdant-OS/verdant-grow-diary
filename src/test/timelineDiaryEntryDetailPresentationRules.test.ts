import { describe, expect, it } from "vitest";
import {
  HIDDEN_DIARY_DETAIL_KEYS,
  isFullySuppressedTimelineDetail,
  presentTimelineDiaryEntryDetails,
} from "@/lib/timelineDiaryEntryDetailPresentationRules";

describe("presentTimelineDiaryEntryDetails", () => {
  it("returns empty presentation for null/undefined/non-object details", () => {
    expect(presentTimelineDiaryEntryDetails(null, "fahrenheit")).toEqual({
      detailLines: [],
      extra: [],
    });
    expect(presentTimelineDiaryEntryDetails(undefined, "fahrenheit")).toEqual({
      detailLines: [],
      extra: [],
    });
    expect(presentTimelineDiaryEntryDetails("a string", "fahrenheit")).toEqual({
      detailLines: [],
      extra: [],
    });
    expect(presentTimelineDiaryEntryDetails(["array"], "fahrenheit")).toEqual({
      detailLines: [],
      extra: [],
    });
  });

  it("suppresses a Pheno evidence receipt entirely — no structured lines, no raw chips", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "observation",
        kind: "pheno_evidence_receipt",
        stage: "seedling",
        source: "manual",
        hunt_id: "9540a3f2-10e9-4815-ac50-e7ae892babbd",
        evidence_goal: "stretch",
        evidence_only: true,
        device_control: false,
        receipt_version: 1,
        automatic_selection: false,
        action_queue_created: false,
      },
      "fahrenheit",
    );
    expect(result).toEqual({ detailLines: [], extra: [] });
  });

  it("suppresses everything when the caller passes suppress: true (learning-loop / readiness-check rows)", () => {
    const result = presentTimelineDiaryEntryDetails(
      { event_type: "action_followup", action_queue_id: "aq-1", note: "anything" },
      "fahrenheit",
      { suppress: true },
    );
    expect(result).toEqual({ detailLines: [], extra: [] });
  });

  it("hides Quick Log v2 companion-row plumbing keys even when non-null", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "observation",
        quick_log_version: 2,
        linked_grow_event_id: "bf0a684e-a96e-472c-af8f-e38a54a8332c",
        photo_url: "owner/real-photo.jpg",
      },
      "fahrenheit",
    );
    expect(result.extra).toEqual([]);
  });

  it("drops any null-valued key from the raw fallback outright", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "observation",
        feeding: null,
        watering: null,
        photo_url: null,
        quick_log_version: 2,
        linked_grow_event_id: "bf0a684e-a96e-472c-af8f-e38a54a8332c",
      },
      "fahrenheit",
    );
    expect(result.extra).toEqual([]);
  });

  it("hides every key already in HIDDEN_DIARY_DETAIL_KEYS", () => {
    const details = Object.fromEntries(
      [...HIDDEN_DIARY_DETAIL_KEYS].map((key) => [key, `value-for-${key}`]),
    );
    const result = presentTimelineDiaryEntryDetails(details, "fahrenheit");
    expect(result.extra).toEqual([]);
  });

  it("still surfaces a genuinely unrecognized, non-null key as a last-resort raw chip", () => {
    const result = presentTimelineDiaryEntryDetails(
      { event_type: "observation", some_future_field: "abc" },
      "fahrenheit",
    );
    expect(result.extra).toEqual([["some_future_field", "abc"]]);
  });

  it("renders a structured Quick Log activity field as a labeled line, not a raw chip", () => {
    const result = presentTimelineDiaryEntryDetails(
      { event_type: "training", technique: "topping" },
      "fahrenheit",
    );
    expect(result.detailLines).toEqual([
      { key: "technique", label: "Technique", value: "Topping" },
    ]);
    expect(result.extra.some(([k]) => k === "technique")).toBe(false);
  });
});

describe("isFullySuppressedTimelineDetail", () => {
  it("returns true when suppress flag is passed regardless of details", () => {
    expect(isFullySuppressedTimelineDetail(null, true)).toBe(true);
    expect(isFullySuppressedTimelineDetail({ kind: "anything" }, true)).toBe(true);
  });

  it("returns true only for a recognized suppressed kind", () => {
    expect(isFullySuppressedTimelineDetail({ kind: "pheno_evidence_receipt" })).toBe(true);
    expect(isFullySuppressedTimelineDetail({ kind: "something_else" })).toBe(false);
    expect(isFullySuppressedTimelineDetail(null)).toBe(false);
    expect(isFullySuppressedTimelineDetail({})).toBe(false);
  });
});
