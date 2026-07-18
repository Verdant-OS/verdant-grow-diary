/**
 * PhenoHuntsIndex — the Pheno Hunt nav-tab landing page.
 *
 * Covers the loading, populated, empty, and error states, that each hunt
 * links into its workspace, and that the empty state routes to My Grows
 * (a hunt starts from a grow, so a new-hunt link without a grow would
 * dead-end).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PhenoHuntsIndex from "@/pages/PhenoHuntsIndex";
import type { PhenoHuntListItem } from "@/lib/phenoHuntCandidatesService";

const mockList = vi.fn();
vi.mock("@/lib/phenoHuntCandidatesService", () => ({
  listPhenoHuntsForOwner: () => mockList(),
}));

function renderIndex() {
  return render(
    <MemoryRouter>
      <PhenoHuntsIndex />
    </MemoryRouter>,
  );
}

const HUNTS: PhenoHuntListItem[] = [
  {
    id: "hunt-1",
    name: "Blue Dream F2",
    createdAt: "2026-06-01T10:00:00.000Z",
    setupCompletedAt: "2026-06-01T12:00:00.000Z",
    candidateCount: 12,
  },
  {
    id: "hunt-2",
    name: "Gassy Pheno Hunt",
    createdAt: "2026-07-01T10:00:00.000Z",
    setupCompletedAt: null,
    candidateCount: 1,
  },
];

beforeEach(() => {
  mockList.mockResolvedValue(HUNTS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PhenoHuntsIndex", () => {
  it("shows a loading state before hunts resolve", () => {
    mockList.mockReturnValue(new Promise(() => {}));
    renderIndex();
    expect(screen.getByTestId("pheno-hunts-index-loading")).toBeInTheDocument();
  });

  it("lists each hunt with a link into its workspace and a candidate count", async () => {
    renderIndex();
    await waitFor(() => expect(screen.getByTestId("pheno-hunts-index-list")).toBeInTheDocument());
    const first = screen.getByTestId("pheno-hunts-index-item-hunt-1");
    expect(first).toHaveAttribute("href", "/pheno-hunts/hunt-1/workspace");
    expect(first.textContent).toContain("Blue Dream F2");
    expect(first.textContent).toContain("12 candidates");

    const second = screen.getByTestId("pheno-hunts-index-item-hunt-2");
    expect(second.textContent).toContain("1 candidate");
    // Singular, and setup-in-progress surfaced honestly.
    expect(second.textContent).toContain("setup in progress");
  });

  it("shows an empty state routing to My Grows when there are no hunts", async () => {
    mockList.mockResolvedValue([]);
    renderIndex();
    await waitFor(() => expect(screen.getByTestId("pheno-hunts-index-empty")).toBeInTheDocument());
    expect(screen.getByTestId("pheno-hunts-index-empty-cta")).toHaveAttribute("href", "/grows");
    expect(screen.queryByTestId("pheno-hunts-index-list")).not.toBeInTheDocument();
  });

  it("surfaces an error state when the load rejects", async () => {
    mockList.mockRejectedValue(new Error("boom"));
    renderIndex();
    await waitFor(() => expect(screen.getByTestId("pheno-hunts-index-error")).toBeInTheDocument());
  });
});
