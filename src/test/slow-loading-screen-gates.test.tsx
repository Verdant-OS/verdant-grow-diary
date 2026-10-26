/**
 * Full-page and inline gates that stay on Loading after the read has failed,
 * come back empty, or never settles.
 */
import { renderToString } from "react-dom/server";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { CRITICAL_READ_DEADLINE_MS } from "@/lib/boundedReadRules";
import { GROW_READ_BUDGET_MS, GROW_READ_RETRY_DELAYS_MS } from "@/lib/growsReadRetryRules";
import { isDashboardSupplementalLoading } from "@/lib/dashboardSupplementalLoadingRules";
import { resolveTimelineFetchScope } from "@/lib/timelinePageReadStateRules";

const io = vi.hoisted(() => ({
  mode: "hang" as "hang" | "error" | "rows",
  tables: [] as string[],
  authLoading: false,
  user: {
    id: "user-1",
    email: "grower@example.com",
    email_confirmed_at: "2026-07-01",
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      is() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      in() {
        return query;
      },
      or() {
        return query;
      },
      then(
        onFulfilled?: (value: {
          data: unknown[] | null;
          error: { message: string } | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        io.tables.push(table);
        if (io.mode === "hang") return new Promise(() => {});
        const result =
          io.mode === "error"
            ? { data: null, error: { message: "grows unavailable" } }
            : { data: [] as unknown[], error: null };
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return { supabase: { from: (table: string) => queryFor(table) } };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: io.user,
    session: null,
    loading: io.authLoading,
    signOut: vi.fn(async () => {}),
  }),
}));

vi.mock("@/hooks/useRequireAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useRequireAuth")>("@/hooks/useRequireAuth");
  return {
    ...actual,
    useRequireAuth: () => ({ status: "revalidation_failed", retry: vi.fn() }),
  };
});

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: {}, isActive: false, effectivePlanId: "free" },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import Onboarding from "@/pages/Onboarding";
import AppShell from "@/components/AppShell";
import { GrowsProvider, useGrows } from "@/store/grows";
import { useDashboardScopedData } from "@/hooks/useDashboardScopedData";
import { useGrowPlants } from "@/hooks/useGrowData";
import { useEnvironmentTrends } from "@/hooks/useEnvironmentTrends";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(children: ReactNode) {
  return <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
}

function renderOnboarding() {
  return render(
    wrap(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <GrowsProvider>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/auth" element={<div data-testid="auth-page" />} />
          </Routes>
        </GrowsProvider>
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => {
  io.mode = "hang";
  io.tables = [];
  io.authLoading = false;
  vi.useRealTimers();
  // React Query notifies on a 0ms timeout. Under fake timers that follow-up
  // timer is queued after the deadline callback, so deliver it immediately.
  notifyManager.setScheduler((callback) => {
    callback();
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("onboarding grows check", () => {
  it("shows a status while the grows read is still in flight", () => {
    renderOnboarding();
    expect(screen.getByTestId("onboarding-grows-loading")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows an error when the grows read fails instead of the empty-account chooser", async () => {
    io.mode = "error";
    renderOnboarding();
    expect(await screen.findByTestId("onboarding-grows-error")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/where do you want verdant to open first/i)).toBeNull();
  });

  it("leaves loading when the grows read never settles", async () => {
    vi.useFakeTimers();
    renderOnboarding();
    // A hung grows read uses the full 8s first deadline, then a retry while
    // leftover budget remains. The error UI is published when GROW_READ_BUDGET_MS
    // elapses, so advancing only CRITICAL_READ_DEADLINE_MS still shows loading.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROW_READ_BUDGET_MS);
    });
    expect(screen.getByTestId("onboarding-grows-error")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-grows-loading")).toBeNull();
  });
});

describe("app shell auth gate", () => {
  it("leaves Loading… when session revalidation has already failed", () => {
    io.authLoading = true;
    render(
      wrap(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              path="*"
              element={
                <AppShell>
                  <div data-testid="protected-child">private</div>
                </AppShell>
              }
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
    expect(screen.getByTestId("app-shell-revalidation-failed")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByTestId("protected-child")).toBeNull();
  });

  it("still renders Loading… on the server and hydration pass when revalidation failed", () => {
    io.authLoading = true;
    const html = renderToString(
      wrap(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              path="*"
              element={
                <AppShell>
                  <div data-testid="protected-child">private</div>
                </AppShell>
              }
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
    expect(html).toContain("Loading…");
    expect(html).not.toContain("app-shell-revalidation-failed");
    expect(html).not.toContain("protected-child");
  });
});

describe("grows provider deadline", () => {
  it("publishes an error instead of staying loading", async () => {
    vi.useFakeTimers();
    function Probe() {
      const { loading, error } = useGrows();
      return (
        <div data-testid="grows-probe">{`${loading ? "loading" : "ready"}|${error ? "error" : "ok"}`}</div>
      );
    }
    render(
      wrap(
        <GrowsProvider>
          <Probe />
        </GrowsProvider>,
      ),
    );
    expect(screen.getByTestId("grows-probe")).toHaveTextContent("loading|ok");
    // Same budget as the onboarding hang: the first 8s attempt is retried, and
    // the provider leaves loading only after GROW_READ_BUDGET_MS.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROW_READ_BUDGET_MS);
    });
    expect(screen.getByTestId("grows-probe")).toHaveTextContent("ready|error");
  });
});

describe("dashboard supplemental reads", () => {
  it("does not treat an idle supplemental read as loading", () => {
    expect(isDashboardSupplementalLoading("idle")).toBe(false);
    expect(isDashboardSupplementalLoading("loading")).toBe(true);
    expect(isDashboardSupplementalLoading("unavailable")).toBe(false);
    expect(isDashboardSupplementalLoading("ok")).toBe(false);
  });

  it("starts the pending-actions read without waiting for recent activity", async () => {
    io.mode = "hang";
    renderHook(() => useDashboardScopedData("grow-1"), {
      wrapper: ({ children }) => wrap(children),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(io.tables).toContain("action_queue");
    expect(io.tables).toContain("diary_entries");
  });

  it("leaves loading when recent activity and pending actions never settle", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDashboardScopedData("grow-1"), {
      wrapper: ({ children }) => wrap(children),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recent.status).toBe("loading");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(result.current.recent.status).toBe("unavailable");
    expect(result.current.pending.status).toBe("unavailable");
  });
});

describe("plant list and environment trends", () => {
  it("leaves the plant query loading state when the read never settles", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGrowPlants(), {
      wrapper: ({ children }) => wrap(children),
    });
    expect(result.current.isPending).toBe(true);
    // useGrowPlants retries a hung read. The first deadline plus the first
    // backoff still leaves the query pending; the error lands after the next
    // full deadline, which is what exhausts GROW_READ_BUDGET_MS.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS + GROW_READ_RETRY_DELAYS_MS[0]);
    });
    expect(result.current.isError).toBe(false);
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it("leaves environment trends loading when the read never settles", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => useEnvironmentTrends("grow-1", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]),
      { wrapper: ({ children }) => wrap(children) },
    );
    expect(result.current.status).toBe("loading");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(result.current.status).toBe("unavailable");
  });
});

describe("timeline fetch scope", () => {
  it("starts the core read for a URL grow while the grow list is still loading", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "grow-1",
        storeGrowId: null,
        growsLoading: true,
        growsError: null,
        isValidScopedGrow: false,
      }),
    ).toEqual({ activeGrowId: "grow-1", hasInvalidScope: false });
  });

  it("treats a settled missing URL grow as invalid scope", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "missing",
        storeGrowId: "other",
        growsLoading: false,
        growsError: null,
        isValidScopedGrow: false,
      }),
    ).toEqual({ activeGrowId: null, hasInvalidScope: true });
  });

  it("does not call a grows error an invalid scope", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "grow-1",
        storeGrowId: null,
        growsLoading: false,
        growsError: "unavailable",
        isValidScopedGrow: false,
      }).hasInvalidScope,
    ).toBe(false);
  });
});
