/**
 * PHENOHUNT sampling report + comparison tools.
 *
 * Covers pure helpers (summaries, grouping, history order, PDF HTML content)
 * and the workspace tools UI (summary table, side-by-side comparison,
 * history panel, PDF export button). Also asserts no AI, Action Queue,
 * automation, device-control, or sensor-ingest code is introduced.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  PhenoSamplingProvider,
  usePhenoSampling,
  type PhenoSamplingSubmission,
} from "@/context/PhenoSamplingContext";
import PhenoSamplingWorkspaceTools from "@/components/PhenoSamplingWorkspaceTools";
import {
  summarizeByCandidate,
  historyForCandidate,
  groupByCandidate,
  buildCandidateReportHtml,
  PHENO_REPORT_SAFETY_LINES,
} from "@/lib/pheno/phenoSamplingReport";
import {
  PHENO_SAMPLING_HEADING,
  PHENO_SAMPLING_INTRO_PARAGRAPHS,
} from "@/constants/phenoProductSamplingCopy";

function sub(
  overrides: Partial<PhenoSamplingSubmission> & {
    candidateId: string;
    testerCode: string;
    submittedAt: string;
    overall: number | null;
  },
): PhenoSamplingSubmission {
  return {
    id: `${overrides.candidateId}-${overrides.testerCode}-${overrides.submittedAt}`,
    sampleFormat: "Pre-rolled joint (recommended)",
    dryHit: "gas, cream",
    flavor: "citrus",
    burnQuality: "Even",
    ashColor: "Light gray / white",
    oilRing: "Moderate",
    effect: "euphoric",
    notes: "smooth",
    ...overrides,
  };
}

const FIXTURES: readonly PhenoSamplingSubmission[] = [
  sub({
    candidateId: "PH-1",
    testerCode: "T-01",
    submittedAt: "2026-07-07T10:00:00.000Z",
    overall: 7,
  }),
  sub({
    candidateId: "PH-1",
    testerCode: "T-02",
    submittedAt: "2026-07-07T11:00:00.000Z",
    overall: 9,
  }),
  sub({
    candidateId: "PH-2",
    testerCode: "T-01",
    submittedAt: "2026-07-07T12:00:00.000Z",
    overall: 6,
  }),
];

function Seed({ rows }: { rows: readonly PhenoSamplingSubmission[] }) {
  const { recordSubmission } = usePhenoSampling();
  // Push fixtures once on mount so downstream components render with data.
  useSeed(rows, recordSubmission);
  return null;
}

function useSeed(
  rows: readonly PhenoSamplingSubmission[],
  record: (
    input: Omit<PhenoSamplingSubmission, "id" | "submittedAt"> & {
      submittedAt?: string;
    },
  ) => PhenoSamplingSubmission,
) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const seededRef = (Seed as unknown as { seeded?: boolean }).seeded;
  if (!seededRef) {
    (Seed as unknown as { seeded?: boolean }).seeded = true;
    for (const r of rows) {
      const { id: _id, ...rest } = r;
      record(rest);
    }
  }
}

function renderWithProvider(candidates: readonly { candidateId: string }[]) {
  (Seed as unknown as { seeded?: boolean }).seeded = false;
  return render(
    <PhenoSamplingProvider>
      <Seed rows={FIXTURES} />
      <PhenoSamplingWorkspaceTools candidates={candidates} />
    </PhenoSamplingProvider>,
  );
}

describe("pheno sampling — pure report helpers", () => {
  it("summarizeByCandidate computes averages and submission counts", () => {
    const rows = summarizeByCandidate(FIXTURES);
    const ph1 = rows.find((r) => r.candidateId === "PH-1")!;
    const ph2 = rows.find((r) => r.candidateId === "PH-2")!;
    expect(ph1.submissions).toBe(2);
    expect(ph1.averageOverall).toBe(8); // (7 + 9) / 2
    expect(ph2.submissions).toBe(1);
    expect(ph2.averageOverall).toBe(6);
  });

  it("groupByCandidate returns only the requested candidate's rows", () => {
    const rows = groupByCandidate(FIXTURES, "PH-1");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.candidateId === "PH-1")).toBe(true);
  });

  it("historyForCandidate orders submissions newest first", () => {
    const hist = historyForCandidate(FIXTURES, "PH-1");
    expect(hist.map((h) => h.submittedAt)).toEqual([
      "2026-07-07T11:00:00.000Z",
      "2026-07-07T10:00:00.000Z",
    ]);
  });

  it("PDF report HTML includes sampling copy, all fields, and safety wording", () => {
    const html = buildCandidateReportHtml(
      { candidateId: "PH-1", candidateLabel: "Candidate One" },
      FIXTURES,
    );
    // Sampling copy
    expect(html).toContain(PHENO_SAMPLING_HEADING);
    for (const p of PHENO_SAMPLING_INTRO_PARAGRAPHS) {
      // Escaped apostrophes in copy — compare on unescaped substrings.
      const excerpt = p.slice(0, 40);
      expect(html.replace(/&#39;/g, "'")).toContain(excerpt);
    }
    // Candidate identity
    expect(html).toContain("PH-1");
    expect(html).toContain("Candidate One");
    // All tester feedback field labels
    for (const label of [
      "Sample format",
      "Dry hit aroma notes",
      "Flavor notes",
      "Burn quality",
      "Ash color",
      "Oil ring observation",
      "Effect notes",
      "Overall rating",
      "Freeform notes",
    ]) {
      expect(html).toContain(label);
    }
    // Tester submissions with timestamps
    expect(html).toContain("T-01");
    expect(html).toContain("T-02");
    expect(html).toContain("2026-07-07T10:00:00.000Z");
    // Safety wording
    for (const line of PHENO_REPORT_SAFETY_LINES) {
      expect(html).toContain(line);
    }
  });
});

describe("PhenoSamplingWorkspaceTools", () => {
  it("renders a rating summary with correct averages and counts", () => {
    renderWithProvider([{ candidateId: "PH-1" }, { candidateId: "PH-2" }]);
    const ph1Row = screen.getByTestId("pheno-summary-row-PH-1");
    expect(ph1Row.getAttribute("data-count")).toBe("2");
    expect(ph1Row.getAttribute("data-average")).toBe("8");
    const ph2Row = screen.getByTestId("pheno-summary-row-PH-2");
    expect(ph2Row.getAttribute("data-count")).toBe("1");
    expect(ph2Row.getAttribute("data-average")).toBe("6");
  });

  it("side-by-side comparison groups feedback by candidate ID", () => {
    renderWithProvider([{ candidateId: "PH-1" }, { candidateId: "PH-2" }]);
    fireEvent.change(screen.getByTestId("pheno-sampling-focus-candidate"), {
      target: { value: "PH-1" },
    });
    const compare = screen.getByTestId("pheno-sampling-comparison");
    expect(compare.getAttribute("data-candidate")).toBe("PH-1");
    // Both PH-1 testers appear as columns.
    expect(within(compare).getByText("T-01")).toBeInTheDocument();
    expect(within(compare).getByText("T-02")).toBeInTheDocument();
    // PH-2's tester should NOT appear in the PH-1 comparison.
    expect(within(compare).queryAllByText("T-01")).toHaveLength(1);
    // Required comparison fields are present.
    for (const key of ["dryHit", "burnQuality", "ashColor", "oilRing", "effect", "flavor", "overall"]) {
      expect(within(compare).getByTestId(`pheno-compare-row-${key}`)).toBeInTheDocument();
    }
  });

  it("history panel renders submissions in timestamp order (newest first)", () => {
    renderWithProvider([{ candidateId: "PH-1" }]);
    fireEvent.change(screen.getByTestId("pheno-sampling-focus-candidate"), {
      target: { value: "PH-1" },
    });
    const history = screen.getByTestId("pheno-sampling-history");
    const items = within(history).getAllByTestId(/^pheno-history-row-/);
    const timestamps = items.map((el) => el.getAttribute("data-submitted-at"));
    const sorted = [...timestamps].sort().reverse();
    expect(timestamps).toEqual(sorted);
    expect(timestamps[0]).toBe("2026-07-07T11:00:00.000Z");
  });

  it("PDF export button opens a report window with the sampling report HTML", () => {
    renderWithProvider([{ candidateId: "PH-1" }]);
    fireEvent.change(screen.getByTestId("pheno-sampling-focus-candidate"), {
      target: { value: "PH-1" },
    });

    const doc = {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ document: doc } as unknown as Window);

    fireEvent.click(screen.getByTestId("pheno-sampling-export-pdf"));

    expect(openSpy).toHaveBeenCalled();
    expect(doc.write).toHaveBeenCalledTimes(1);
    const written = String(doc.write.mock.calls[0][0]);
    expect(written).toContain(PHENO_SAMPLING_HEADING);
    for (const line of PHENO_REPORT_SAFETY_LINES) {
      expect(written).toContain(line);
    }
    openSpy.mockRestore();
  });
});

describe("pheno sampling — safety scan", () => {
  it("introduces no AI, Action Queue, automation, device-control, or sensor-ingest code", () => {
    const files = [
      "src/context/PhenoSamplingContext.tsx",
      "src/lib/pheno/phenoSamplingReport.ts",
      "src/components/PhenoSamplingWorkspaceTools.tsx",
    ].map((p) => readFileSync(resolve(process.cwd(), p), "utf-8"));

    const forbidden = [
      /action[_-]?queue/i,
      /queueAction|enqueue|dispatchAction/,
      /device[_-]?control|sendCommand|switchRelay|controlDevice/i,
      /openai|anthropic|lovable-ai|invokeAi|callModel|aiGateway/i,
      /sensor[_-]?ingest|ingestReading|writeSensor/i,
      /supabase\.(from|rpc|functions)/,
    ];
    for (const src of files) {
      for (const re of forbidden) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
