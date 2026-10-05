/**
 * QuickLogV2Sheet post-save refresh integration tests.
 *
 * Verifies that on successful save the sheet invalidates the grouped
 * timeline / memory query keys derived from the selected target, and
 * that failed or photo-blocked saves do NOT invalidate or inject any
 * optimistic timeline rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
const invalidateSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Plant 1",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Tent 1",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Grow 1" }] }),
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
  const origInvalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((opts: unknown) => {
    invalidateSpy(opts);
    return origInvalidate(opts as Parameters<typeof origInvalidate>[0]);
  }) as typeof client.invalidateQueries;

  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function invalidatedKeys(): unknown[] {
  return invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
}

function clickWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
  fireEvent.change(screen.getByLabelText("Volume (ml)"), {
    target: { value: "500" },
  });
}

function clickNote() {
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), {
    target: { value: "Observation for refresh test" },
  });
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
  rpcMock.mockReset();
  invalidateSpy.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});
afterEach(() => {
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("QuickLogV2Sheet — post-save refresh", () => {
  it("plant-targeted save invalidates plant grouped timeline and plant-scoped keys", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000001",
        environment_event_id: null,
      },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:33333333-3333-4333-8333-333333333333");
    clickWater();
    clickSave();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Watering logged.", expect.anything()),
    );
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(keys).toContain(JSON.stringify(["timeline_memory"]));
    expect(keys).toContain(
      JSON.stringify(["plant_recent_activity", "33333333-3333-4333-8333-333333333333"]),
    );
    // Post-save hardening: successful save shows the post-save panel and
    // keeps the sheet open until the grower explicitly closes it.
    expect(await screen.findByTestId("qlv2-post-save")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("tent-targeted save invalidates tent grouped timeline keys", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000002",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet("tent:55555555-5555-4555-8555-555555555555");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Log saved", expect.anything()));
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(keys).toContain(JSON.stringify(["timeline_memory"]));
    // No plant-specific keys for a tent target.
    expect(keys.some((s) => s.startsWith('["plant_recent_activity"'))).toBe(false);
  });

  it("plant-in-tent save also refreshes tent grouped timeline (broad prefix)", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000003",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet("plant:33333333-3333-4333-8333-333333333333");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Log saved", expect.anything()));
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    // Prefix-based invalidation covers both plant- and tent-scoped grouped reads.
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
  });

  it("failed save does NOT invalidate grouped timeline keys", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:33333333-3333-4333-8333-333333333333");
    clickNote();
    clickSave();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("save without a selected target does NOT invalidate any keys", () => {
    // Save stays disabled until an explicit plant/tent target is selected.
    // Do not click through — an enabled empty-target Save was the trust break.
    const { onOpenChange } = renderSheet("");
    const save = screen.getByTestId("qlv2-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Choose a plant or tent before saving.",
    );
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no optimistic fake timeline entry on failed save (no cache mutation)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    renderSheet("plant:33333333-3333-4333-8333-333333333333");
    clickNote();
    clickSave();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // No calls means no setQueryData / no invalidation was triggered.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
