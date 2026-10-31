import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test", is_archived: false }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

describe("Quick Log observation draft", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "invalid_details" },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  async function failNote(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    renderSheet();
    const note = await screen.findByTestId("qlv2-note");
    fireEvent.change(note, { target: { value: "First leaves look pale" } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    const retry = await screen.findByTestId("qlv2-save-retry");
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(rpcMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const keys = rpcMock.mock.calls.map((call) => call[1]?.p_idempotency_key);
    expect(new Set(keys).size).toBe(1);
    expect(screen.getByTestId("qlv2-note")).toHaveValue("First leaves look pale");
  }

  it("keeps the note at phone width and retries one save", async () => {
    await failNote(390);
    cleanup();
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        grow_event_id: "evt-1",
        environment_event_id: null,
        reused: false,
      },
      error: null,
    });
    renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    const before = rpcMock.mock.calls.length;
    const retry = screen.queryByTestId("qlv2-save-retry") ?? screen.getByTestId("qlv2-save");
    fireEvent.click(retry);
    await waitFor(() => expect(rpcMock.mock.calls.length).toBe(before + 1));
    const keys = rpcMock.mock.calls.map((call) => call[1]?.p_idempotency_key);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
  });

  it("keeps the note at desktop width after a failed save", async () => {
    await failNote(1280);
    cleanup();
    renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
  });
});
