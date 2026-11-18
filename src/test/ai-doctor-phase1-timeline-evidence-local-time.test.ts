/**
 * AI Doctor evidence on the Timeline showed its saved time in UTC
 * ("Nov 18, 2026, 01:16 UTC") for a grower in Chicago, where it was the
 * evening of Nov 17 (core loop walk, 2026-11-18). Given the viewer's zone,
 * the saved time now reads in that zone with its short zone name. Without a
 * zone, or with an unknown one, it stays the labelled UTC time.
 */
import { describe, expect, it } from "vitest";
import {
  buildAiDoctorPhase1TimelineEvidenceViewModel,
  formatAiDoctorPhase1TimelineSavedAt,
} from "@/lib/aiDoctorPhase1TimelineEvidenceViewModel";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";

const SAVED_AT = "2026-11-18T01:16:00.000Z";

describe("formatAiDoctorPhase1TimelineSavedAt", () => {
  it("shows the saved time in the viewer's zone with its zone name", () => {
    const label = formatAiDoctorPhase1TimelineSavedAt(SAVED_AT, {
      timeZone: "America/Chicago",
    });
    expect(label).toContain("Nov 17, 2026");
    expect(label).toContain("19:16");
    expect(label).toContain("CST");
    expect(label).not.toContain("UTC");
  });

  it("keeps the labelled UTC time when no zone is given", () => {
    expect(formatAiDoctorPhase1TimelineSavedAt(SAVED_AT)).toBe("Nov 18, 2026, 01:16 UTC");
    expect(formatAiDoctorPhase1TimelineSavedAt(SAVED_AT, { timeZone: null })).toBe(
      "Nov 18, 2026, 01:16 UTC",
    );
  });

  it("falls back to the labelled UTC time for an unknown zone", () => {
    expect(formatAiDoctorPhase1TimelineSavedAt(SAVED_AT, { timeZone: "Not/AZone" })).toBe(
      "Nov 18, 2026, 01:16 UTC",
    );
  });

  it("still returns null for a missing or unparseable time", () => {
    expect(formatAiDoctorPhase1TimelineSavedAt(null, { timeZone: "America/Chicago" })).toBeNull();
    expect(
      formatAiDoctorPhase1TimelineSavedAt("not a date", { timeZone: "America/Chicago" }),
    ).toBeNull();
  });
});

describe("buildAiDoctorPhase1TimelineEvidenceViewModel time zone", () => {
  it("passes the viewer's zone through to the saved line", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel(
      {
        id: "entry-1",
        plant_id: "plant-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        occurred_at: SAVED_AT,
        entry_at: SAVED_AT,
        details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND, result: { summary: "Test summary" } },
      },
      { timeZone: "America/Chicago" },
    );
    expect(vm).not.toBeNull();
    expect(vm!.metadataLine).toContain("19:16");
    expect(vm!.metadataLine).not.toContain("UTC");
  });
});
