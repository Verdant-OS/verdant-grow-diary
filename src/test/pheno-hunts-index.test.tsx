/**
 * PhenoHuntsIndex — the Pheno Hunt nav-tab landing page.
 *
 * Covers the loading, populated, empty, and error states, that each hunt
 * links into its workspace, and that the empty state routes to My Grows
 * (a hunt starts from a grow, so a new-hunt link without a grow would
 * dead-end).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PhenoHuntsIndex from "@/pages/PhenoHuntsIndex";
import type { PhenoHuntListItem } from "@/lib/phenoHuntCandidatesService";
import type { KeeperStabilityRow } from "@/lib/phenoKeepersService";

const mockList = vi.fn();
vi.mock("@/lib/phenoHuntCandidatesService", () => ({
  listPhenoHuntsForOwner: () => mockList(),
}));

const mockKeepers = vi.fn();
vi.mock("@/lib/phenoKeepersService", () => ({
  listKeeperStabilityForOwner: () => mockKeepers(),
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
  mockKeepers.mockResolvedValue([]);
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

describe("PhenoHuntsIndex — cross-keeper stability dashboard", () => {
  const KEEPERS: KeeperStabilityRow[] = [
    {
      keeperId: "k1",
      huntId: "hunt-1",
      keeperName: "Gas #4",
      stabilityRuns: [
        { runLabel: "R1", observedAt: null, traits: { nose_loudness: 8 }, note: null },
        { runLabel: "R2", observedAt: null, traits: { nose_loudness: 8 }, note: null },
      ],
    },
    {
      keeperId: "k2",
      huntId: "hunt-2",
      keeperName: "Cake #1",
      stabilityRuns: [
        { runLabel: "R1", observedAt: null, traits: { nose_loudness: 8 }, note: null },
        { runLabel: "R2", observedAt: null, traits: { nose_loudness: 2 }, note: null },
      ],
    },
    { keeperId: "k3", huntId: "hunt-1", keeperName: "Sherb #2", stabilityRuns: [] },
  ];

  it("hides the dashboard entirely when the grower has no keepers", async () => {
    renderIndex();
    await waitFor(() => expect(screen.getByTestId("pheno-hunts-index-list")).toBeInTheDocument());
    expect(screen.queryByTestId("pheno-stability-dashboard")).not.toBeInTheDocument();
  });

  it("a keeper-load FAILURE never breaks the index (best-effort roll-up)", async () => {
    // The optional roll-up must not fail-fast the page: even a thrown rejection
    // (not just a returned error) leaves the hunts list rendered and simply
    // hides the dashboard — the page never drops to the error state.
    mockKeepers.mockRejectedValue(new Error("keeper read blew up"));
    renderIndex();
    await waitFor(() => expect(screen.getByTestId("pheno-hunts-index-list")).toBeInTheDocument());
    expect(screen.queryByTestId("pheno-hunts-index-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-stability-dashboard")).not.toBeInTheDocument();
  });

  it("rolls up each keeper's own verdict with a hunt label, never a ranking", async () => {
    mockKeepers.mockResolvedValue(KEEPERS);
    renderIndex();
    await waitFor(() =>
      expect(screen.getByTestId("pheno-stability-dashboard")).toBeInTheDocument(),
    );
    // Holding keeper (nose held) shows the held badge + its hunt name.
    const k1 = screen.getByTestId("pheno-stability-dashboard-entry-k1");
    expect(k1.textContent).toContain("Gas #4");
    expect(k1.textContent).toContain("Blue Dream F2"); // resolved hunt name
    expect(screen.getByTestId("pheno-stability-dashboard-badge-k1")).toHaveTextContent(
      /Held on re-grow/i,
    );
    // Drifting keeper shows the drifted badge.
    expect(screen.getByTestId("pheno-stability-dashboard-badge-k2")).toHaveTextContent(
      /Drifted on re-grow/i,
    );
    // Keeper with no runs shows the no-grow-outs status.
    expect(screen.getByTestId("pheno-stability-dashboard-badge-k3")).toHaveTextContent(
      /No grow-outs recorded/i,
    );
    // Aggregate counts present (1 holding, 1 drifting, 1 no-runs).
    const counts = screen.getByTestId("pheno-stability-dashboard-counts");
    expect(within(counts).getByTestId("pheno-stability-dashboard-filter-holding")).toHaveTextContent(
      "1",
    );
    expect(
      within(counts).getByTestId("pheno-stability-dashboard-filter-drifting"),
    ).toHaveTextContent("1");
  });

  it("lets the grower filter to a single verdict (a view choice, not a sort)", async () => {
    mockKeepers.mockResolvedValue(KEEPERS);
    renderIndex();
    await waitFor(() =>
      expect(screen.getByTestId("pheno-stability-dashboard")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("pheno-stability-dashboard-filter-holding"));
    expect(screen.getByTestId("pheno-stability-dashboard-entry-k1")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-stability-dashboard-entry-k2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-stability-dashboard-entry-k3")).not.toBeInTheDocument();
  });
});
