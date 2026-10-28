import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const mocks = vi.hoisted(() => ({
  plants: {
    data: [] as { id: string; name: string; tent_id: string | null }[] | undefined,
    isLoading: false,
    isError: false,
  },
  save: vi.fn(),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => mocks.plants }));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: mocks.save, saving: false, error: null }),
}));
vi.mock("@/lib/harvestWindowAnalytics", () => ({ trackHarvestTrackerEvent: vi.fn() }));

import HarvestCheckImportPrompt from "@/components/HarvestCheckImportPrompt";
import {
  HARVEST_HANDOFF_STORAGE_KEY,
  saveHarvestCheckHandoff,
} from "@/lib/harvestCheckHandoffStore";
import { trackHarvestTrackerEvent } from "@/lib/harvestWindowAnalytics";
import { createDefaultHarvestRanges, HARVEST_WINDOW_CTA_HREF } from "@/lib/harvestWindowRules";
import HarvestWindowTracker from "@/pages/HarvestWindowTracker";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void map.set(key, value)),
    removeItem: vi.fn((key: string) => void map.delete(key)),
    clear: vi.fn(() => map.clear()),
    key: vi.fn(),
    get length() {
      return map.size;
    },
  };
}

let storage = memoryStorage();

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function addCheck(date: string, clear: string, cloudy: string, amber: string) {
  fill("Date", date);
  fill("Plant", "Plant A");
  fill("% Clear", clear);
  fill("% Cloudy", cloudy);
  fill("% Amber", amber);
  fireEvent.click(screen.getByRole("button", { name: "Add check" }));
}

/** The visitor logs three checks on the public page and clicks the CTA. */
function logThreeChecksAndClickCta() {
  const page = render(
    <MemoryRouter>
      <HarvestWindowTracker />
    </MemoryRouter>,
  );
  addCheck("2026-10-20", "30", "70", "0");
  addCheck("2026-10-24", "10", "75", "15");
  addCheck("2026-10-27", "5", "70", "25");
  const [cta] = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
  expect(cta.getAttribute("href")).toBe(`${HARVEST_WINDOW_CTA_HREF}&redirectTo=%2Fplants`);
  fireEvent.click(cta);
  page.unmount();
}

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HarvestCheckImportPrompt />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("harvest check import after signup", () => {
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", vi.fn());
    mocks.plants = {
      data: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Blue Dream #1", tent_id: "tent-1" },
      ],
      isLoading: false,
      isError: false,
    };
    mocks.save.mockReset();
    mocks.save.mockResolvedValue({ ok: true });
    vi.mocked(trackHarvestTrackerEvent).mockClear();
  });

  it("renders nothing when no handoff exists", () => {
    renderPrompt();
    expect(screen.queryByTestId("harvest-check-import-prompt")).not.toBeInTheDocument();
  });

  it("imports three checks as notes on the chosen plant with their dates, then removes the key", async () => {
    logThreeChecksAndClickCta();
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(true);
    expect(vi.mocked(trackHarvestTrackerEvent)).toHaveBeenCalledWith(
      "harvest_tracker_handoff_saved",
      { count_bucket: "2-5" },
    );

    renderPrompt();
    expect(
      await screen.findByRole("heading", { name: "Import your 3 harvest checks" }),
    ).toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: "Import 3 harvest checks" });
    expect(importButton).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Plant"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    await act(async () => {
      fireEvent.click(importButton);
    });

    expect(mocks.save).toHaveBeenCalledTimes(3);
    const payloads = mocks.save.mock.calls.map(([payload]) => payload);
    expect(payloads.map((p) => p.p_occurred_at)).toEqual([
      new Date(2026, 9, 20, 12).toISOString(),
      new Date(2026, 9, 24, 12).toISOString(),
      new Date(2026, 9, 27, 12).toISOString(),
    ]);
    for (const payload of payloads) {
      expect(payload).toMatchObject({
        p_target_type: "plant",
        p_target_id: "11111111-1111-4111-8111-111111111111",
        p_action: "note",
        p_volume_ml: null,
      });
      // Untyped, so the timeline keeps the "Observation" label.
      expect(payload).not.toHaveProperty("p_details");
      expect(payload.p_note).toContain("Trichome check (Harvest Window Tracker)");
    }
    expect(new Set(payloads.map((p) => p.p_idempotency_key)).size).toBe(3);
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
    expect(screen.queryByTestId("harvest-check-import-prompt")).not.toBeInTheDocument();
    expect(vi.mocked(trackHarvestTrackerEvent)).toHaveBeenCalledWith(
      "harvest_tracker_handoff_imported",
      { count_bucket: "2-5" },
    );
  });

  it("dismiss clears the handoff and saves nothing", async () => {
    logThreeChecksAndClickCta();
    renderPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByTestId("harvest-check-import-prompt")).not.toBeInTheDocument();
  });

  it("with no plant yet, links to Plants and keeps the handoff", async () => {
    mocks.plants = { data: [], isLoading: false, isError: false };
    logThreeChecksAndClickCta();
    renderPrompt();
    expect(await screen.findByRole("link", { name: "Go to Plants" })).toHaveAttribute(
      "href",
      "/plants",
    );
    expect(screen.queryByRole("button", { name: /Import/ })).not.toBeInTheDocument();
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps the handoff and says so when a save fails part way", async () => {
    mocks.save
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "save_failed" });
    logThreeChecksAndClickCta();
    renderPrompt();
    fireEvent.change(await screen.findByLabelText("Plant"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import 3 harvest checks" }));
    });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent("1 of 3 harvest checks saved");
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(true);
    // A retry stays on the same plant, so saved checks replay instead of duplicating.
    expect(screen.getByLabelText("Plant")).toBeDisabled();
  });

  it("binds the plant before the first save, so a lost response or a reload cannot switch it", async () => {
    mocks.plants = {
      data: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Blue Dream #1", tent_id: "tent-1" },
        { id: "22222222-2222-4222-8222-222222222222", name: "Gelato #2", tent_id: "tent-1" },
      ],
      isLoading: false,
      isError: false,
    };
    // The first save commits but its response is lost: nothing counts as saved.
    mocks.save.mockResolvedValueOnce({ ok: false, reason: "network" });
    logThreeChecksAndClickCta();
    const first = renderPrompt();
    fireEvent.change(await screen.findByLabelText("Plant"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import 3 harvest checks" }));
    });
    expect(screen.getByLabelText("Plant")).toBeDisabled();
    first.unmount();

    // After a reload the prompt comes back on the same plant, still locked.
    renderPrompt();
    const select = (await screen.findByLabelText("Plant")) as HTMLSelectElement;
    expect(select.value).toBe("11111111-1111-4111-8111-111111111111");
    expect(select).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import 3 harvest checks" }));
    });
    const targets = new Set(mocks.save.mock.calls.map(([payload]) => payload.p_target_id));
    expect([...targets]).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
  });

  it("drops a binding to a plant that is no longer listed, so the grower can pick again", async () => {
    logThreeChecksAndClickCta();
    const stored = JSON.parse(storage.map.get(HARVEST_HANDOFF_STORAGE_KEY) as string);
    storage.map.set(
      HARVEST_HANDOFF_STORAGE_KEY,
      JSON.stringify({ ...stored, plantId: "99999999-9999-4999-8999-999999999999" }),
    );
    renderPrompt();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The plant this import started on is no longer in your list. Any checks already saved stay on that plant. Choose a plant.",
    );
    const select = screen.getByLabelText("Plant") as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(select.value).toBe("");
    expect(JSON.parse(storage.map.get(HARVEST_HANDOFF_STORAGE_KEY) as string)).not.toHaveProperty(
      "plantId",
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("says the plants could not load instead of asking for a first plant", async () => {
    mocks.plants = { data: undefined, isLoading: false, isError: true };
    logThreeChecksAndClickCta();
    renderPrompt();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your plants could not be loaded. Reload to try again. Your checks stay in this tab.",
    );
    expect(screen.queryByRole("link", { name: "Go to Plants" })).not.toBeInTheDocument();
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(true);
  });

  it("keeps the cached plant list usable after a failed background refetch", async () => {
    mocks.plants = {
      data: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Blue Dream #1", tent_id: "tent-1" },
      ],
      isLoading: false,
      isError: true,
    };
    logThreeChecksAndClickCta();
    renderPrompt();
    const select = (await screen.findByLabelText("Plant")) as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("saves nothing when the plant binding cannot be stored", async () => {
    logThreeChecksAndClickCta();
    renderPrompt();
    fireEvent.change(await screen.findByLabelText("Plant"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    storage.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import 3 harvest checks" }));
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This browser tab could not keep the import, so nothing was saved.",
    );
    expect(screen.getByLabelText("Plant")).not.toBeDisabled();
  });

  it("retries a check dated today with the same instant, so the save replays", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const clickedAt = new Date(2026, 9, 28, 8, 59);
      vi.setSystemTime(clickedAt);
      saveHarvestCheckHandoff(
        {
          target: "peak",
          ranges: createDefaultHarvestRanges(),
          checks: [
            {
              id: 1,
              date: "2026-10-28",
              plant: "",
              clear: 10,
              cloudy: 80,
              amber: 10,
              pistils: "",
              photoNote: "",
            },
          ],
        },
        clickedAt,
      );
      mocks.save.mockResolvedValueOnce({ ok: false, reason: "network" });
      renderPrompt();
      fireEvent.change(await screen.findByLabelText("Plant"), {
        target: { value: "11111111-1111-4111-8111-111111111111" },
      });
      vi.setSystemTime(new Date(2026, 9, 28, 9, 5));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Import 1 harvest check" }));
      });
      vi.setSystemTime(new Date(2026, 9, 28, 9, 10));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Import 1 harvest check" }));
      });
      const [first, retry] = mocks.save.mock.calls.map(([payload]) => payload);
      expect(retry.p_idempotency_key).toBe(first.p_idempotency_key);
      expect(retry.p_occurred_at).toBe(first.p_occurred_at);
      expect(first.p_occurred_at).toBe(clickedAt.toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays on the page and says so when the log cannot be kept", () => {
    storage.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    render(
      <MemoryRouter>
        <HarvestWindowTracker />
      </MemoryRouter>,
    );
    addCheck("2026-10-20", "30", "70", "0");
    const [cta] = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(cta, click);
    expect(click.defaultPrevented).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your log could not be kept for signup in this browser.",
    );
    expect(
      screen.getByRole("link", { name: "continue to signup without it" }).getAttribute("href"),
    ).toBe(HARVEST_WINDOW_CTA_HREF);
    expect(vi.mocked(trackHarvestTrackerEvent)).not.toHaveBeenCalledWith(
      "harvest_tracker_handoff_saved",
      expect.anything(),
    );
  });

  it("ignores and removes a malformed handoff", async () => {
    storage.setItem(HARVEST_HANDOFF_STORAGE_KEY, JSON.stringify({ version: 1, checks: "x" }));
    renderPrompt();
    await waitFor(() => expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false));
    expect(screen.queryByTestId("harvest-check-import-prompt")).not.toBeInTheDocument();
  });

  it("zero checks: the CTA link is unchanged and nothing is stored", () => {
    render(
      <MemoryRouter>
        <HarvestWindowTracker />
      </MemoryRouter>,
    );
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    for (const cta of ctas) expect(cta.getAttribute("href")).toBe(HARVEST_WINDOW_CTA_HREF);
    fireEvent.click(ctas[0]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
