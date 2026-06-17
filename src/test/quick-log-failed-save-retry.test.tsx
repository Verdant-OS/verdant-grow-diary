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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
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
      <QuickLogV2Sheet
        open={true}
        onOpenChange={vi.fn()}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
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
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toBeInTheDocument(),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-save-retry")).toBeInTheDocument(),
    );

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
  });

  it("Retry button is disabled while a save is already in flight", async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveRpc = res;
        }),
    );
    renderSheet("plant:plant-1");
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Save is pending; there's no inline error yet, so no Retry rendered.
    expect(screen.queryByTestId("qlv2-save-retry")).toBeNull();

    // Resolve as failure so the Retry renders.
    resolveRpc({ data: { ok: false, reason: "save_failed" }, error: null });
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-save-retry")).toBeInTheDocument(),
    );

    // Kick off a slow retry to assert disabled-while-saving semantics.
    let resolveRetry: (v: unknown) => void = () => {};
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveRetry = res;
        }),
    );
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-save-retry")).toBeDisabled(),
    );

    // Click again while disabled → must not enqueue another RPC.
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    expect(rpcMock).toHaveBeenCalledTimes(2);

    resolveRetry({
      data: { ok: true, grow_event_id: "ge-1", environment_event_id: null },
      error: null,
    });
  });
});
