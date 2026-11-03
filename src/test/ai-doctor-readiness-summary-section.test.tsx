/**
 * PlantDetailAiDoctorReadinessSection — one summary, C visible, collapsed
 * provenance holding F, A, B and D. Spec: docs/specs/ai-doctor-readiness-single-summary.md
 * acceptance tests 8, 11, 12 and 13. Children are mocked so each signal can be
 * driven directly; their own behavior is covered by their existing suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type {
  ReadinessASignal,
  ReadinessCSignal,
  ReadinessFSignal,
} from "@/lib/aiDoctorReadinessSummaryRules";

const signals = vi.hoisted(() => ({
  f: null as null | ((s: ReadinessFSignal) => void),
  a: null as null | ((s: ReadinessASignal) => void),
  c: null as null | ((s: ReadinessCSignal) => void),
  cProps: null as null | Record<string, unknown>,
}));

vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({
  default: (p: { onReadinessSignal?: (s: ReadinessFSignal) => void }) => {
    signals.f = p.onReadinessSignal ?? null;
    return <div data-testid="mock-f" />;
  },
}));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({
  default: (p: { onReadinessSignal?: (s: ReadinessASignal) => void }) => {
    signals.a = p.onReadinessSignal ?? null;
    return <div data-testid="mock-a" />;
  },
}));
vi.mock("@/components/PlantDetailTimelineEvidenceReadinessLaunch", () => ({
  default: () => <div data-testid="mock-b" />,
}));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({
  default: (p: Record<string, unknown> & { onReadinessSignal?: (s: ReadinessCSignal) => void }) => {
    signals.c = p.onReadinessSignal ?? null;
    signals.cProps = p;
    return <div data-testid="mock-c" />;
  },
}));
vi.mock("@/components/PlantDetailAiDoctorContextPanel", () => ({
  default: () => <div data-testid="mock-d" />,
}));

import PlantDetailAiDoctorReadinessSection from "@/components/PlantDetailAiDoctorReadinessSection";
import { resolveReadinessHold } from "@/lib/aiDoctorReadinessSummaryRules";
import { AI_DOCTOR_READINESS_SUMMARY_HEADLINES } from "@/constants/aiDoctorReadinessSummaryCopy";

const PLANT = { id: "p1", name: "Alpha", strain: "NL", stage: "flower" } as never;

function renderSection(initialEntries: string[] = ["/plants/p1"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PlantDetailAiDoctorReadinessSection
        plantId="p1"
        growId="g1"
        tentId="t1"
        tentName="Flower"
        plantName="Alpha"
        strain="NL"
        stage="flower"
        medium={null}
        potSize={null}
        plantType={null}
        hasPlantPhoto
        plant={PLANT}
      />
    </MemoryRouter>,
  );
}

const fOk: ReadinessFSignal = { loading: false, readError: false, retry: () => {} };
const cReady: ReadinessCSignal = {
  hold: "none",
  gate: "standard",
  ctx: "strong",
  missing: [],
  sensor: { source: "manual", capturedAt: new Date().toISOString(), stale: false },
};

function emit(f: ReadinessFSignal, a: ReadinessASignal, c: ReadinessCSignal) {
  act(() => {
    signals.f?.(f);
    signals.a?.(a);
    signals.c?.(c);
  });
}

beforeEach(() => {
  signals.f = signals.a = signals.c = null;
  signals.cProps = null;
});

describe("PlantDetailAiDoctorReadinessSection layout (acceptance 8)", () => {
  it("renders one summary, then C, then a collapsed disclosure holding F, A, B and D", () => {
    renderSection();
    const summaries = screen.getAllByTestId("ai-doctor-readiness-summary");
    expect(summaries).toHaveLength(1);
    const details = screen.getByTestId("ai-doctor-readiness-provenance") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    for (const id of ["mock-f", "mock-a", "mock-b", "mock-d"]) {
      expect(within(details).getByTestId(id)).toBeTruthy();
    }
    const c = screen.getByTestId("mock-c");
    expect(details.contains(c)).toBe(false);
    // Document order: summary, C, disclosure.
    expect(summaries[0].compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(c.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signals.cProps?.hidePreStartConfidenceCopy).toBe(true);
  });

  it("shows checking until every surface has reported", () => {
    renderSection();
    expect(screen.getByTestId("ai-doctor-readiness-summary").getAttribute("data-verdict")).toBe(
      "checking",
    );
  });
});

describe("signals flow while the disclosure is collapsed (acceptance 13)", () => {
  it("reaches ready from collapsed children", () => {
    renderSection();
    emit(fOk, { view: "ready" }, cReady);
    const summary = screen.getByTestId("ai-doctor-readiness-summary");
    expect(summary.getAttribute("data-verdict")).toBe("ready");
    expect(screen.getByTestId("ai-doctor-readiness-summary-headline").textContent).toBe(
      AI_DOCTOR_READINESS_SUMMARY_HEADLINES.ready,
    );
    expect(screen.getByTestId("ai-doctor-readiness-summary-sensor").textContent).toContain(
      "Flower",
    );
    expect((screen.getByTestId("ai-doctor-readiness-provenance") as HTMLDetailsElement).open).toBe(
      false,
    );
  });

  it("never says ready when the view is demo only", () => {
    renderSection();
    emit(fOk, { view: "demo_only" }, cReady);
    expect(screen.getByTestId("ai-doctor-readiness-summary").getAttribute("data-verdict")).toBe(
      "limited",
    );
  });
});

describe("read failure (acceptance 11)", () => {
  it("shows row 2 and retries through F", () => {
    const retry = vi.fn();
    renderSection();
    emit({ loading: false, readError: true, retry }, { view: "ready" }, cReady);
    const summary = screen.getByTestId("ai-doctor-readiness-summary");
    expect(summary.getAttribute("data-row")).toBe("2");
    fireEvent.click(screen.getByTestId("ai-doctor-readiness-summary-retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("D anchor (acceptance 12)", () => {
  it("opens the disclosure when the hash targets D's anchor", () => {
    renderSection(["/plants/p1#plant-ai-doctor-context-panel"]);
    const details = screen.getByTestId("ai-doctor-readiness-provenance") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(within(details).getByTestId("mock-d")).toBeTruthy();
    expect(details.querySelector("#plant-ai-doctor-context-panel")).not.toBeNull();
  });
});

describe("resolveReadinessHold", () => {
  it("prefers F's read error, then pending, then recovery", () => {
    expect(resolveReadinessHold(null, null)).toBe("pending");
    expect(resolveReadinessHold(fOk, null)).toBe("pending");
    expect(resolveReadinessHold({ ...fOk, readError: true }, null)).toBe("read_error");
    expect(resolveReadinessHold({ ...fOk, loading: true }, cReady)).toBe("pending");
    expect(resolveReadinessHold(fOk, { ...cReady, hold: "pending" })).toBe("pending");
    expect(resolveReadinessHold(fOk, { ...cReady, hold: "recovery" })).toBe("recovery");
    expect(resolveReadinessHold(fOk, cReady)).toBe("none");
  });
});
