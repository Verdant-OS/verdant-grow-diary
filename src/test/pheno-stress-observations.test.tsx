/**
 * Persisted PHENOHUNT stress observations — validation, persistence hook,
 * diary selector wiring, summary aggregation, and safety scan.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { validatePhenoStressDraft } from "@/lib/pheno/phenoStressObservationValidation";
import {
  summarizeStressForCandidate,
  emptyStressSummary,
} from "@/lib/pheno/phenoStressSummary";
import type { PhenoStressObservationRow } from "@/lib/pheno/phenoStressObservationsApi";
import PhenoStressTestingSection from "@/components/PhenoStressTestingSection";
import PhenoStressSummaryCard from "@/components/PhenoStressSummaryCard";

const VALID_BASE = {
  plantId: "cand-1",
  stressFactor: "Drought",
  status: "observed",
  startDate: "2026-07-01",
  endDate: "2026-07-05",
  intensity: "low",
  recommendation: "watch",
  plantResponse: "Wilted then recovered.",
  recoveryNotes: "",
  yieldImpactNotes: "",
  diseasePestNotes: "",
  linkedDiaryEntryId: "",
  notes: "",
} as const;

describe("validatePhenoStressDraft", () => {
  it("passes for a complete observed draft", () => {
    expect(validatePhenoStressDraft(VALID_BASE).valid).toBe(true);
  });

  it("flags observed entries missing end date and plant response", () => {
    const r = validatePhenoStressDraft({
      ...VALID_BASE,
      endDate: "",
      plantResponse: "",
    });
    expect(r.valid).toBe(false);
    expect(r.issues.endDate).toBeTruthy();
    expect(r.issues.plantResponse).toBeTruthy();
  });

  it("planned entries do not require an end date", () => {
    const r = validatePhenoStressDraft({
      ...VALID_BASE,
      status: "planned",
      endDate: "",
      plantResponse: "",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects end date before start date", () => {
    const r = validatePhenoStressDraft({
      ...VALID_BASE,
      startDate: "2026-07-10",
      endDate: "2026-07-01",
    });
    expect(r.valid).toBe(false);
    expect(r.issues.endDate).toMatch(/on or after/i);
  });

  it("requires intensity, recommendation, and candidate", () => {
    const r = validatePhenoStressDraft({
      ...VALID_BASE,
      plantId: "",
      intensity: "",
      recommendation: "",
    });
    expect(r.issues.plantId).toBeTruthy();
    expect(r.issues.intensity).toBeTruthy();
    expect(r.issues.recommendation).toBeTruthy();
  });
});

describe("summarizeStressForCandidate", () => {
  function row(overrides: Partial<PhenoStressObservationRow>): PhenoStressObservationRow {
    return {
      id: overrides.id ?? "row-1",
      userId: "u-1",
      huntId: "h-1",
      plantId: overrides.plantId ?? "cand-1",
      stressFactor: overrides.stressFactor ?? "Drought",
      status: overrides.status ?? "observed",
      startDate: overrides.startDate ?? "2026-07-01",
      endDate: overrides.endDate ?? "2026-07-05",
      intensity: overrides.intensity ?? "moderate",
      plantResponse: overrides.plantResponse ?? "Recovered fully",
      recoveryNotes: overrides.recoveryNotes ?? null,
      yieldImpactNotes: overrides.yieldImpactNotes ?? null,
      diseasePestNotes: overrides.diseasePestNotes ?? null,
      recommendation: overrides.recommendation ?? "keep",
      linkedDiaryEntryId: overrides.linkedDiaryEntryId ?? null,
      notes: overrides.notes ?? null,
      createdAt: overrides.createdAt ?? "2026-07-06T00:00:00Z",
      updatedAt: overrides.updatedAt ?? "2026-07-06T00:00:00Z",
    };
  }

  it("counts planned vs observed and reflects latest factor, intensity, recommendation", () => {
    const rows = [
      row({ id: "r1", status: "planned", createdAt: "2026-07-01T00:00:00Z" }),
      row({ id: "r2", status: "planned", createdAt: "2026-07-02T00:00:00Z" }),
      row({
        id: "r3",
        status: "observed",
        stressFactor: "Pests",
        intensity: "high",
        recommendation: "reject",
        linkedDiaryEntryId: "diary-1",
        createdAt: "2026-07-06T00:00:00Z",
      }),
    ];
    const s = summarizeStressForCandidate("cand-1", rows);
    expect(s.plannedCount).toBe(2);
    expect(s.observedCount).toBe(1);
    expect(s.mostRecentFactor).toBe("Pests");
    expect(s.mostRecentIntensity).toBe("high");
    expect(s.currentRecommendation).toBe("reject");
    expect(s.hasDiaryEvidence).toBe(true);
    expect(s.keyNotesPreview).toContain("Recovered");
  });

  it("returns empty summary when no rows for candidate", () => {
    expect(summarizeStressForCandidate("nope", [])).toEqual(
      emptyStressSummary("nope"),
    );
  });
});

describe("PhenoStressTestingSection — persistence + diary + summary", () => {
  it("blocks submit and shows inline errors when required fields are missing", async () => {
    const onPersist = vi.fn().mockResolvedValue(true);
    render(
      <PhenoStressTestingSection
        candidates={[{ candidateId: "c-1", candidateLabel: "Cand 1" }]}
        onPersist={onPersist}
      />,
    );
    fireEvent.click(screen.getByTestId("pheno-stress-record"));
    // Candidate not chosen, status defaults to "observed" — end date + response missing.
    expect(screen.getByTestId("pheno-stress-error-candidate")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-stress-error-end")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-stress-error-response")).toBeInTheDocument();
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("calls onPersist with a valid observed draft and links a diary entry", async () => {
    const onPersist = vi.fn().mockResolvedValue(true);
    render(
      <PhenoStressTestingSection
        candidates={[{ candidateId: "c-1", candidateLabel: "Cand 1" }]}
        diaryOptions={[
          { id: "diary-42", label: "2026-07-01 · plant abcd · \"leaf droop noted\"" },
        ]}
        onPersist={onPersist}
      />,
    );

    fireEvent.change(screen.getByTestId("pheno-stress-candidate"), {
      target: { value: "c-1" },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-start"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-end"), {
      target: { value: "2026-07-05" },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-response"), {
      target: { value: "Wilted then recovered." },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-diary-select"), {
      target: { value: "diary-42" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("pheno-stress-record"));
    });

    expect(onPersist).toHaveBeenCalledTimes(1);
    const draft = onPersist.mock.calls[0][0];
    expect(draft.plantId).toBe("c-1");
    expect(draft.status).toBe("observed");
    expect(draft.startDate).toBe("2026-07-01");
    expect(draft.endDate).toBe("2026-07-05");
    expect(draft.plantResponse).toBe("Wilted then recovered.");
    expect(draft.linkedDiaryEntryId).toBe("diary-42");
    expect(screen.getByTestId("pheno-stress-saved")).toBeInTheDocument();
  });

  it("renders per-candidate summary cards with counts, intensity, and notes", () => {
    const summary = summarizeStressForCandidate("cand-1", [
      {
        id: "r1",
        userId: "u",
        huntId: "h",
        plantId: "cand-1",
        stressFactor: "Drought",
        status: "planned",
        startDate: "2026-07-01",
        endDate: null,
        intensity: "low",
        plantResponse: null,
        recoveryNotes: null,
        yieldImpactNotes: null,
        diseasePestNotes: null,
        recommendation: "watch",
        linkedDiaryEntryId: null,
        notes: "prep watering schedule",
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z",
      },
      {
        id: "r2",
        userId: "u",
        huntId: "h",
        plantId: "cand-1",
        stressFactor: "Pests",
        status: "observed",
        startDate: "2026-07-02",
        endDate: "2026-07-04",
        intensity: "high",
        plantResponse: "Yellowing on lower fans",
        recoveryNotes: null,
        yieldImpactNotes: null,
        diseasePestNotes: null,
        recommendation: "reject",
        linkedDiaryEntryId: "diary-9",
        notes: null,
        createdAt: "2026-07-05T00:00:00Z",
        updatedAt: "2026-07-05T00:00:00Z",
      },
    ]);

    render(<PhenoStressSummaryCard summary={summary} candidateLabel="Cand 1" />);
    const card = screen.getByTestId("pheno-stress-summary-cand-1");
    expect(card.getAttribute("data-planned")).toBe("1");
    expect(card.getAttribute("data-observed")).toBe("1");
    expect(card.getAttribute("data-intensity")).toBe("high");
    expect(card.getAttribute("data-recommendation")).toBe("reject");
    expect(card.getAttribute("data-has-diary")).toBe("true");
    expect(
      screen.getByTestId("pheno-stress-summary-notes-cand-1").textContent,
    ).toMatch(/Yellowing/);
  });
});

describe("pheno stress observations — safety scan", () => {
  it("introduces no AI, Action Queue, automation, device-control, or sensor-ingest code", () => {
    const files = [
      "src/lib/pheno/phenoStressObservationValidation.ts",
      "src/lib/pheno/phenoStressObservationsApi.ts",
      "src/lib/pheno/phenoStressSummary.ts",
      "src/hooks/usePhenoStressObservations.ts",
      "src/components/PhenoStressSummaryCard.tsx",
      "src/components/PhenoStressTestingSection.tsx",
    ].map((p) => readFileSync(resolve(process.cwd(), p), "utf-8"));

    const forbidden = [
      /action[_-]?queue/i,
      /queueAction|enqueue|dispatchAction/,
      /device[_-]?control|sendCommand|switchRelay|controlDevice/i,
      /openai|anthropic|lovable-ai|invokeAi|callModel|aiGateway/i,
      /sensor[_-]?ingest|ingestReading|writeSensor/i,
    ];
    for (const src of files) {
      for (const re of forbidden) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
