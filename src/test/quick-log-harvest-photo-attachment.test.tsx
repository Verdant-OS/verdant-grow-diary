/**
 * The optional Quick Log harvest photo rides the canonical save as
 * p_photo_url: uploaded first, replayed unchanged on a retry, never written
 * as a separate client diary row, and never carried over to another target.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { HARVEST_PHOTO_UPLOAD_FAILED } from "@/constants/quickLogHarvestPhotoCopy";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const GROW_EVENT_ID = "77777777-7777-4777-8777-000000000200";

const insertMock = vi.fn();
const updateMock = vi.fn();
const rpcMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (...args: unknown[]) => insertMock(table, ...args),
      update: (values: unknown) => {
        const filters: unknown[][] = [];
        const chain = {
          filter: (...args: unknown[]) => {
            filters.push(args);
            return chain;
          },
          select: async () => {
            updateMock(table, values, filters);
            return { data: [{ id: "diary-1" }], error: null };
          },
        };
        return chain;
      },
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => uploadMock(bucket, ...args),
        remove: (...args: unknown[]) => removeMock(bucket, ...args),
      }),
    },
  },
}));

const authState = vi.hoisted(() => ({ user: { id: "user-1" }, loading: false }));
vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function withClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function section(plantId: string) {
  return withClient(
    <QuickLogAllActivitiesSection
      growId="grow-1"
      tentId="tent-1"
      plantId={plantId}
      plantStage="flower"
    />,
  );
}

function openHarvest() {
  if (!screen.queryByTestId("quick-log-all-activities-picker-harvest")) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
}

function chooseHarvestPhoto() {
  const file = new File([new Uint8Array([1, 2, 3])], "harvest.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-photo"), {
    target: { files: [file] },
  });
}

const saveEventCalls = () => rpcMock.mock.calls.filter(([fn]) => fn === "quicklog_save_event");
const photoArg = (call: unknown[]) => (call[1] as { p_photo_url: string | null }).p_photo_url;

describe("Quick Log harvest photo through the canonical save", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearLocalStorageForTest();
    insertMock.mockReset();
    updateMock.mockReset();
    rpcMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: GROW_EVENT_ID }, error: null });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("uploads first, passes the path as p_photo_url and writes no client diary row", async () => {
    render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(saveEventCalls()).toHaveLength(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe("diary-photos");
    const path = String(uploadMock.mock.calls[0][1]);
    expect(path).toMatch(/^user-1\/grow-1\//);
    expect(photoArg(saveEventCalls()[0])).toBe(path);
    expect(insertMock).not.toHaveBeenCalled();
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][0]).toBe("diary_entries");
    expect(updateMock.mock.calls[0][1]).toEqual({ photo_url: path });
    expect(updateMock.mock.calls[0][2]).toEqual([
      ["details->>linked_grow_event_id", "eq", GROW_EVENT_ID],
    ]);
  });

  it("drops a chosen harvest photo when the target changes", async () => {
    const view = render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    view.rerender(section("plant-2"));
    openHarvest();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(saveEventCalls()).toHaveLength(1));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(photoArg(saveEventCalls()[0])).toBeNull();
  });

  it("saves nothing when the photo upload fails", async () => {
    uploadMock.mockResolvedValue({ error: { message: "storage down" } });
    render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    expect(await screen.findByText(HARVEST_PHOTO_UPLOAD_FAILED)).toBeInTheDocument();
    expect(saveEventCalls()).toHaveLength(0);
  });

  it("replays the same photo and key when an unconfirmed save is retried", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    const retry = await screen.findByTestId("quick-log-all-activities-retry-original");
    expect(removeMock).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(saveEventCalls()).toHaveLength(2));
    const [first, second] = saveEventCalls();
    expect(photoArg(second)).toBe(photoArg(first));
    expect(photoArg(first)).toBe(String(uploadMock.mock.calls[0][1]));
    expect((second[1] as { p_idempotency_key: string }).p_idempotency_key).toBe(
      (first[1] as { p_idempotency_key: string }).p_idempotency_key,
    );
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
