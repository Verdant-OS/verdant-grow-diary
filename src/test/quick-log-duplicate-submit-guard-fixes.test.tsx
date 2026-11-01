/**
 * Main FIX REQUEST #2647 (Reviewer C): P1, P2-1, P2-3 (P3 timeout not in scope).
 * Network, auth and storage are mocked. No real credentials.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createQuickLogSubmitGuard,
} from "@/lib/quickLogDuplicateSubmitGuard";

const rpcMock = vi.fn();
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

type R = { ok: boolean; id?: string };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("guard throw path (P2-3)", () => {
  it("releases the guard when execute throws, so the same payload can retry", async () => {
    const guard = createQuickLogSubmitGuard<R>(() => ({ ok: false }));
    const execute = vi
      .fn<() => Promise<R>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, id: "row-1" });
    await expect(guard.run({ p_note: "a" }, execute)).rejects.toThrow("network down");
    expect(guard.state.phase).toBe("idle");
    await expect(guard.run({ p_note: "a" }, execute)).resolves.toEqual({ ok: true, id: "row-1" });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("different payload during flight (P2-1)", () => {
  it("refuses a different payload instead of handing it the first save's result", async () => {
    const guard = createQuickLogSubmitGuard<R>(() => ({ ok: false, id: "blocked" }));
    const first = deferred<R>();
    const execute = vi.fn(() => first.promise);
    const a = guard.run({ p_note: "first" }, execute);
    const b = await guard.run({ p_note: "second" }, execute);
    expect(b).toEqual({ ok: false, id: "blocked" });
    expect(execute).toHaveBeenCalledTimes(1);
    first.resolve({ ok: true, id: "row-1" });
    await expect(a).resolves.toEqual({ ok: true, id: "row-1" });
  });
});

describe("later deliberate save (P1)", () => {
  it("never remembers a completed save", async () => {
    const guard = createQuickLogSubmitGuard<R>(() => ({ ok: false }));
    const execute = vi.fn(async () => ({ ok: true }));
    await guard.run({ p_note: "same" }, execute);
    await guard.run({ p_note: "same" }, execute);
    await guard.run({ p_note: "same" }, execute);
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("QuickLogV2Sheet (P1, P2-3)", () => {
  function renderSheet() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
      </QueryClientProvider>,
    );
  }
  const noteBox = () => screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
  const saveCalls = () => rpcMock.mock.calls.filter((c) => c[0] === "quicklog_save_manual");

  it("a double tap writes once, and a later identical save still writes", async () => {
    const pending = deferred<unknown>();
    rpcMock.mockImplementation((name: string) =>
      name === "quicklog_save_manual"
        ? saveCalls().length === 1
          ? pending.promise
          : Promise.resolve({
              data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000002" },
              error: null,
            })
        : Promise.resolve({ data: null, error: null }),
    );
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Same note" } });
    const save = screen.getByTestId("qlv2-save");
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(saveCalls().length).toBe(1));
    pending.resolve({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
      error: null,
    });
    await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());
    expect(saveCalls().length).toBe(1);

    // Deliberate later save of the identical note via "Log another".
    fireEvent.click(await screen.findByTestId("quick-log-post-save-another"));
    await waitFor(() => expect(noteBox()).toBeTruthy());
    fireEvent.change(noteBox(), { target: { value: "Same note" } });
    await waitFor(() =>
      expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(saveCalls().length).toBe(2));
  });
});
