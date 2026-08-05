/**
 * genetics-propagation-library-read-states
 *
 * A failed owner read is unavailable data, never an empty library or a
 * not-found detail. Genuine empty successes retain the existing empty and
 * not-found behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import GeneticsLibrary from "@/pages/GeneticsLibrary";
import AccessionDetail from "@/pages/AccessionDetail";
import PropagationBatchDetail from "@/pages/PropagationBatchDetail";
import { useAccessions, useBatches } from "@/hooks/useGeneticsLibrary";

vi.mock("@/hooks/useGeneticsLibrary", () => ({
  useAccessions: vi.fn(),
  useBatches: vi.fn(),
}));

vi.mock("@/hooks/useGeneticsMutations", () => ({
  useArchiveAccession: () => ({
    submit: vi.fn(),
    retry: vi.fn(),
    status: "idle",
    error: null,
  }),
}));

type QueryLike = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => void;
};

function query(overrides: Partial<QueryLike> = {}): QueryLike {
  return {
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  };
}

const mockAccessions = vi.mocked(useAccessions);
const mockBatches = vi.mocked(useBatches);

function renderLibrary() {
  return render(
    <MemoryRouter>
      <GeneticsLibrary />
    </MemoryRouter>,
  );
}

function renderAccessionDetail() {
  return render(
    <MemoryRouter initialEntries={["/genetics/accessions/accession-1"]}>
      <Routes>
        <Route path="/genetics/accessions/:id" element={<AccessionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBatchDetail() {
  return render(
    <MemoryRouter initialEntries={["/genetics/batches/batch-1"]}>
      <Routes>
        <Route path="/genetics/batches/:id" element={<PropagationBatchDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAccessions.mockReturnValue(query() as never);
  mockBatches.mockReturnValue(query() as never);
});

describe("Genetics Library read truth states", () => {
  it("shows accessions as unavailable with retry instead of falsely empty", () => {
    const refetch = vi.fn();
    mockAccessions.mockReturnValue(
      query({ data: undefined, isError: true, isSuccess: false, refetch }) as never,
    );

    renderLibrary();

    const unavailable = screen.getByTestId("accessions-unavailable");
    expect(unavailable).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("accessions-empty")).toBeNull();
    fireEvent.click(within(unavailable).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows batches as unavailable with retry instead of falsely empty", () => {
    const refetch = vi.fn();
    mockBatches.mockReturnValue(
      query({ data: undefined, isError: true, isSuccess: false, refetch }) as never,
    );

    renderLibrary();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Batches" }), {
      button: 0,
      ctrlKey: false,
    });

    const unavailable = screen.getByTestId("batches-unavailable");
    expect(screen.queryByTestId("batches-empty")).toBeNull();
    fireEvent.click(within(unavailable).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("preserves both honest empty states after successful zero-row reads", () => {
    renderLibrary();
    expect(screen.getByTestId("accessions-empty")).toBeTruthy();
    expect(screen.queryByTestId("accessions-unavailable")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Batches" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByTestId("batches-empty")).toBeTruthy();
    expect(screen.queryByTestId("batches-unavailable")).toBeNull();
  });

  it("does not turn an accession read failure into not found", () => {
    const refetch = vi.fn();
    mockAccessions.mockReturnValue(
      query({ data: undefined, isError: true, isSuccess: false, refetch }) as never,
    );

    renderAccessionDetail();

    const unavailable = screen.getByTestId("accession-unavailable");
    expect(screen.queryByText("This accession could not be found.")).toBeNull();
    fireEvent.click(within(unavailable).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not turn a propagation-batch read failure into not found", () => {
    const refetch = vi.fn();
    mockBatches.mockReturnValue(
      query({ data: undefined, isError: true, isSuccess: false, refetch }) as never,
    );

    renderBatchDetail();

    const unavailable = screen.getByTestId("batch-unavailable");
    expect(screen.queryByText("This batch could not be found.")).toBeNull();
    fireEvent.click(within(unavailable).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("preserves accession not-found after a successful zero-row read", () => {
    renderAccessionDetail();
    expect(screen.getByText("This accession could not be found.")).toBeTruthy();
    expect(screen.queryByTestId("accession-unavailable")).toBeNull();
  });

  it("preserves batch not-found after a successful zero-row read", () => {
    renderBatchDetail();
    expect(screen.getByText("This batch could not be found.")).toBeTruthy();
    expect(screen.queryByTestId("batch-unavailable")).toBeNull();
  });
});
