/**
 * Tent and harvest photo fields for owner badges.
 * A photo is optional. Saving with no file still persists the row.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const insertMock = vi.fn();
const singleMock = vi.fn();
const rpcMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const growTypeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const insert = (...args: unknown[]) => {
        insertMock(table, ...args);
        return { select: () => ({ single: singleMock }) };
      };
      if (table === "tents") {
        return { update: updateMock, insert };
      }
      if (table === "grows") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: growTypeMock }) }),
        };
      }
      return { insert };
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
      }),
    },
  },
}));

// One stable user object across renders, like the real auth store, so a
// stale useCallback closure over harvestPhotoFile cannot hide behind
// per-render identity churn.
const authState = vi.hoisted(() => ({ user: { id: "user-1" }, loading: false }));
vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const growsState = vi.hoisted(() => ({
  grows: [{ id: "grow-1", name: "Room" }] as Array<{ id: string; name: string }>,
  activeGrowId: "grow-1" as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

import CreateTentDialog from "@/components/CreateTentDialog";
import EditTentDialog from "@/components/EditTentDialog";

const tent = {
  id: "tent-1",
  name: "Fixture Tent",
  brand: "Gorilla",
  size: "4x4",
  stage: "seedling",
  light: { on: true, schedule: "18/6", wattage: 240 },
};

function withClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("badge tent and harvest photo fields", () => {
  beforeEach(() => {
    // Pending-save recovery records persist in web storage between renders.
    window.sessionStorage.clear();
    window.localStorage.clear();
    eqMock.mockReset();
    updateMock.mockClear();
    insertMock.mockReset();
    singleMock.mockReset();
    rpcMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    removeMock.mockResolvedValue({ data: [], error: null });
    growTypeMock.mockReset();
    toastError.mockReset();
    uploadMock.mockResolvedValue({ error: null });
    growTypeMock.mockResolvedValue({ data: { grow_type: "outdoor" }, error: null });
    eqMock.mockResolvedValue({ error: null });
    singleMock.mockResolvedValue({
      data: { id: "tent-new", name: "Tent #1", grow_id: "grow-1" },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000200" },
      error: null,
    });
  });

  it("renders an optional photo on create tent and saves without one", async () => {
    render(withClient(<CreateTentDialog initiallyOpen defaultGrowId="grow-1" />));
    expect(screen.getByTestId("create-tent-photo")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Tent #1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create tent|save/i }));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    const payload = insertMock.mock.calls[0]?.[1] as { photo_url?: string };
    expect(payload.photo_url ?? null).toBeNull();
  });

  it("renders an optional photo on edit tent and saves without one", async () => {
    render(withClient(<EditTentDialog tent={tent} />));
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    expect(screen.getByTestId("edit-tent-photo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as unknown as Array<[{ photo_url?: string }]>)[0]?.[0];
    expect(payload.photo_url).toBeUndefined();
  });

  it("renders an optional harvest photo and saves the harvest form without one", async () => {
    render(
      withClient(
        <QuickLogAllActivitiesSection
          growId="grow-1"
          tentId="tent-1"
          plantId="plant-1"
          plantStage="flower"
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
    expect(await screen.findByTestId("quick-log-all-activities-harvest-photo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(insertMock).not.toHaveBeenCalled();
  });

  function renderHarvestSection() {
    render(
      withClient(
        <QuickLogAllActivitiesSection
          growId="grow-1"
          tentId="tent-1"
          plantId="plant-1"
          plantStage="flower"
        />,
      ),
    );
  }

  async function openHarvest() {
    if (!screen.queryByTestId("quick-log-all-activities-picker-harvest")) {
      fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    }
    fireEvent.click(await screen.findByTestId("quick-log-all-activities-picker-harvest"));
    return (await screen.findByTestId(
      "quick-log-all-activities-harvest-photo",
    )) as HTMLInputElement;
  }

  const harvestInserts = () => insertMock.mock.calls.filter(([table]) => table === "harvests");

  it("uploads a harvest photo once, then a second harvest save inserts no harvests row", async () => {
    renderHarvestSection();
    const input = await openHarvest();
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-dry"), {
      target: { value: "28" },
    });
    fireEvent.change(input, {
      target: { files: [new File(["img"], "bud.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(harvestInserts()).toHaveLength(1));
    const row = harvestInserts()[0]?.[1] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: "user-1",
      grow_id: "grow-1",
      grow_type: "outdoor",
      yield_grams: 28,
    });
    expect(String(row.photo_url)).toMatch(/^storage:\/\/[^/]+\/user-1\/harvests\//);
    expect(input.value).toBe("");
    await waitFor(() =>
      expect(screen.queryByTestId("quick-log-all-activities-harvest-photo")).toBeNull(),
    );

    // Second harvest with the picker untouched: the activity saves, but the
    // first photo must not be uploaded again or attached to a new row.
    await openHarvest();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("quick-log-all-activities-harvest-photo")).toBeNull(),
    );
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(harvestInserts()).toHaveLength(1);
  });

  it("keeps Save disabled until the harvest photo upload settles, so one click is one row", async () => {
    let releaseUpload: (value: { error: null }) => void = () => {};
    uploadMock.mockReturnValue(
      new Promise((resolve) => {
        releaseUpload = resolve;
      }),
    );
    renderHarvestSection();
    const input = await openHarvest();
    fireEvent.change(input, {
      target: { files: [new File(["img"], "bud.jpg", { type: "image/jpeg" })] },
    });
    const save = screen.getByTestId("quick-log-all-activities-save");
    fireEvent.click(save);
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    // While the photo upload is pending, no control may start a second
    // save: Save is either disabled or replaced by the pending-save panel,
    // and that panel's retry is refused by the in-flight lock.
    const visibleSave = screen.queryByTestId("quick-log-all-activities-save");
    if (visibleSave) expect(visibleSave).toBeDisabled();
    fireEvent.click(save);
    const retry = screen.queryByTestId("quick-log-all-activities-retry-original");
    if (retry) fireEvent.click(retry);
    releaseUpload({ error: null });
    await waitFor(() => expect(harvestInserts()).toHaveLength(1));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("writes no harvests row when the parent grow type cannot be verified", async () => {
    growTypeMock.mockResolvedValue({ data: null, error: null });
    renderHarvestSection();
    const input = await openHarvest();
    fireEvent.change(input, {
      target: { files: [new File(["img"], "bud.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("The harvest photo was not saved."),
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(harvestInserts()).toHaveLength(0);
  });

  const photo = () => new File(["img"], "tent.jpg", { type: "image/jpeg" });

  function deferredUpload() {
    let release: (value: { error: null }) => void = () => {};
    uploadMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    return () => release({ error: null });
  }

  function openEditTent() {
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    return screen.getByTestId("edit-tent-photo") as HTMLInputElement;
  }

  const tentPhotoPath = () => String(uploadMock.mock.calls[0]?.[0]);

  it("create tent: a double click during a pending photo upload creates one tent", async () => {
    const releaseUpload = deferredUpload();
    render(withClient(<CreateTentDialog initiallyOpen defaultGrowId="grow-1" />));
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), { target: { value: "Tent #1" } });
    fireEvent.change(screen.getByTestId("create-tent-photo"), { target: { files: [photo()] } });
    const submit = screen.getByRole("button", { name: /create tent|save/i });
    fireEvent.click(submit);
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    releaseUpload();
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]?.[1] as { photo_url?: string };
    expect(payload.photo_url).toMatch(/^storage:\/\//);
  });

  it("create tent: a definitive insert error removes the uploaded photo", async () => {
    uploadMock.mockResolvedValue({ error: null });
    singleMock.mockResolvedValue({ data: null, error: { code: "23514", message: "rejected" } });
    render(withClient(<CreateTentDialog initiallyOpen defaultGrowId="grow-1" />));
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), { target: { value: "Tent #1" } });
    fireEvent.change(screen.getByTestId("create-tent-photo"), { target: { files: [photo()] } });
    fireEvent.click(screen.getByRole("button", { name: /create tent|save/i }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(removeMock).toHaveBeenCalledWith([tentPhotoPath()]);
  });

  it("edit tent: an invalid size is rejected before any photo upload", async () => {
    render(withClient(<EditTentDialog tent={tent} />));
    const input = openEditTent();
    fireEvent.change(screen.getByTestId("edit-tent-size"), { target: { value: "4x-4" } });
    fireEvent.change(input, { target: { files: [photo()] } });
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(uploadMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("edit tent: a photo picked then cancelled is not uploaded by the next edit", async () => {
    render(withClient(<EditTentDialog tent={tent} />));
    fireEvent.change(openEditTent(), { target: { files: [photo()] } });
    fireEvent.keyDown(screen.getByTestId("edit-tent-dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("edit-tent-dialog")).toBeNull());
    openEditTent();
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).not.toHaveBeenCalled();
    const payload = (updateMock.mock.calls as unknown as Array<[{ photo_url?: string }]>)[0]?.[0];
    expect(payload.photo_url).toBeUndefined();
  });

  it("edit tent: a saved photo is not uploaded again by a later text-only edit", async () => {
    uploadMock.mockResolvedValue({ error: null });
    render(withClient(<EditTentDialog tent={tent} />));
    fireEvent.change(openEditTent(), { target: { files: [photo()] } });
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(screen.queryByTestId("edit-tent-dialog")).toBeNull());
    openEditTent();
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const second = (updateMock.mock.calls as unknown as Array<[{ photo_url?: string }]>)[1]?.[0];
    expect(second.photo_url).toBeUndefined();
  });

  it("edit tent: a double submit during a pending photo upload sends one update", async () => {
    const releaseUpload = deferredUpload();
    render(withClient(<EditTentDialog tent={tent} />));
    fireEvent.change(openEditTent(), { target: { files: [photo()] } });
    const submit = screen.getByTestId("edit-tent-submit");
    fireEvent.click(submit);
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    releaseUpload();
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("edit tent: removes the uploaded photo only when the update definitively failed", async () => {
    uploadMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValueOnce({ error: { code: "42501", message: "denied" } });
    eqMock.mockResolvedValueOnce({ error: { message: "Failed to fetch" } });
    render(withClient(<EditTentDialog tent={tent} />));
    const input = openEditTent();
    fireEvent.change(input, { target: { files: [photo()] } });
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
    expect(removeMock).toHaveBeenCalledWith([tentPhotoPath()]);

    // Network loss may have committed the reference: keep the object.
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
