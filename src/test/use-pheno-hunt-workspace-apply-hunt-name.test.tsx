/**
 * #551 — usePhenoHuntWorkspace.applyHuntName: a confirmed rename patches the
 * loaded hunt, and a load that started before the save can never put the
 * old name back (Codex P2 at d41a69e2: stale reload after A→B→A).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadSummary = vi.fn();
const loadComparisonSummary = vi.fn();
const loadCandidatePage = vi.fn();
vi.mock("@/lib/phenoHuntCandidatesService", () => ({
  loadPhenoHuntSummary: (...args: unknown[]) => loadSummary(...args),
  loadPhenoHuntComparisonSummary: (...args: unknown[]) => loadComparisonSummary(...args),
  loadPhenoHuntCandidatePage: (...args: unknown[]) => loadCandidatePage(...args),
}));

const assignNumber = vi.fn();
vi.mock("@/lib/phenoCandidateNumberService", () => ({
  assignPhenoCandidateNumber: (...args: unknown[]) => assignNumber(...args),
}));

const listKeepers = vi.fn();
const listClones = vi.fn();
vi.mock("@/lib/phenoKeepersService", () => ({
  listKeepersForHunt: (...args: unknown[]) => listKeepers(...args),
  listClonesForKeepers: (...args: unknown[]) => listClones(...args),
}));

const listReversedKeeperIds = vi.fn();
vi.mock("@/lib/phenoReversalsService", () => ({
  listReversedKeeperIdsForKeepers: (...args: unknown[]) => listReversedKeeperIds(...args),
}));

const listScores = vi.fn();
const upsertScore = vi.fn();
vi.mock("@/lib/phenoCandidateScoresService", () => ({
  listCandidateScoresForHunt: (...args: unknown[]) => listScores(...args),
  upsertCandidateScore: (...args: unknown[]) => upsertScore(...args),
}));

const listDecisions = vi.fn();
const recordDecision = vi.fn();
vi.mock("@/lib/phenoKeeperDecisionService", () => ({
  listKeeperDecisionsForHunt: (...args: unknown[]) => listDecisions(...args),
  recordKeeperDecision: (...args: unknown[]) => recordDecision(...args),
}));

const listDecisionHistory = vi.fn();
const appendDecision = vi.fn();
vi.mock("@/lib/phenoKeeperDecisionLogService", () => ({
  listKeeperDecisionHistoryForPlant: (...args: unknown[]) => listDecisionHistory(...args),
  appendKeeperDecision: (...args: unknown[]) => appendDecision(...args),
}));

const listSexes = vi.fn();
const appendSex = vi.fn();
vi.mock("@/lib/phenoSexObservationService", () => ({
  listLatestSexObservationsForHunt: (...args: unknown[]) => listSexes(...args),
  appendSexObservation: (...args: unknown[]) => appendSex(...args),
}));

const listSmokes = vi.fn();
const upsertSmoke = vi.fn();
vi.mock("@/lib/phenoSmokeTestService", () => ({
  listSmokeTestsForHunt: (...args: unknown[]) => listSmokes(...args),
  upsertSmokeTest: (...args: unknown[]) => upsertSmoke(...args),
}));

const listLabs = vi.fn();
const upsertLab = vi.fn();
vi.mock("@/lib/phenoLabResultsService", () => ({
  listLabResultsForHunt: (...args: unknown[]) => listLabs(...args),
  upsertLabResult: (...args: unknown[]) => upsertLab(...args),
}));

const listRounds = vi.fn();
const upsertRound = vi.fn();
vi.mock("@/lib/phenoScoreRoundsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/phenoScoreRoundsService")>();
  return {
    ...actual,
    listScoreRoundsForHunt: (...args: unknown[]) => listRounds(...args),
    upsertScoreRound: (...args: unknown[]) => upsertRound(...args),
  };
});

import { usePhenoHuntWorkspace } from "@/hooks/usePhenoHuntWorkspace";

const WRITERS = [
  upsertScore,
  recordDecision,
  appendDecision,
  appendSex,
  upsertSmoke,
  upsertLab,
  upsertRound,
];

function successfulPage() {
  return {
    ok: true as const,
    candidates: [
      {
        candidateId: "plant-1",
        candidateNumber: 1,
        candidateLabel: "Candidate one",
        plantLabel: "Plant one",
        strain: "Blue Dream",
        stage: "flower",
        quickLogEntries: [],
        timelineEvents: [],
        photos: [],
        sensorSnapshots: [],
      },
    ],
    total: 1,
    page: 0,
    pageSize: 30,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSummary.mockResolvedValue({
    ok: true,
    hunt: { id: "hunt-1", name: "Hunt one", growId: "grow-1", tentId: "tent-1" },
  });
  loadComparisonSummary.mockResolvedValue(null);
  loadCandidatePage.mockResolvedValue(successfulPage());
  listKeepers.mockResolvedValue([]);
  listClones.mockResolvedValue([]);
  listReversedKeeperIds.mockResolvedValue([]);
  listScores.mockResolvedValue({});
  listDecisions.mockResolvedValue({});
  listDecisionHistory.mockResolvedValue([]);
  listSexes.mockResolvedValue({});
  listSmokes.mockResolvedValue({});
  listLabs.mockResolvedValue({});
  listRounds.mockResolvedValue({});
  assignNumber.mockResolvedValue({ ok: true, candidateNumber: 1 });
  for (const writer of WRITERS) writer.mockResolvedValue({ ok: true });
});

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("applyHuntName (#551)", () => {
  it("patches the loaded hunt's name at once", async () => {
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    act(() => result.current.applyHuntName("hunt-1", "Renamed"));
    expect(result.current.hunt?.name).toBe("Renamed");
  });

  it("ignores a rename for another hunt", async () => {
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    act(() => result.current.applyHuntName("hunt-2", "Elsewhere"));
    expect(result.current.hunt?.name).toBe("Hunt one");
  });

  it("a load that started before the save cannot restore the old name", async () => {
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    // A reload starts while the server still holds the pre-save name.
    const stale = deferred<unknown>();
    loadSummary.mockImplementationOnce(() => stale.promise);
    act(() => result.current.reload());
    await waitFor(() => expect(loadSummary).toHaveBeenCalledTimes(2));
    // The rename is confirmed; later loads see the persisted name.
    loadSummary.mockResolvedValue({
      ok: true,
      hunt: { id: "hunt-1", name: "Renamed", growId: "grow-1", tentId: "tent-1" },
    });
    act(() => result.current.applyHuntName("hunt-1", "Renamed"));
    // The stale response arrives last.
    await act(async () => {
      stale.resolve({
        ok: true,
        hunt: { id: "hunt-1", name: "Hunt one", growId: "grow-1", tentId: "tent-1" },
      });
    });
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.hunt?.name).toBe("Renamed");
  });
});
