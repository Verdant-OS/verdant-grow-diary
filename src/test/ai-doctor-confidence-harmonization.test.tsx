/**
 * Render tests for StructuredDiagnosisCard confidence harmonization +
 * Coach wiring through evaluateAiContextSufficiency.
 *
 * Static safety: no automation, no device-control, no auto-queue, no
 * service_role usage in either the component or Coach.tsx.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import StructuredDiagnosisCard from "@/components/StructuredDiagnosisCard";
import {
  CONFIDENCE_CEILING_CAPS,
  CONFIDENCE_LIMITED_COPY,
} from "@/lib/aiDoctorConfidenceRules";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const CARD = readFileSync(
  resolve(ROOT, "src/components/StructuredDiagnosisCard.tsx"),
  "utf8",
);

function base(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    summary: "Mild stress.",
    likelyIssue: "Heat stress",
    confidence: 0.9,
    evidence: ["leaf curl"],
    missingInformation: ["no EC reading"],
    possibleCauses: ["light too close"],
    immediateAction: "Raise the light 10cm.",
    whatNotToDo: ["Do not defoliate"],
    followUp24h: { summary: "Re-check.", checklist: [] },
    recoveryPlan3d: { summary: "Stabilize.", checklist: [] },
    riskLevel: "medium",
    suggestedActions: [
      {
        type: "task",
        title: "Raise light",
        detail: "Raise grow light by 10cm.",
        priority: "medium",
        reason: "Reduces radiant load.",
        approvalRequired: true,
      },
    ],
    ...overrides,
  };
}

describe("StructuredDiagnosisCard — confidence harmonization", () => {
  it("caps displayed confidence when context ceiling is medium", () => {
    render(
      <StructuredDiagnosisCard
        diagnosis={base({ confidence: 0.9 })}
        contextCeiling="medium"
      />,
    );
    const conf = screen.getByTestId("ai-doctor-diagnosis-confidence");
    const expectedPct = Math.round(CONFIDENCE_CEILING_CAPS.medium * 100);
    expect(conf.textContent).toMatch(new RegExp(`${expectedPct}%`));
    expect(conf.getAttribute("data-capped")).toBe("true");
    expect(conf.getAttribute("data-raw-confidence")).toBe("0.9");
  });

  it("preserves confidence below the context ceiling", () => {
    render(
      <StructuredDiagnosisCard
        diagnosis={base({ confidence: 0.4 })}
        contextCeiling="medium"
      />,
    );
    const conf = screen.getByTestId("ai-doctor-diagnosis-confidence");
    expect(conf.textContent).toMatch(/40%/);
    expect(conf.getAttribute("data-capped")).toBe("false");
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-confidence-limited-copy"),
    ).toBeNull();
  });

  it("renders the confidence-limited copy when capped", () => {
    render(
      <StructuredDiagnosisCard
        diagnosis={base({ confidence: 0.95 })}
        contextCeiling="low"
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-confidence-limited-copy")
        .textContent,
    ).toBe(CONFIDENCE_LIMITED_COPY);
  });

  it("injects missing-information guidance when cap drops confidence below threshold", () => {
    render(
      <StructuredDiagnosisCard
        diagnosis={base({ confidence: 0.95, missingInformation: [] })}
        contextCeiling="low"
      />,
    );
    const missing = screen.getByTestId("ai-doctor-diagnosis-missing-info");
    expect(missing.textContent ?? "").toMatch(/fresh photo|sensor snapshot/i);
  });

  it("still requires manual click for suggested actions", () => {
    const onAdd = vi.fn();
    render(
      <StructuredDiagnosisCard
        diagnosis={base()}
        contextCeiling="medium"
        onAddToQueue={onAdd}
      />,
    );
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-suggested-action-0-add-button"),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("Coach — passes context ceiling to StructuredDiagnosisCard", () => {
  it("wires contextSufficiency.confidenceCeiling into the card", () => {
    expect(COACH).toMatch(/contextCeiling=\{contextSufficiency\.confidenceCeiling\}/);
  });

  it("still renders the legacy analysis surface", () => {
    expect(COACH).toMatch(/coach-displayed-confidence/);
  });
});

describe("Static safety", () => {
  it("card does not reference automation, device-control, service_role, or auto-queue", () => {
    expect(CARD).not.toMatch(/service_role/i);
    expect(CARD).not.toMatch(/mqtt|home[-\s]?assistant|relay|smart plug/i);
    expect(CARD).not.toMatch(/auto[-\s]?(execute|queue|run)/i);
  });

  it("rules helper is pure (no fetch, supabase, or window)", () => {
    const rules = readFileSync(
      resolve(ROOT, "src/lib/aiDoctorConfidenceRules.ts"),
      "utf8",
    );
    expect(rules).not.toMatch(/fetch\(|supabase|service_role|window\./);
  });
});
