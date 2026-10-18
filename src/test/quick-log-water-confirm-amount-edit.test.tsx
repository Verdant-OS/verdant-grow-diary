/**
 * A confirmed large amount is approval for that typing, not for the same
 * digits typed again after the grower edits away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
const wateringWriterMock = vi.fn();

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
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => wateringWriterMock(...args),
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open
        onOpenChange={() => {}}
        defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
      />
    </QueryClientProvider>,
  );
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
  wateringWriterMock.mockReset();
  wateringWriterMock.mockResolvedValue({ ok: true, eventId: "water-event-1", reused: false });
});

afterEach(() => {
  cleanup();
});

describe("large water confirmation follows the typed amount", () => {
  it("asks again after the amount changes and returns to the same text", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
    fireEvent.change(screen.getByLabelText("Input pH"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Volume (ml)")).toBeEnabled();
    });
    expect(wateringWriterMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
    expect(screen.getByRole("button", { name: "Confirm amount" })).toBeEnabled();
  });
});
