/**
 * The optional Quick Log harvest photo attaches to the confirmed harvest
 * event through the existing photo-diary path. It never writes a separate
 * `harvests` row, and it never carries over to another target.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const GROW_EVENT_ID = "77777777-7777-4777-8777-000000000200";

const insertMock = vi.fn();
const rpcMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const owned = {
        eq: () => owned,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return {
        insert: (...args: unknown[]) => insertMock(table, ...args),
        select: () => owned,
      };
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => uploadMock(bucket, ...args),
        remove: (...args: unknown[]) => removeMock(bucket, ...args),
      }),
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
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

describe("Quick Log harvest photo attachment", () => {
  beforeEach(() => {
    insertMock.mockReset();
    rpcMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    toastError.mockReset();
    rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: GROW_EVENT_ID }, error: null });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("attaches the photo to the confirmed harvest event and writes no harvests row", async () => {
    render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe("diary-photos");
    expect(String(uploadMock.mock.calls[0][1])).toMatch(/^user-1\/grow-1\//);
    expect(insertMock.mock.calls.map((call) => call[0])).toEqual(["diary_entries"]);
    const row = insertMock.mock.calls[0][1] as {
      plant_id: string;
      tent_id: string;
      photo_url: string;
      details: Record<string, string>;
    };
    expect(row.plant_id).toBe("plant-1");
    expect(row.tent_id).toBe("tent-1");
    expect(row.photo_url).toBe(uploadMock.mock.calls[0][1]);
    expect(row.details).toMatchObject({
      event_type: "quicklog_photo_attachment",
      attached_to_action: "harvest",
      grow_event_id: GROW_EVENT_ID,
    });
  });

  it("drops a chosen harvest photo when the target changes", async () => {
    const view = render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    view.rerender(section("plant-2"));
    openHarvest();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("removes the uploaded object and says so when the diary row is refused", async () => {
    insertMock.mockResolvedValue({ error: { message: "denied", code: "42501" } });
    render(section("plant-1"));
    openHarvest();
    chooseHarvestPhoto();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(removeMock).toHaveBeenCalled());
    expect(removeMock.mock.calls[0][0]).toBe("diary-photos");
    expect(removeMock.mock.calls[0][1]).toEqual([uploadMock.mock.calls[0][1]]);
    expect(toastError).toHaveBeenCalledWith(
      "The harvest was saved, but its photo was not. Add it with the Photo activity.",
    );
  });
});
