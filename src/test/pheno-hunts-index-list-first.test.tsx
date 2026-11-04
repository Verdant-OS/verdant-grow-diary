/**
 * Audit 2026-11-03 finding 10: "Pheno Hunts similarly starts with keeper
 * summaries from audit/demo records before the active hunt list." The keeper
 * stability roll-up reads every keeper the grower owns (truthful, not filtered),
 * so the fix is order: the hunt list comes first, and the roll-up (or its
 * failed-read notice) follows it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
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
  countKeepersForOwner: async () => 1,
}));

const HUNTS: PhenoHuntListItem[] = [
  {
    id: "hunt-1",
    name: "Skunk Gas Run",
    createdAt: "2026-06-01T10:00:00.000Z",
    setupCompletedAt: "2026-06-01T12:00:00.000Z",
    candidateCount: 4,
  },
];
const KEEPERS: KeeperStabilityRow[] = [
  { keeperId: "k-1", huntId: "hunt-1", keeperName: "Keeper #1", stabilityRuns: [] },
];

function follows(earlier: Element, later: Element) {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function renderIndex() {
  render(
    <MemoryRouter>
      <PhenoHuntsIndex />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockList.mockResolvedValue(HUNTS);
  mockKeepers.mockResolvedValue(KEEPERS);
});
afterEach(() => vi.clearAllMocks());

describe("Pheno Hunts index puts the hunt list first", () => {
  it("renders the hunt list before the keeper stability roll-up", async () => {
    renderIndex();
    const list = await screen.findByTestId("pheno-hunts-index-list");
    const rollup = await screen.findByTestId("pheno-stability-dashboard");
    expect(follows(list, rollup)).toBe(true);
  });

  it("renders the failed roll-up notice after the hunt list, still as a failed read", async () => {
    mockKeepers.mockRejectedValue(new Error("rollup down"));
    renderIndex();
    const list = await screen.findByTestId("pheno-hunts-index-list");
    const notice = await screen.findByTestId("pheno-hunts-index-stability-unavailable");
    expect(follows(list, notice)).toBe(true);
    expect(notice).toHaveTextContent("failed read, not an empty ledger");
    expect(screen.queryByTestId("pheno-stability-dashboard")).toBeNull();
  });

  it("keeps the roll-up above the related-surfaces links", async () => {
    renderIndex();
    const rollup = await screen.findByTestId("pheno-stability-dashboard");
    expect(follows(rollup, screen.getByTestId("pheno-hunts-index-more"))).toBe(true);
  });
});
