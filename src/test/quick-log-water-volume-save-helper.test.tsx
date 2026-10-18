/**
 * Large Water volumes must block Save through the same helper surface as other
 * Water gates, not only through the inline warning panel.
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
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: vi.fn(async () => ({
    ok: true,
    eventId: "water-event-1",
    reused: false,
  })),
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function openWaterWithVolume(volumeMl: string) {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
  fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: volumeMl } });
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
});

afterEach(() => {
  cleanup();
});

describe("Quick Log large water save helper", () => {
  it("disables Save and mirrors the warning in the save helper before Confirm amount", () => {
    openWaterWithVolume("10001");
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent("10001 ml");
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Edit amount or Confirm amount.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns the save helper to ready after Confirm amount", async () => {
    openWaterWithVolume("10001");
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    await waitFor(() => {
      expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
        "Ready to save when this log matches what happened.",
      );
    });
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
