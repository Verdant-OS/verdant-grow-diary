import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  userId: "user-a" as string | null,
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Blue Dream #1", tent_id: "t1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: mocks.save, saving: false, error: null }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));
vi.mock("@/lib/harvestWindowAnalytics", () => ({ trackHarvestTrackerEvent: vi.fn() }));

import HarvestCheckImportPrompt from "@/components/HarvestCheckImportPrompt";
import {
  HARVEST_HANDOFF_STORAGE_KEY,
  saveHarvestCheckHandoff,
} from "@/lib/harvestCheckHandoffStore";
import { createDefaultHarvestRanges, type HarvestCheck } from "@/lib/harvestWindowRules";

// Handoffs expire after 24 h, so timestamps are relative to now.
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const PLANT = "11111111-1111-4111-8111-111111111111";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function checks(count: number, note: string): HarvestCheck[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    date: `2026-10-${String(i + 10).padStart(2, "0")}`,
    plant: "Plant A",
    clear: 10,
    cloudy: 80,
    amber: 10,
    pistils: "",
    photoNote: note,
  }));
}

function storeHandoff(count: number, note: string, at: Date) {
  expect(
    saveHarvestCheckHandoff(
      { target: "peak", ranges: createDefaultHarvestRanges(), checks: checks(count, note) },
      at,
    ),
  ).toBe(true);
}

function deferredSaves() {
  const pending: Array<() => void> = [];
  mocks.save.mockImplementation(
    () => new Promise((resolve) => pending.push(() => resolve({ ok: true }))),
  );
  return {
    resolveNext: async () => {
      await act(async () => {
        pending.shift()?.();
      });
    },
  };
}

function ui() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HarvestCheckImportPrompt />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function startImport(view: ReturnType<typeof render>) {
  fireEvent.change(await view.findByLabelText("Plant"), { target: { value: PLANT } });
  fireEvent.click(view.getByRole("button", { name: "Import 3 harvest checks" }));
}

const storedNote = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.map.get(HARVEST_HANDOFF_STORAGE_KEY) ?? "null")?.checks?.[0]?.photoNote;

describe("harvest import operation lifetime", () => {
  let storage = memoryStorage();

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    mocks.userId = "user-a";
    mocks.save.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops saving and keeps a newer handoff when the prompt unmounts mid-import", async () => {
    storeHandoff(3, "old", minutesAgo(10));
    const saves = deferredSaves();
    const view = render(ui());
    await startImport(view);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    view.unmount();
    storeHandoff(3, "newer", minutesAgo(1));
    await saves.resolveNext();

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(storedNote(storage)).toBe("newer");
  });

  it("stops saving and keeps a newer handoff when the signed-in account changes", async () => {
    storeHandoff(3, "old", minutesAgo(10));
    const saves = deferredSaves();
    const view = render(ui());
    await startImport(view);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    mocks.userId = "user-b";
    view.rerender(ui());
    storeHandoff(3, "newer", minutesAgo(1));
    await saves.resolveNext();

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(storedNote(storage)).toBe("newer");
  });

  it("does not delete a newer handoff stored while a completed import was running", async () => {
    storeHandoff(3, "old", minutesAgo(10));
    const saves = deferredSaves();
    const view = render(ui());
    await startImport(view);
    storeHandoff(3, "newer", minutesAgo(1));
    await saves.resolveNext();
    await saves.resolveNext();
    await saves.resolveNext();

    expect(mocks.save).toHaveBeenCalledTimes(3);
    expect(storedNote(storage)).toBe("newer");
  });

  it("still saves every check and clears its own handoff when nothing changes", async () => {
    storeHandoff(3, "old", minutesAgo(10));
    const saves = deferredSaves();
    const view = render(ui());
    await startImport(view);
    await saves.resolveNext();
    await saves.resolveNext();
    await saves.resolveNext();

    expect(mocks.save).toHaveBeenCalledTimes(3);
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
  });
});
