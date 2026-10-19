/**
 * #2015 step 5: Daily Check submit must re-read the selected plant before the
 * diary save. A plant archived in another tab can still sit in the cached
 * usePlants list. The preferred outcome is to block that save.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE,
  DAILY_CHECK_PLANTS_LIST_QUERY_KEY,
  DAILY_CHECK_SUBMIT_SAVE_TEST_IDS,
  classifyDailyCheckPlantArchiveRead,
  dailyCheckSubmitBlockForPlantArchive,
  isDailyCheckSubmitSaveTestId,
} from "@/lib/dailyCheckPlantSelectionRules";

type Plant = {
  id: string;
  name: string;
  strain: string | null;
  grow_id: string;
  tent_id: string;
  is_archived: boolean;
};

const plantsRef = vi.hoisted(() => ({ plants: [] as Plant[] }));
const saveInsert = vi.hoisted(() => vi.fn());
const plantArchive = vi.hoisted(() => ({
  byId: {} as Record<string, boolean>,
  mode: "row" as "row" | "error" | "empty" | "shape",
}));

const ARCHIVED_PLANT_MESSAGE = DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE;

vi.mock("@/integrations/supabase/client", () => {
  function plantsRead() {
    const state = { id: "" };
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        if (column === "id") state.id = value;
        return builder;
      },
      maybeSingle: async () => {
        if (plantArchive.mode === "error") return { data: null, error: { message: "unavailable" } };
        if (plantArchive.mode === "empty") return { data: null, error: null };
        if (plantArchive.mode === "shape") {
          return { data: { id: state.id, is_archived: "yes" }, error: null };
        }
        return {
          data: {
            id: state.id,
            is_archived: plantArchive.byId[state.id] === true,
          },
          error: null,
        };
      },
    };
    return builder;
  }

  return {
    supabase: {
      from: (table: string) => {
        if (table === "plants") return plantsRead();
        return {
          insert: (...args: unknown[]) => {
            saveInsert(...args);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      rpc: (...args: unknown[]) => {
        saveInsert(...args);
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "Tent A", grow_id: "g1" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  PLANTS_QUERY_KEY: ["plants"],
  usePlants: () => ({ data: plantsRef.plants, isLoading: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => {
  function MockManualSensorReadingCard() {
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reading, setReading] = useState("");
    return (
      <div data-testid="mock-manual-card">
        <input
          aria-label="Manual reading"
          data-testid="mock-sensor-reading"
          value={reading}
          onChange={(event) => setReading(event.target.value)}
        />
        <button type="button" data-testid="manual-reading-save" onClick={() => setReviewOpen(true)}>
          Review snapshot
        </button>
        {reviewOpen ? (
          <button
            type="button"
            data-testid="manual-sensor-review-confirm"
            onClick={() => {
              saveInsert("diary_entries");
            }}
          >
            Confirm manual snapshot
          </button>
        ) : null}
      </div>
    );
  }
  return { default: MockManualSensorReadingCard };
});
vi.mock("@/components/QuickLog", () => {
  function MockQuickLog({ open, onCreated }: { open?: boolean; onCreated?: () => void }) {
    const [note, setNote] = useState("");
    const [savePlant, setSavePlant] = useState("");
    return (
      <div data-testid="mock-quicklog" data-open={open ? "1" : "0"}>
        <input
          aria-label="Quick Log note"
          data-testid="mock-quicklog-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button
          type="button"
          data-testid="mock-quicklog-target-other"
          onClick={() => setSavePlant("Q")}
        >
          Target other plant
        </button>
        <button
          type="button"
          data-testid="quick-log-save"
          data-daily-check-save-plant={savePlant || undefined}
          onClick={() => {
            saveInsert("diary_entries");
            window.dispatchEvent(
              new CustomEvent("verdant:entry-created", {
                detail: { createdAt: "2026-10-19T15:00:00.000Z", activityId: "note" },
              }),
            );
            onCreated?.();
          }}
        >
          Save
        </button>
        <button
          type="button"
          data-testid="mock-quicklog-created-only"
          onClick={() => onCreated?.()}
        >
          Created only
        </button>
      </div>
    );
  }
  return { default: MockQuickLog };
});
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({
    onSaveSuccess,
  }: {
    onSaveSuccess?: (result: {
      activityId: "note";
      target: { growId: string; tentId: string | null; plantId: string | null };
      growEventId: string | null;
    }) => void;
  }) => (
    <div data-testid="daily-check-all-activities">
      <button
        type="button"
        data-testid="mock-inline-activity-success"
        onClick={() => {
          // Like useQuickLogActivitySave: the event fires only after a
          // confirmed save, then the section reports success.
          window.dispatchEvent(
            new CustomEvent("verdant:entry-created", {
              detail: { createdAt: new Date().toISOString(), activityId: "note" },
            }),
          );
          onSaveSuccess?.({
            activityId: "note",
            target: { growId: "g1", tentId: "t1", plantId: null },
            growEventId: null,
          });
        }}
      >
        Inline saved
      </button>
    </div>
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => <div /> }));

import DailyCheck from "@/pages/DailyCheck";

const plantP: Plant = {
  id: "P",
  name: "Plant P",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};
const plantQ: Plant = {
  id: "Q",
  name: "Other",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};

function renderCheck() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(qc, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/daily-check"]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, invalidateQueries };
}

async function choosePlant(name: RegExp) {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
}

function plantHref(): string | null {
  const plant = screen.queryByTestId("daily-grow-check-post-submit-plant");
  if (!plant) return null;
  const link = plant.tagName === "A" ? plant : plant.querySelector("a");
  return link?.getAttribute("href") ?? null;
}

async function openManualSnapshotReview() {
  await choosePlant(/Plant P/);
  fireEvent.click(screen.getByTestId("daily-grow-check-start"));
  fireEvent.click(screen.getByTestId("daily-grow-check-next"));
  expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  expect(await screen.findByTestId("manual-sensor-review-confirm")).toBeInTheDocument();
  expect(saveInsert).not.toHaveBeenCalled();
}

async function reachQuickLogSave() {
  await choosePlant(/Plant P/);
  fireEvent.click(screen.getByTestId("daily-grow-check-start"));
  fireEvent.click(screen.getByTestId("daily-grow-check-next"));
  fireEvent.click(screen.getByTestId("daily-grow-check-skip-manual"));
  expect(screen.getByText(/Step 4 · Quick Log/i)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("daily-grow-check-open-quicklog"));
  expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1");
}

describe("daily check archived-plant submit decision", () => {
  it("blocks only a row that is archived", () => {
    expect(
      dailyCheckSubmitBlockForPlantArchive(
        classifyDailyCheckPlantArchiveRead({ error: false, isArchived: true }),
      ),
    ).toEqual({ block: true, message: "This plant was archived. Pick another plant." });
    expect(
      dailyCheckSubmitBlockForPlantArchive(
        classifyDailyCheckPlantArchiveRead({ error: false, isArchived: false }),
      ),
    ).toEqual({ block: false });
  });

  it("blocks a failed, missing, or unexpected archive read and asks for a retry", () => {
    const retry = {
      block: true,
      message: "Couldn't check whether this plant is archived. Try again.",
    };
    expect(
      dailyCheckSubmitBlockForPlantArchive(
        classifyDailyCheckPlantArchiveRead({ error: true, isArchived: null }),
      ),
    ).toEqual(retry);
    expect(
      dailyCheckSubmitBlockForPlantArchive(
        classifyDailyCheckPlantArchiveRead({ error: false, isArchived: null }),
      ),
    ).toEqual(retry);
    expect(
      dailyCheckSubmitBlockForPlantArchive(
        classifyDailyCheckPlantArchiveRead({
          error: false,
          isArchived: "yes" as unknown as null,
        }),
      ),
    ).toEqual(retry);
  });

  it("recognizes the Daily Check save controls and ignores other buttons", () => {
    for (const testId of DAILY_CHECK_SUBMIT_SAVE_TEST_IDS) {
      expect(isDailyCheckSubmitSaveTestId(testId)).toBe(true);
    }
    expect(isDailyCheckSubmitSaveTestId("daily-grow-check-start")).toBe(false);
    expect(isDailyCheckSubmitSaveTestId(null)).toBe(false);
  });

  it("invalidates the same plant-list key usePlants publishes", async () => {
    const actual = await vi.importActual<typeof import("@/hooks/use-plants")>("@/hooks/use-plants");
    expect(DAILY_CHECK_PLANTS_LIST_QUERY_KEY).toEqual(actual.PLANTS_QUERY_KEY);
  });
});

describe("Daily Check submit re-checks an archived plant", () => {
  beforeEach(() => {
    plantsRef.plants = [plantP, plantQ];
    plantArchive.byId = {};
    plantArchive.mode = "row";
    saveInsert.mockClear();
    const proto = window.HTMLElement.prototype;
    proto.scrollIntoView = () => {};
    proto.hasPointerCapture = () => false;
    proto.releasePointerCapture = () => {};
    proto.setPointerCapture = () => {};
  });

  it("blocks the diary save and tells the grower to pick another plant", async () => {
    const { invalidateQueries } = renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    expect(saveInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(ARCHIVED_PLANT_MESSAGE)).toBeInTheDocument();
    expect(saveInsert).not.toHaveBeenCalled();
    expect(screen.queryByTestId("daily-grow-check-post-submit-plant")).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("keeps the Quick Log note on screen when the saved plant was archived", async () => {
    renderCheck();
    await reachQuickLogSave();
    fireEvent.change(screen.getByTestId("mock-quicklog-note"), { target: { value: "keep this" } });
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    expect(saveInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(ARCHIVED_PLANT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1");
    expect(screen.getByTestId("mock-quicklog-note")).toHaveValue("keep this");
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("does not clear the Daily Check plant when a different dialog target was archived", async () => {
    renderCheck();
    await reachQuickLogSave();
    fireEvent.change(screen.getByTestId("mock-quicklog-note"), { target: { value: "keep this" } });
    fireEvent.click(screen.getByTestId("mock-quicklog-target-other"));
    plantArchive.byId.Q = true;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    expect(saveInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(ARCHIVED_PLANT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId("mock-quicklog-note")).toHaveValue("keep this");
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("keeps the manual snapshot draft when confirm is blocked", async () => {
    renderCheck();
    await choosePlant(/Plant P/);
    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.change(screen.getByTestId("mock-sensor-reading"), { target: { value: "72.4" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(await screen.findByTestId("manual-sensor-review-confirm")).toBeInTheDocument();
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    expect(saveInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(ARCHIVED_PLANT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId("mock-sensor-reading")).toHaveValue("72.4");
    expect(screen.getByTestId("manual-sensor-review-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("blocks the sensor confirm after the plant is archived during review", async () => {
    renderCheck();
    await openManualSnapshotReview();
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    expect(saveInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(ARCHIVED_PLANT_MESSAGE)).toBeInTheDocument();
    expect(saveInsert).not.toHaveBeenCalled();
  });

  it("blocks confirm when the archive read fails and clears that warning after a later allowed save", async () => {
    renderCheck();
    await openManualSnapshotReview();
    plantArchive.mode = "error";

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      "Couldn't check whether this plant is archived. Try again.",
    );
    expect(saveInsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("manual-sensor-review-confirm")).toBeInTheDocument();

    plantArchive.mode = "row";
    plantArchive.byId.P = false;
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() => {
      expect(saveInsert).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
  });

  it("still confirms a manual snapshot when the plant is not archived", async () => {
    renderCheck();
    await openManualSnapshotReview();
    plantArchive.byId.P = false;

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() => {
      expect(saveInsert).toHaveBeenCalledTimes(1);
    });
    expect(saveInsert).toHaveBeenCalledWith("diary_entries");
    expect(screen.queryByText(ARCHIVED_PLANT_MESSAGE)).not.toBeInTheDocument();
  });

  it("clears the archive warning when the same plant is restored and confirm is allowed", async () => {
    renderCheck();
    await openManualSnapshotReview();
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );
    expect(saveInsert).not.toHaveBeenCalled();

    plantArchive.byId.P = false;
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() => {
      expect(saveInsert).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("clears the archive warning when a later save uses a different Quick Log target", async () => {
    renderCheck();
    await reachQuickLogSave();
    fireEvent.click(screen.getByTestId("mock-quicklog-target-other"));
    plantArchive.byId.Q = true;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );
    expect(saveInsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");

    screen.getByTestId("quick-log-save").removeAttribute("data-daily-check-save-plant");
    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() => {
      expect(saveInsert).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("clears the archive warning when a save succeeds without another page check", async () => {
    renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = true;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );
    expect(saveInsert).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: "2026-10-19T16:00:00.000Z", activityId: "note" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    });
    expect(saveInsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("clears the archive warning when the sensor snapshot save succeeds", async () => {
    renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = true;
    fireEvent.click(screen.getByTestId("quick-log-save"));
    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:sensor-reading-created", {
          detail: { createdAt: "2026-10-19T16:05:00.000Z" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    });
    expect(saveInsert).not.toHaveBeenCalled();
  });

  it("clears the archive warning when Quick Log reports the note was created", async () => {
    renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = true;
    fireEvent.click(screen.getByTestId("quick-log-save"));
    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );

    fireEvent.click(screen.getByTestId("mock-quicklog-created-only"));

    await waitFor(() => {
      expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    });
    expect(saveInsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "P");
  });

  it("clears the archive warning when a tent-scoped inline save succeeds", async () => {
    const { invalidateQueries } = renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = true;
    fireEvent.click(screen.getByTestId("quick-log-save"));
    expect(await screen.findByTestId("daily-check-archived-plant-submit")).toHaveTextContent(
      ARCHIVED_PLANT_MESSAGE,
    );
    expect(invalidateQueries).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("mock-inline-activity-success"));

    await waitFor(() => {
      expect(screen.queryByTestId("daily-check-archived-plant-submit")).not.toBeInTheDocument();
    });
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["plants"] }),
    );
    expect(saveInsert).not.toHaveBeenCalled();
  });

  it("still saves a plant that is not archived and keeps View Plant", async () => {
    const { invalidateQueries } = renderCheck();
    await reachQuickLogSave();
    plantArchive.byId.P = false;

    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() => {
      expect(saveInsert).toHaveBeenCalledTimes(1);
    });
    expect(saveInsert).toHaveBeenCalledWith("diary_entries");
    expect(screen.queryByText(ARCHIVED_PLANT_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-post-submit-plant")).toHaveTextContent(
      "View Plant",
    );
    expect(plantHref()).toBe("/plants/P");
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["plants"] }),
      );
    });
  });
});
