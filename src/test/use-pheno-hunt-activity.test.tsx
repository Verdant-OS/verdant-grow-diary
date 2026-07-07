/**
 * C5 — usePhenoHuntActivity hook.
 * Mocks the six read services and proves the hook: loads for the given hunt,
 * scopes the reversal read to that hunt's keeper ids, resolves candidate labels
 * + keeper names, and returns adapted, ordered timeline entries. Read-only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const loadCandidates = vi.fn();
const listKeepers = vi.fn();
const listCrosses = vi.fn();
const listReversals = vi.fn();
const listSex = vi.fn();
const listDecisions = vi.fn();

vi.mock("@/lib/phenoHuntCandidatesService", () => ({
  loadPhenoHuntCandidates: (...a: unknown[]) => loadCandidates(...a),
}));
vi.mock("@/lib/phenoKeepersService", () => ({
  listKeepersForHunt: (...a: unknown[]) => listKeepers(...a),
  listCrossesForHunt: (...a: unknown[]) => listCrosses(...a),
}));
vi.mock("@/lib/phenoReversalsService", () => ({
  listReversalsForKeepers: (...a: unknown[]) => listReversals(...a),
}));
vi.mock("@/lib/phenoSexObservationService", () => ({
  listLatestSexObservationsForHunt: (...a: unknown[]) => listSex(...a),
}));
vi.mock("@/lib/phenoKeeperDecisionLogService", () => ({
  listKeeperDecisionHistoryForHunt: (...a: unknown[]) => listDecisions(...a),
}));

import { usePhenoHuntActivity } from "@/hooks/usePhenoHuntActivity";

beforeEach(() => {
  loadCandidates.mockReset();
  listKeepers.mockReset();
  listCrosses.mockReset();
  listReversals.mockReset();
  listSex.mockReset();
  listDecisions.mockReset();
});

describe("usePhenoHuntActivity", () => {
  it("stays idle with no entries when no hunt id is given", () => {
    const { result } = renderHook(() => usePhenoHuntActivity(null));
    expect(result.current.status).toBe("idle");
    expect(result.current.entries).toEqual([]);
    expect(listKeepers).not.toHaveBeenCalled();
  });

  it("loads, scopes reversals to keeper ids, and returns adapted entries", async () => {
    loadCandidates.mockResolvedValue({
      ok: true,
      hunt: { id: "h1", name: "Hunt" },
      candidates: [{ candidateId: "p1", candidateLabel: "GMO #1" }],
    });
    listKeepers.mockResolvedValue([{ id: "k1", keeperName: "Gas Keeper" }]);
    listCrosses.mockResolvedValue([]);
    listReversals.mockResolvedValue([
      { id: "r1", keeperId: "k1", method: "colloidal_silver", appliedAt: "2026-07-05" },
    ]);
    listSex.mockResolvedValue({
      p1: { plantId: "p1", sex: "female", observedAt: "2026-07-02" },
    });
    listDecisions.mockResolvedValue({
      p1: [{ decision: "keep", reason: "vigor", decidedAt: "2026-07-03" }],
    });

    const { result } = renderHook(() => usePhenoHuntActivity("h1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    // Reversal read is scoped to this hunt's keeper ids.
    expect(listReversals).toHaveBeenCalledWith(["k1"]);

    const byId = Object.fromEntries(result.current.entries.map((e) => [e.id, e]));
    // Candidate label resolved onto the decision entry.
    expect(byId["decision:p1"].title).toContain("GMO #1");
    // Keeper name resolved onto the reversal entry.
    expect(byId["reversal:p1"]).toBeUndefined();
    expect(byId["reversal:r1"].title).toContain("Gas Keeper");
    expect(byId["sex:p1"].badge).toBe("Female");
    // Ordered most-recent first: reversal (07-05) → decision (07-03) → sex (07-02).
    expect(result.current.entries.map((e) => e.occurredAt)).toEqual([
      "2026-07-05",
      "2026-07-03",
      "2026-07-02",
    ]);
  });

  it("surfaces an error status without throwing when a read rejects", async () => {
    loadCandidates.mockRejectedValue(new Error("boom"));
    listKeepers.mockResolvedValue([]);
    listCrosses.mockResolvedValue([]);
    listReversals.mockResolvedValue([]);
    listSex.mockResolvedValue({});
    listDecisions.mockResolvedValue({});

    const { result } = renderHook(() => usePhenoHuntActivity("h1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.entries).toEqual([]);
  });
});
