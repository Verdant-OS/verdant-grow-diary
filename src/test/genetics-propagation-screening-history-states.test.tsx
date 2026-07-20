/**
 * genetics-propagation-screening-history-states
 *
 * Evidence-truth rendering: a FAILED screening/quarantine query must render an
 * explicit unavailable state (with retry), never the "absent evidence" empty
 * state, and must not produce a trustworthy posture. Invalid route kinds fail
 * closed. True empty-success still renders the honest empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScreeningQuarantineHistory from "@/pages/ScreeningQuarantineHistory";
import { useSubjectScreening, useSubjectQuarantine } from "@/hooks/useGeneticsTrace";

vi.mock("@/hooks/useGeneticsTrace", () => ({
  useSubjectScreening: vi.fn(),
  useSubjectQuarantine: vi.fn(),
}));

type QueryLike = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => void;
};

function q(over: Partial<QueryLike> = {}): QueryLike {
  return { data: [], isLoading: false, isError: false, isSuccess: false, refetch: vi.fn(), ...over };
}

const mockScreening = vi.mocked(useSubjectScreening);
const mockQuarantine = vi.mocked(useSubjectQuarantine);

function renderAt(kind: string, id = "id-1") {
  return render(
    <MemoryRouter initialEntries={[`/genetics/health/${kind}/${id}`]}>
      <Routes>
        <Route path="/genetics/health/:kind/:id" element={<ScreeningQuarantineHistory />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockScreening.mockReturnValue(q({ isSuccess: true, data: [] }) as never);
  mockQuarantine.mockReturnValue(q({ isSuccess: true, data: [] }) as never);
});

describe("ScreeningQuarantineHistory — evidence-truth states", () => {
  it("renders an explicit unavailable state (not empty) when screening errors, and no posture", () => {
    mockScreening.mockReturnValue(q({ isError: true }) as never);
    renderAt("plant");
    expect(screen.getByTestId("screening-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("screening-empty")).toBeNull();
    // No trustworthy posture from failed evidence.
    expect(screen.queryByTestId("evidence-state-pill")).toBeNull();
    expect(screen.getByText("Evidence unavailable")).toBeTruthy();
  });

  it("renders an explicit unavailable state (not empty) when quarantine errors", () => {
    mockQuarantine.mockReturnValue(q({ isError: true }) as never);
    renderAt("plant");
    expect(screen.getByTestId("quarantine-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("quarantine-empty")).toBeNull();
  });

  it("retry calls refetch on the failed query", () => {
    const refetch = vi.fn();
    mockScreening.mockReturnValue(q({ isError: true, refetch }) as never);
    renderAt("plant");
    fireEvent.click(screen.getByTestId("screening-unavailable").querySelector("button")!);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed for an unsupported subject kind", () => {
    renderAt("bogus");
    expect(screen.getByTestId("invalid-kind")).toBeTruthy();
    expect(screen.queryByTestId("screening-empty")).toBeNull();
    expect(screen.queryByTestId("screening-unavailable")).toBeNull();
    expect(screen.queryByTestId("evidence-state-pill")).toBeNull();
  });

  it("still shows the honest empty state on a true empty success", () => {
    renderAt("plant");
    expect(screen.getByTestId("screening-empty")).toBeTruthy();
    expect(screen.getByTestId("quarantine-empty")).toBeTruthy();
    // A genuine no-rows read is honestly "Not tested".
    expect(screen.getByTestId("evidence-state-pill").textContent).toBe("Not tested");
  });
});
