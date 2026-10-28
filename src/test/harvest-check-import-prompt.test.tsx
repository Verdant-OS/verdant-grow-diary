import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const mocks = vi.hoisted(() => ({
  plants: { data: [] as { id: string; name: string; tent_id: string | null }[], isLoading: false },
  save: vi.fn(),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => mocks.plants }));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: mocks.save, saving: false, error: null }),
}));
vi.mock("@/lib/harvestWindowAnalytics", () => ({ trackHarvestTrackerEvent: vi.fn() }));

import HarvestCheckImportPrompt from "@/components/HarvestCheckImportPrompt";
import { HARVEST_HANDOFF_STORAGE_KEY } from "@/lib/harvestCheckHandoffStore";
import { trackHarvestTrackerEvent } from "@/lib/harvestWindowAnalytics";
import { HARVEST_WINDOW_CTA_HREF } from "@/lib/harvestWindowRules";
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
      "2026-10-20T12:00:00.000Z",
      "2026-10-24T12:00:00.000Z",
      "2026-10-27T12:00:00.000Z",
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
    mocks.plants = { data: [], isLoading: false };
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
