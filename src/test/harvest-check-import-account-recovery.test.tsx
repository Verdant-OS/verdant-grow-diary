import { act, fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const mocks = vi.hoisted(() => ({
  userId: "user-a",
  save: vi.fn(),
  refresh: vi.fn(),
  track: vi.fn(),
}));

const PLANT_A = "11111111-1111-4111-8111-111111111111";
const PLANT_B = "22222222-2222-4222-8222-222222222222";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: mocks.userId === "user-a" ? PLANT_A : PLANT_B,
        name: "My plant",
        tent_id: "tent",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: mocks.save }),
}));
vi.mock("@/lib/quickLogV2RefreshRules", () => ({
  applyQuickLogV2Refresh: mocks.refresh,
}));
vi.mock("@/lib/harvestWindowAnalytics", () => ({
  trackHarvestTrackerEvent: mocks.track,
}));

import HarvestCheckImportPrompt from "@/components/HarvestCheckImportPrompt";
import {
  HARVEST_HANDOFF_STORAGE_KEY,
  saveHarvestCheckHandoff,
} from "@/lib/harvestCheckHandoffStore";
import { createDefaultHarvestRanges } from "@/lib/harvestWindowRules";

function storeHandoff(count: number, note: string, minutesAgo: number) {
  expect(
    saveHarvestCheckHandoff(
      {
        target: "peak",
        ranges: createDefaultHarvestRanges(),
        checks: Array.from({ length: count }, (_, index) => ({
          id: index + 1,
          date: "2026-10-10",
          plant: "Plant",
          clear: 10,
          cloudy: 80,
          amber: 10,
          pistils: "",
          photoNote: note,
        })),
      },
      new Date(Date.now() - minutesAgo * 60_000),
    ),
  ).toBe(true);
}

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HarvestCheckImportPrompt />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, updateIdentity: () => view.rerender(tree()) };
}

type PromptView = ReturnType<typeof renderPrompt>;

async function startImport(view: PromptView, plantId: string, count: number) {
  fireEvent.change(await view.findByLabelText("Plant"), { target: { value: plantId } });
  fireEvent.click(view.getByRole("button", { name: `Import ${count} harvest checks` }));
}

describe("harvest import recovery after an account change", () => {
  let pending: Array<() => void>;

  async function resolveNextSave() {
    expect(pending.length).toBeGreaterThan(0);
    await act(async () => pending.shift()?.());
  }

  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    mocks.userId = "user-a";
    mocks.save.mockReset();
    mocks.refresh.mockReset();
    mocks.track.mockReset();
    pending = [];
    mocks.save.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve({ ok: true }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lets the new account select its plant or dismiss while the old save is pending", async () => {
    storeHandoff(3, "original", 10);
    const view = renderPrompt();
    await startImport(view, PLANT_A, 3);
    expect(view.getByRole("button", { name: "Importing…" })).toBeDisabled();

    mocks.userId = "user-b";
    view.updateIdentity();

    expect(await view.findByLabelText("Plant")).toBeEnabled();
    expect(view.getByLabelText("Plant")).toHaveValue("");
    expect(view.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(view.queryByRole("button", { name: "Importing…" })).toBeNull();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).not.toBeNull();
    fireEvent.change(view.getByLabelText("Plant"), { target: { value: PLANT_B } });
    expect(view.getByRole("button", { name: "Import 3 harvest checks" })).toBeEnabled();
    fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
    await resolveNextSave();

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(view.queryByTestId("harvest-check-import-prompt")).toBeNull();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("rereads the handoff and keeps a new import busy when the old save settles", async () => {
    storeHandoff(3, "original", 10);
    const view = renderPrompt();
    await startImport(view, PLANT_A, 3);

    storeHandoff(2, "replacement", 1);
    mocks.userId = "user-b";
    view.updateIdentity();
    expect(
      await view.findByRole("heading", { name: "Import your 2 harvest checks" }),
    ).toBeVisible();
    expect(view.getByLabelText("Plant")).toBeEnabled();
    expect(view.getByLabelText("Plant")).toHaveValue("");
    await startImport(view, PLANT_B, 2);
    const newHandoff = sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY);
    expect(mocks.save).toHaveBeenCalledTimes(2);

    await resolveNextSave(); // The old account's in-flight save.

    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).toBe(newHandoff);
    expect(view.getByRole("button", { name: "Importing…" })).toBeDisabled();
    expect(view.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(view.getByLabelText("Plant")).toBeDisabled();
    expect(view.queryByRole("alert")).toBeNull();

    await resolveNextSave(); // The new account's first check.
    expect(mocks.save).toHaveBeenCalledTimes(3);
    for (const [input] of mocks.save.mock.calls.slice(1)) {
      expect(input.p_target_id).toBe(PLANT_B);
      expect(input.p_note).toContain("replacement");
    }
    await resolveNextSave(); // The new account's second check.

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledWith(expect.anything(), {
      targetType: "plant",
      targetId: PLANT_B,
      tentId: "tent",
    });
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("harvest-check-import-prompt")).toBeNull();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("hides the old prompt when the handoff was removed before the identity changed", async () => {
    storeHandoff(3, "original", 10);
    const view = renderPrompt();
    await startImport(view, PLANT_A, 3);
    sessionStorage.removeItem(HARVEST_HANDOFF_STORAGE_KEY);
    mocks.userId = "user-b";
    view.updateIdentity();

    expect(view.queryByTestId("harvest-check-import-prompt")).toBeNull();
    await resolveNextSave();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("keeps the same account's import running through ordinary rerenders", async () => {
    storeHandoff(3, "original", 10);
    const view = renderPrompt();
    await startImport(view, PLANT_A, 3);
    view.updateIdentity(); // useAuth returns a new user object with the same id.

    expect(view.getByRole("button", { name: "Importing…" })).toBeDisabled();
    await resolveNextSave();
    await resolveNextSave();
    await resolveNextSave();

    expect(mocks.save).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("harvest-check-import-prompt")).toBeNull();
    expect(sessionStorage.getItem(HARVEST_HANDOFF_STORAGE_KEY)).toBeNull();
  });
});
