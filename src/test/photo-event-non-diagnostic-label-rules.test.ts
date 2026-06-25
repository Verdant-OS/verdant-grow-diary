import { describe, it, expect, vi } from "vitest";
import {
  PHOTO_NON_DIAGNOSTIC_LABEL,
  PHOTO_NON_DIAGNOSTIC_TESTID,
  containsBannedDiagnosticWording,
  getPhotoNonDiagnosticLabel,
  hasLinkedAiDoctorResult,
  shouldShowPhotoNonDiagnosticLabel,
} from "@/lib/photoEventNonDiagnosticLabelRules";

describe("photoEventNonDiagnosticLabelRules", () => {
  describe("shouldShowPhotoNonDiagnosticLabel", () => {
    it("shows the label for a photo-only entry with no AI Doctor link", () => {
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: true,
          details: { event_type: "photo" },
        }),
      ).toBe(true);
    });

    it("does NOT show the label when there is no photo", () => {
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: false,
          details: {},
        }),
      ).toBe(false);
    });

    it("does NOT show the label when a saved AI Doctor session link exists (req 4)", () => {
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: true,
          details: { ai_doctor_session_id: "sess_123" },
        }),
      ).toBe(false);
    });

    it("does NOT show the label when a camelCase AI Doctor result link exists", () => {
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: true,
          details: { aiDoctorResultId: "res_42" },
        }),
      ).toBe(false);
    });

    it("treats null/undefined/blank details as no link → still shows", () => {
      expect(
        shouldShowPhotoNonDiagnosticLabel({ hasPhoto: true, details: null }),
      ).toBe(true);
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: true,
          details: undefined,
        }),
      ).toBe(true);
      expect(
        shouldShowPhotoNonDiagnosticLabel({
          hasPhoto: true,
          details: { ai_doctor_session_id: "   " },
        }),
      ).toBe(true);
    });
  });

  describe("hasLinkedAiDoctorResult", () => {
    it("recognizes snake_case and camelCase id fields", () => {
      expect(hasLinkedAiDoctorResult({ ai_doctor_session_id: "x" })).toBe(true);
      expect(hasLinkedAiDoctorResult({ aiDoctorSessionId: "x" })).toBe(true);
      expect(hasLinkedAiDoctorResult({ ai_doctor_result_id: "x" })).toBe(true);
      expect(hasLinkedAiDoctorResult({ aiDoctorResultId: "x" })).toBe(true);
    });

    it("rejects non-object input safely", () => {
      expect(hasLinkedAiDoctorResult(null)).toBe(false);
      expect(hasLinkedAiDoctorResult(undefined)).toBe(false);
      expect(hasLinkedAiDoctorResult("string")).toBe(false);
      expect(hasLinkedAiDoctorResult(123)).toBe(false);
    });
  });

  describe("label copy", () => {
    it("matches the spec string exactly", () => {
      expect(getPhotoNonDiagnosticLabel()).toBe(
        "Visual record · no AI analysis",
      );
      expect(PHOTO_NON_DIAGNOSTIC_LABEL).toBe(
        "Visual record · no AI analysis",
      );
    });

    it("avoids all banned diagnostic wording (req 5)", () => {
      expect(containsBannedDiagnosticWording(PHOTO_NON_DIAGNOSTIC_LABEL)).toBe(
        false,
      );
    });

    it("flags banned wording when present (sanity)", () => {
      expect(containsBannedDiagnosticWording("Photo analyzed by AI")).toBe(
        true,
      );
      expect(containsBannedDiagnosticWording("Diagnosis confirmed")).toBe(
        true,
      );
    });

    it("exposes a stable test id for UI assertions", () => {
      expect(PHOTO_NON_DIAGNOSTIC_TESTID).toBe(
        "photo-event-non-diagnostic-label",
      );
    });
  });

  describe("safety", () => {
    it("invoking the rule never triggers AI / network side effects (req: no AI call)", () => {
      // The pure helpers must not touch globalThis.fetch. We assert by
      // spying on fetch and confirming zero invocations.
      const spy = vi
        .spyOn(globalThis, "fetch" as never)
        .mockImplementation((() => {
          throw new Error("fetch must not be called from pure rules");
        }) as never);
      shouldShowPhotoNonDiagnosticLabel({
        hasPhoto: true,
        details: { ai_doctor_session_id: null },
      });
      hasLinkedAiDoctorResult({ ai_doctor_session_id: "x" });
      getPhotoNonDiagnosticLabel();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
