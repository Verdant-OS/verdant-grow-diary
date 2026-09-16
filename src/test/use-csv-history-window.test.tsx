import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const boundary = vi.hoisted(() => ({
  userId: "owner",
  loading: false,
  rows: [] as Record<string, unknown>[],
  error: null as null | { message: string },
  nullData: false,
  malformedData: false,
  calls: [] as unknown[][],
  hold: null as null | Promise<void>,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: boundary.userId ? { id: boundary.userId } : null,
    loading: boundary.loading,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      boundary.calls.push(["from", table]);
      const filters: Record<string, string> = {};
      const chain = {
        select: (columns: string) => {
          boundary.calls.push(["select", columns]);
          return chain;
        },
        eq: (column: string, value: string) => {
          filters[column] = value;
          boundary.calls.push(["eq", column, value]);
          return chain;
        },
        order: (column: string, options: unknown) => {
          boundary.calls.push(["order", column, options]);
          return chain;
        },
        limit: async (cap: number) => {
          boundary.calls.push(["limit", cap]);
          if (boundary.hold) await boundary.hold;
          return {
            data: boundary.malformedData
              ? ({ not: "array" } as unknown as Record<string, unknown>[])
              : boundary.nullData
                ? null
                : boundary.rows
                    .filter((row) =>
                      Object.entries(filters).every(([key, value]) => row[key] === value),
                    )
                    .slice(0, cap),
            error: boundary.error,
          };
        },
      };
      return chain;
    },
  },
}));

import { useCsvHistoryWindow } from "@/hooks/useCsvHistoryWindow";
import EnvironmentCsvImportLauncher from "@/components/EnvironmentCsvImportLauncher";
import { MemoryRouter } from "@/lib/react-router-compat";
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const paid = (user_id = "owner") => ({
  user_id,
  environment: "live",
  price_id: "founder_lifetime",
  status: "active",
  current_period_end: null,
  paddle_subscription_id: "lifetime_test",
  created_at: "2026-09-01T00:00:00Z",
});
const clients: QueryClient[] = [];
function mount(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderHook(() => useCsvHistoryWindow(enabled), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  Object.assign(boundary, {
    userId: "owner",
    loading: false,
    rows: [],
    error: null,
    nullData: false,
    malformedData: false,
    calls: [],
    hold: null,
  });
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
  clients.splice(0).forEach((client) => client.clear());
});

describe("useCsvHistoryWindow", () => {
  it.each(["compact", "card"] as const)(
    "wires verified access and Retry into the real %s launcher preview",
    async (variant) => {
      boundary.error = { message: "Unavailable" };
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      clients.push(client);
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <EnvironmentCsvImportLauncher growId="grow" tentId="tent" variant={variant} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(boundary.calls).toEqual([]);
      fireEvent.click(screen.getByTestId("csv-launcher-button"));
      await screen.findByRole("button", { name: "Retry history access" });
      const file = new File(["Timestamp,Temp(°C),RH\n2020-01-01T12:00:00Z,25,55"], "old.csv", {
        type: "text/csv",
      });
      fireEvent.change(screen.getByTestId("csv-import-file-input"), { target: { files: [file] } });
      await screen.findByTestId("csv-import-preview");
      expect(screen.queryByTestId("csv-import-outside-window")).not.toBeInTheDocument();
      boundary.error = null;
      fireEvent.click(screen.getByRole("button", { name: "Retry history access" }));
      await waitFor(() =>
        expect(screen.getByTestId("csv-import-history-window")).toHaveTextContent("last 90 days"),
      );
      expect(screen.getByTestId("csv-import-outside-window")).toHaveTextContent(
        "1 of 1 observations",
      );
    },
  );
  it("reads only the current owner's live subscriptions and never treats sandbox or another owner as full history", async () => {
    boundary.rows = [{ ...paid(), environment: "sandbox" }, paid("other")];
    const view = mount();
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "ready", days: 90 }));
    expect(boundary.calls).toContainEqual(["eq", "environment", "live"]);
    expect(boundary.calls).toContainEqual(["eq", "user_id", "owner"]);
    expect(boundary.calls).toContainEqual(["limit", 21]);
    expect(boundary.calls.filter(([call]) => call === "from")).toEqual([["from", "subscriptions"]]);
  });
  it("keeps a null response unavailable, with successful empty recovery after Retry", async () => {
    boundary.nullData = true;
    const view = mount();
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "error" }));
    boundary.nullData = false;
    await act(async () => {
      await view.result.current.refetch();
    });
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "ready", days: 90 }));
  });
  it("fail-closed when subscriptions response is not an array", async () => {
    boundary.malformedData = true;
    const view = mount();
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "error" }));
    expect(view.result.current.window).not.toEqual({ status: "ready", days: 90 });
  });
  it("does not keep claiming unbounded access after a failed refresh", async () => {
    boundary.rows = [paid()];
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.window).toEqual({ status: "ready", days: null }),
    );
    boundary.error = { message: "Failed read" };
    await act(async () => {
      await view.result.current.refetch();
    });
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "error" }));
  });
  it.each([false, true])(
    "shows the current retry state after a failed refresh with cached access (paused=%s)",
    async (paused) => {
      boundary.rows = [paid()];
      const view = mount();
      await waitFor(() =>
        expect(view.result.current.window).toEqual({ status: "ready", days: null }),
      );
      boundary.error = { message: "Failed refresh" };
      await act(async () => {
        await view.result.current.refetch();
      });
      await waitFor(() => expect(view.result.current.window).toEqual({ status: "error" }));
      let release!: () => void;
      boundary.hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      boundary.error = null;
      boundary.rows = [];
      onlineManager.setOnline(!paused);
      let retry!: ReturnType<typeof view.result.current.refetch>;
      act(() => {
        retry = view.result.current.refetch();
      });
      await waitFor(() =>
        expect(view.result.current.window).toEqual({ status: paused ? "paused" : "loading" }),
      );
      if (paused) {
        act(() => onlineManager.setOnline(true));
        await waitFor(() => expect(view.result.current.window).toEqual({ status: "loading" }));
      }
      await act(async () => {
        release();
        await retry;
      });
      await waitFor(() =>
        expect(view.result.current.window).toEqual({ status: "ready", days: 90 }),
      );
    },
  );
  it("does not present cached unlimited access as newly verified while refreshing", async () => {
    boundary.rows = [paid()];
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.window).toEqual({ status: "ready", days: null }),
    );
    let release!: () => void;
    boundary.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    boundary.rows = [];
    let refresh!: ReturnType<typeof view.result.current.refetch>;
    act(() => {
      refresh = view.result.current.refetch();
    });
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "loading" }));
    await act(async () => {
      release();
      await refresh;
    });
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "ready", days: 90 }));
  });
  it("does not reuse one account's plan while another account's first read is pending", async () => {
    boundary.rows = [paid()];
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.window).toEqual({ status: "ready", days: null }),
    );
    let release!: () => void;
    boundary.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    boundary.userId = "other";
    view.rerender();
    expect(view.result.current.window).toEqual({ status: "loading" });
    await act(async () => {
      release();
    });
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "ready", days: 90 }));
  });
  it("keeps a paused first read unresolved and recovers on reconnect", async () => {
    onlineManager.setOnline(false);
    const view = mount();
    expect(view.result.current.window).toEqual({ status: "paused" });
    expect(boundary.calls).toEqual([]);
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(view.result.current.window).toEqual({ status: "ready", days: 90 }));
  });
  it("does not read before the CSV dialog opens", () => {
    const view = mount(false);
    expect(view.result.current.window).toEqual({ status: "unknown" });
    expect(boundary.calls).toEqual([]);
  });
  it("does not read without a signed-in owner", () => {
    boundary.userId = "";
    const view = mount();
    expect(view.result.current.window).toEqual({ status: "unknown" });
    expect(boundary.calls).toEqual([]);
  });
});
