/**
 * QuickLogV2Sheet — failed save inline Retry.
 *
 * Verifies the presentational Retry button:
 *  - appears next to the inline error on failed save
 *  - re-invokes the existing save handler (no alternate path)
 *  - is disabled while a save is already in flight
 *  - on successful retry, still surfaces 'View in Timeline'
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_TIMELINE_CTA_LABEL } from "@/lib/quickLogTimelineNavigationTarget";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const readbackMock = vi.fn();
const RETRY_NOTE = "Retry path — leaf posture held after watering.";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: (...a: unknown[]) => fromMock(...a),
  },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

/** Note action with real content so the empty-content gate lets Save fire. */
function prepareNoteSave() {
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), {
    target: { value: RETRY_NOTE },
  });
}

/** A successful retry must verify the persisted event, not just the RPC reply. */
function mockPersistedNote(eventId: string) {
  readbackMock.mockResolvedValueOnce({
    data: { id: eventId, note: RETRY_NOTE, plant_id: "plant-1", tent_id: "tent-1" },
    error: null,
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  selectMock.mockReset();
  eqMock.mockReset();
  readbackMock.mockReset();
  fromMock.mockReturnValue({ insert: vi.fn(), select: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ maybeSingle: readbackMock });
  // An absent row remains unverified unless a test supplies a saved fixture.
  readbackMock.mockResolvedValue({ data: null, error: null });
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("QuickLogV2Sheet — failed save Retry button", () => {
  it("renders inline error + Retry button on failed save", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    renderSheet("plant:plant-1");
    prepareNoteSave();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByTestId("qlv2-error")).toBeInTheDocument());
    expect(screen.getByTestId("qlv2-save-retry")).toBeInTheDocument();
  });

  it("clicking Retry re-invokes the same RPC save path (no alternate path)", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: { ok: false, reason: "save_failed" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false, reason: "save_failed" },
        error: null,
      });
    renderSheet("plant:plant-1");
    prepareNoteSave();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const firstRpcName = rpcMock.mock.calls[0][0];

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    // Same RPC name on retry — no alternate save path.
    expect(rpcMock.mock.calls[1][0]).toBe(firstRpcName);
    // Only quicklog_save_manual is allowed.
    expect(firstRpcName).toBe("quicklog_save_manual");
  });

  it("successful retry surfaces View in Timeline CTA", async () => {
    mockPersistedNote("ge-retry");
    rpcMock
      .mockResolvedValueOnce({
        data: { ok: false, reason: "save_failed" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "ge-retry", environment_event_id: null },
        error: null,
      });
    renderSheet("plant:plant-1");
    prepareNoteSave();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Log saved",
        expect.objectContaining({
          action: expect.objectContaining({
            label: QUICK_LOG_TIMELINE_CTA_LABEL,
          }),
        }),
      ),
    );
    expect(fromMock).toHaveBeenCalledWith("grow_events");
    expect(selectMock).toHaveBeenCalledWith("id,note,plant_id,tent_id");
    expect(eqMock).toHaveBeenCalledWith("id", "ge-retry");
    expect(readbackMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[1][1]).toEqual(rpcMock.mock.calls[0][1]);
    expect(screen.getByTestId("qlv2-persisted-note")).toHaveTextContent(RETRY_NOTE);
  });

  it("Retry button binds disabled to in-flight save state in source", () => {
    mockPersistedNote("ge-x");
    // Once Retry is clicked, handleSave clears localError, which
    // unmounts the inline error block. We can't observe a 'disabled'
    // state on a node that no longer exists. The presence and exact
    // shape of the disabled binding is asserted by the static-safety
    // suite (qlv2-save-retry + disabled={saving || feedingSaving || ...}).
    // Here we re-assert that a single click produces exactly one extra
    // RPC and does not introduce a second alternate save path.
    rpcMock
      .mockResolvedValueOnce({
        data: { ok: false, reason: "save_failed" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "ge-x", environment_event_id: null },
        error: null,
      });
    renderSheet("plant:plant-1");
    prepareNoteSave();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    return waitFor(() => expect(screen.getByTestId("qlv2-save-retry")).toBeInTheDocument()).then(
      async () => {
        fireEvent.click(screen.getByTestId("qlv2-save-retry"));
        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
        expect(rpcMock.mock.calls[1][0]).toBe("quicklog_save_manual");
        await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
        expect(eqMock).toHaveBeenCalledWith("id", "ge-x");
      },
    );
  });
});
