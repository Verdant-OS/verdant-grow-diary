/**
 * P1 data-loss regressions for usePhenoHuntWorkspace.
 *
 * The hook may expose write callbacks only after every editable evidence source
 * for a candidate page has loaded successfully. Staged rounds have their own
 * explicit lifecycle so a failed or delayed read cannot be mistaken for an
 * empty round and overwritten with defaults.
 *
 * Also covers the F14 honest-data fence: saveSex never appends a fabricated
 * "unknown" observation for a candidate the grower never sexed.
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

describe("initial editable evidence loading", () => {
  it.each([
    ["candidate scores", listScores],
    ["keeper decisions", listDecisions],
    ["sex observations", listSexes],
    ["smoke tests", listSmokes],
    ["lab results", listLabs],
  ])("fails closed when %s cannot be read", async (label, failingRead) => {
    failingRead.mockRejectedValueOnce(new Error(`Could not load ${label}.`));
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/could not load/i);

    await act(async () => {
      expect(await result.current.saveScore("plant-1", { vigor: 1 })).toBe(false);
      expect(await result.current.saveDecision("plant-1", "undecided")).toBe(false);
      expect(await result.current.saveSex("plant-1", "unknown")).toBe(false);
      expect(
        await result.current.saveSmokeTest("plant-1", {
          flavorDescriptors: [],
          effectDescriptors: [],
          smoothness: null,
          potencyImpression: null,
          verdict: null,
        }),
      ).toBe(false);
      expect(
        await result.current.saveLabResult("plant-1", "unspecified", {
          thcPct: null,
          cbdPct: null,
          totalCannabinoidsPct: null,
          dominantTerpenes: [],
        }),
      ).toBe(false);
    });

    for (const writer of WRITERS) expect(writer, label).not.toHaveBeenCalled();
  });
});

describe("sex observation appends (F14 — no fabricated rows)", () => {
  it("skips the append when a fresh candidate saves with the untouched 'unknown' default", async () => {
    // The card's Save button fires score + decision + sex together, so the
    // first save of a card whose sex select was never touched arrives as
    // "unknown". Appending it would fabricate a "Sex recorded: Unknown"
    // timeline event the grower never created.
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    await act(async () => {
      expect(await result.current.saveSex("plant-1", "unknown")).toBe(true);
    });

    expect(appendSex).not.toHaveBeenCalled();
    expect(result.current.sexByPlant["plant-1"]).toBeUndefined();
  });

  it("still appends a first REAL observation for a fresh candidate", async () => {
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    await act(async () => {
      expect(await result.current.saveSex("plant-1", "female")).toBe(true);
    });

    expect(appendSex).toHaveBeenCalledTimes(1);
    expect(appendSex).toHaveBeenCalledWith(
      expect.objectContaining({ huntId: "hunt-1", plantId: "plant-1", sex: "female" }),
    );
    expect(result.current.sexByPlant["plant-1"]?.sex).toBe("female");
  });

  it("still appends when the grower explicitly changes a real prior value back to unknown", async () => {
    listSexes.mockResolvedValueOnce({
      "plant-1": {
        plantId: "plant-1",
        sex: "female",
        hermObserved: false,
        note: null,
        observedAt: "2026-07-01T00:00:00Z",
      },
    });
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.sexByPlant["plant-1"]?.sex).toBe("female");

    await act(async () => {
      expect(await result.current.saveSex("plant-1", "unknown")).toBe(true);
    });

    expect(appendSex).toHaveBeenCalledTimes(1);
    expect(appendSex).toHaveBeenCalledWith(
      expect.objectContaining({ huntId: "hunt-1", plantId: "plant-1", sex: "unknown" }),
    );
    expect(result.current.sexByPlant["plant-1"]?.sex).toBe("unknown");
  });

  it("still appends an 'unknown' first save when it carries a grower note", async () => {
    // A note is grower-authored evidence — never silently discarded, even
    // when the sex value itself is the untouched default.
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    await act(async () => {
      expect(
        await result.current.saveSex("plant-1", "unknown", "pre-flowers not visible yet"),
      ).toBe(true);
    });

    expect(appendSex).toHaveBeenCalledTimes(1);
    expect(appendSex).toHaveBeenCalledWith(
      expect.objectContaining({
        huntId: "hunt-1",
        plantId: "plant-1",
        sex: "unknown",
        note: "pre-flowers not visible yet",
      }),
    );
  });
});

describe("per-round loading", () => {
  it("marks a round ready only after delayed existing data has populated", async () => {
    let resolveRound!: (value: unknown) => void;
    listRounds.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRound = resolve;
        }),
    );
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadRound("late_flower");
    });
    await waitFor(() => expect(result.current.roundLoadStates.late_flower?.status).toBe("loading"));
    expect(result.current.roundsByKey["plant-1:late_flower"]).toBeUndefined();

    resolveRound({
      "plant-1:late_flower": {
        plantId: "plant-1",
        round: "late_flower",
        traits: {},
        loudTraits: { vigor: 4 },
        aromaDescriptors: ["grape"],
        noseNote: "sweet",
        note: "stored",
        observedAt: "2026-07-01T00:00:00Z",
      },
    });
    await act(async () => pending);

    expect(result.current.roundLoadStates.late_flower).toEqual({
      status: "ready",
      error: null,
    });
    expect(result.current.roundsByKey["plant-1:late_flower"]?.loudTraits).toEqual({
      vigor: 4,
    });
  });

  it("keeps a failed round retryable and blocks writes until retry succeeds", async () => {
    listRounds
      .mockRejectedValueOnce(new Error("Could not load this scoring round."))
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    await act(async () => {
      await result.current.loadRound("mid_flower");
    });
    expect(result.current.roundLoadStates.mid_flower).toMatchObject({
      status: "error",
      error: expect.stringMatching(/could not load/i),
    });
    await act(async () => {
      expect(
        await result.current.saveRound("plant-1", "mid_flower", {
          loudTraits: { vigor: 1 },
        }),
      ).toBe(false);
    });
    expect(upsertRound).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.loadRound("mid_flower");
    });
    expect(listRounds).toHaveBeenCalledTimes(2);
    expect(result.current.roundLoadStates.mid_flower).toEqual({
      status: "ready",
      error: null,
    });
    expect(upsertRound).not.toHaveBeenCalled();
  });

  it("keeps a confirmed hunt-wide round ready when candidate filters change", async () => {
    listRounds.mockResolvedValueOnce({
      "plant-1:veg": {
        plantId: "plant-1",
        round: "veg",
        traits: {},
        loudTraits: { vigor: 3 },
        aromaDescriptors: [],
        noseNote: null,
        note: "stored",
        observedAt: "2026-07-01T00:00:00Z",
      },
    });
    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));

    await act(async () => {
      await result.current.loadRound("veg");
    });
    expect(result.current.roundLoadStates.veg?.status).toBe("ready");

    act(() => result.current.setFilter({ strain: "Blue" }));
    await waitFor(() => {
      expect(result.current.status).toBe("ok");
      expect(result.current.filters.strain).toBe("Blue");
    });

    expect(result.current.roundLoadStates.veg?.status).toBe("ready");
    expect(result.current.roundsByKey["plant-1:veg"]?.loudTraits).toEqual({ vigor: 3 });
    expect(listRounds).toHaveBeenCalledTimes(1);
  });
});

describe("bounded pagination failures", () => {
  it("preserves loaded data, rejects duplicate in-flight requests, and retries visibly", async () => {
    const firstPage = {
      ...successfulPage(),
      total: 2,
    };
    const secondPage = {
      ...successfulPage(),
      candidates: [
        {
          ...successfulPage().candidates[0],
          candidateId: "plant-2",
          candidateNumber: 2,
          candidateLabel: "Candidate two",
          plantLabel: "Plant two",
        },
      ],
      total: 2,
      page: 1,
    };
    let rejectLoadMore!: (error: Error) => void;
    const failedLoadMore = new Promise((_resolve, reject) => {
      rejectLoadMore = reject;
    });
    loadCandidatePage
      .mockReset()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(firstPage)
      .mockReturnValueOnce(failedLoadMore)
      .mockResolvedValueOnce(secondPage);

    const { result } = renderHook(() => usePhenoHuntWorkspace("hunt-1"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.candidates.map((candidate) => candidate.candidateId)).toEqual([
      "plant-1",
    ]);

    act(() => result.current.setFilter({ strain: "Blue" }));
    await waitFor(() => {
      expect(result.current.status).toBe("ok");
      expect(result.current.filters).toEqual({ strain: "Blue" });
    });

    act(() => {
      result.current.loadNextPage();
      result.current.loadNextPage();
    });
    expect(loadCandidatePage).toHaveBeenCalledTimes(3);
    rejectLoadMore(new Error("network unavailable"));
    await waitFor(() =>
      expect(result.current.loadMoreError).toMatch(/could not load more candidates/i),
    );

    expect(result.current.candidates.map((candidate) => candidate.candidateId)).toEqual([
      "plant-1",
    ]);
    expect(result.current.filters).toEqual({ strain: "Blue" });
    expect(result.current.hasMore).toBe(true);
    for (const writer of WRITERS) expect(writer).not.toHaveBeenCalled();

    act(() => result.current.loadNextPage());
    await waitFor(() =>
      expect(result.current.candidates.map((candidate) => candidate.candidateId)).toEqual([
        "plant-1",
        "plant-2",
      ]),
    );

    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.hasMore).toBe(false);
    expect(loadCandidatePage).toHaveBeenCalledTimes(4);
    for (const writer of WRITERS) expect(writer).not.toHaveBeenCalled();
  });
});
