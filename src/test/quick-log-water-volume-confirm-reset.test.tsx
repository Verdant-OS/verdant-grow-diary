/**
 * A confirmed large Water amount belongs to that draft. Reset and Log another
 * start a new draft, so the same amount must be confirmed again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "QA Test",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "QA Test",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "QA Test" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: vi.fn(async () => ({
    ok: true,
    eventId: "water-event-1",
    reused: false,
  })),
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={() => {}}
        defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
      />
    </QueryClientProvider>,
  );
}

function enterLargeWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
  fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
}

beforeEach(() => {
  window.sessionStorage.clear();
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
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
});

afterEach(() => {
  cleanup();
});

describe("large water confirmation reset", () => {
  it("asks for confirmation again after the sheet resets the water draft", async () => {
    const view = renderSheet(true);
    enterLargeWater();
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm amount" })).toBeDisabled();
    });

    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <QuickLogV2Sheet
          open={false}
          onOpenChange={() => {}}
          defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
        />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <QuickLogV2Sheet
          open={true}
          onOpenChange={() => {}}
          defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
        />
      </QueryClientProvider>,
    );

    enterLargeWater();
    expect(screen.getByRole("button", { name: "Confirm amount" })).toBeEnabled();
  });

  it("asks for confirmation again after Log another", async () => {
    rpcMock.mockResolvedValue({ data: "event-1", error: null });
    renderSheet();
    enterLargeWater();
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    await waitFor(
      () => {
        const err = screen.queryByTestId("qlv2-error");
        if (err?.textContent) throw new Error(err.textContent);
        expect(screen.getByTestId("quick-log-post-save-another")).toBeTruthy();
      },
      { timeout: 4000 },
    );
    const logAnother = screen.getByTestId("quick-log-post-save-another");
    fireEvent.click(logAnother);
    enterLargeWater();
    expect(screen.getByRole("button", { name: "Confirm amount" })).toBeEnabled();
  });
});
