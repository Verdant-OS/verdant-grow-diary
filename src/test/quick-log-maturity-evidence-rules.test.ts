import { describe, it, expect } from "vitest";
import {
  EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM,
  QUICK_LOG_MATURITY_NOTE_LIMIT,
  buildQuickLogMaturityEvidenceDetails,
  hasQuickLogMaturityEvidence,
  quickLogMaturityEvidenceReasonToMessage,
} from "@/lib/quickLogMaturityEvidenceRules";

const OBSERVED_AT = "2026-06-17T21:00:00.000Z";

function form(overrides = {}) {
  return {
    ...EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM,
    ...overrides,
  };
}

describe("quickLogMaturityEvidenceRules", () => {
  it("returns null details when no evidence exists", () => {
    const result = buildQuickLogMaturityEvidenceDetails({
      form: EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM,
      targetType: "plant",
      observedAt: OBSERVED_AT,
    });

    expect(result).toEqual({ ok: true, details: null });
    expect(hasQuickLogMaturityEvidence(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM)).toBe(false);
  });

  it("builds manual advisory-only maturity evidence details", () => {
    const result = buildQuickLogMaturityEvidenceDetails({
      form: form({
        clearPct: "10",
        cloudyPct: "70",
        amberPct: "20",
        colorNote: "mostly turned",
        growerNote: "watch again tomorrow",
      }),
      targetType: "plant",
      observedAt: OBSERVED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.details).toEqual({
      maturity_evidence: {
        source: "manual",
        evidence_type: "quick_log_maturity_evidence",
        advisory_only: true,
        observed_at: OBSERVED_AT,
        clear_pct: 10,
        cloudy_pct: 70,
        amber_pct: 20,
        color_note: "mostly turned",
        grower_note: "watch again tomorrow",
      },
    });
  });

  it("allows partial percentages without forcing total to 100", () => {
    const result = buildQuickLogMaturityEvidenceDetails({
      form: form({ cloudyPct: "60" }),
      targetType: "plant",
      observedAt: OBSERVED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.details?.maturity_evidence.cloudy_pct).toBe(60);
    expect(result.details?.maturity_evidence.clear_pct).toBeUndefined();
  });

  it("rejects maturity evidence on a tent target", () => {
    const result = buildQuickLogMaturityEvidenceDetails({
      form: form({ growerNote: "late-run check" }),
      targetType: "tent",
      observedAt: OBSERVED_AT,
    });

    expect(result).toEqual({ ok: false, reason: "maturity_evidence_requires_plant_target" });
  });

  it("rejects invalid percentages and long notes", () => {
    expect(
      buildQuickLogMaturityEvidenceDetails({
        form: form({ clearPct: "101" }),
        targetType: "plant",
        observedAt: OBSERVED_AT,
      }),
    ).toEqual({ ok: false, reason: "invalid_clear_pct" });

    expect(
      buildQuickLogMaturityEvidenceDetails({
        form: form({ growerNote: "x".repeat(QUICK_LOG_MATURITY_NOTE_LIMIT + 1) }),
        targetType: "plant",
        observedAt: OBSERVED_AT,
      }),
    ).toEqual({ ok: false, reason: "maturity_note_too_long" });
  });

  it("has operator-safe helper copy", () => {
    expect(quickLogMaturityEvidenceReasonToMessage("maturity_evidence_requires_plant_target")).toContain(
      "plant",
    );
    expect(quickLogMaturityEvidenceReasonToMessage("invalid_amber_pct")).toContain("between 0 and 100");
  });
});
