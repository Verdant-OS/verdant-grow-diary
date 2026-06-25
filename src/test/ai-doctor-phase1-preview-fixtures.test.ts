/**
 * AI Doctor Phase 1 Preview Fixtures — unit tests.
 *
 * Asserts the static case library is well-formed and safe:
 *   - 7 cases with unique ids and required metadata
 *   - All cases are low confidence with overdiagnosis warning + automation warning
 *   - Demo/CSV case carries the source-truth warning and has_demo_or_csv_only
 *   - Stale/invalid case carries the source-truth warning and has_stale_or_invalid
 *   - No case claims live data or recent trustworthy sensor data
 *   - Action Queue panel is advisory + pending_approval with a disabled reason
 *   - No forbidden device/control/certainty copy in any case
 */
import { describe, it, expect } from "vitest";
import {
  AI_DOCTOR_PHASE1_PREVIEW_CASES,
  AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID,
  getAiDoctorPhase1PreviewCase,
} from "@/lib/aiDoctorPhase1PreviewFixtures";

const FORBIDDEN_COPY = [
  "approve",
  "execute",
  "run command",
  "send command",
  "control device",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

const EXPECTED_IDS = [
  "blurry-photo-only",
  "yellowing-no-history",
  "drooping-no-rootzone",
  "spotting-no-closeups",
  "stale-invalid-only",
  "demo-csv-only",
  "conflicting-weak-signals",
];

describe("aiDoctorPhase1PreviewFixtures", () => {
  it("exposes 7 cases", () => {
    expect(AI_DOCTOR_PHASE1_PREVIEW_CASES.length).toBe(7);
  });

  it("covers all required scenario ids", () => {
    const ids = AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => c.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it("has unique ids", () => {
    const ids = AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("default case id resolves to a real case", () => {
    const fallback = getAiDoctorPhase1PreviewCase(
      AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID,
    );
    expect(fallback).toBeTruthy();
    expect(fallback.id).toBe(AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID);
  });

  it("unknown id falls back to the first case", () => {
    const fallback = getAiDoctorPhase1PreviewCase("does-not-exist");
    expect(fallback.id).toBe(AI_DOCTOR_PHASE1_PREVIEW_CASES[0].id);
  });

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id, c] as const))(
    "case %s has required metadata and conservative view model",
    (_, c) => {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.sourceMode).toBeTruthy();
      expect(c.viewModel.summaryCard.confidence_label.toLowerCase()).toContain(
        "low",
      );
      expect(c.viewModel.summaryCard.risk_level).toBe("low");
      expect(c.viewModel.debugMeta.displayed_confidence_level).toBe("low");
      expect(c.viewModel.debugMeta.has_live_data).toBe(false);
      expect(c.viewModel.debugMeta.source_counts.live_count).toBe(0);
      expect(
        c.viewModel.debugMeta.source_counts.has_recent_trustworthy_sensor_data,
      ).toBe(false);
      expect(c.viewModel.safetyPanel.overdiagnosis_warning).toMatch(
        /avoid treating this as a certain diagnosis/i,
      );
      expect(c.viewModel.safetyPanel.automation_warning).toMatch(
        /does not control equipment/i,
      );
      expect(c.viewModel.actionQueuePanel.should_show).toBe(true);
      expect(c.viewModel.actionQueuePanel.status).toBe("pending_approval");
      expect(c.viewModel.actionQueuePanel.action_type).toBe("advisory");
      expect(c.viewModel.actionQueuePanel.disabled_reason).toBeTruthy();
    },
  );

  it("demo-csv-only case carries source-truth warning and has_demo_or_csv_only", () => {
    const c = getAiDoctorPhase1PreviewCase("demo-csv-only");
    expect(c.viewModel.debugMeta.has_demo_or_csv_only).toBe(true);
    expect(c.viewModel.safetyPanel.source_truth_warning ?? "").toMatch(
      /demo or imported/i,
    );
  });

  it("stale-invalid-only case carries source-truth warning and has_stale_or_invalid", () => {
    const c = getAiDoctorPhase1PreviewCase("stale-invalid-only");
    expect(c.viewModel.debugMeta.has_stale_or_invalid).toBe(true);
    expect(c.viewModel.safetyPanel.source_truth_warning ?? "").toMatch(
      /stale or invalid/i,
    );
  });

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id, c] as const))(
    "case %s contains no forbidden device-control / overconfidence copy",
    (_, c) => {
      const text = JSON.stringify(c.viewModel).toLowerCase();
      for (const forbidden of FORBIDDEN_COPY) {
        expect(text.includes(forbidden)).toBe(false);
      }
    },
  );
});
