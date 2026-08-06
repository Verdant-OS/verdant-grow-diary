import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";

const authMock = vi.hoisted(() => ({
  loading: true,
  user: null as { id: string } | null,
}));

/** Stable empty-search payload — a fresh `results: []` each render retriggers
 *  GlobalSearchDialog effects that depend on `results` identity and OOMs the
 *  full Vitest worker (see CI gate shard OOM on this file). */
const globalSearchMock = vi.hoisted(() => ({
  results: [] as unknown[],
  isLoading: false,
  isError: false,
  retry: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    loading: authMock.loading,
    user: authMock.user,
    session: null,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => globalSearchMock,
}));

const visitedLocations: Array<{ key: string; value: string }> = [];

function LocationProbe() {
  const location = useLocation();
  const value = `${location.pathname}${location.search}`;

  useEffect(() => {
    visitedLocations.push({ key: location.key, value });
  }, [location.key, value]);

  return <div data-testid="location">{value}</div>;
}

function ControlledDialogHarness({ authRevision }: { authRevision: number }) {
  const [open, setOpen] = useState(true);
  const [ownerMounted, setOwnerMounted] = useState(true);

  return (
    <div data-auth-revision={authRevision}>
      <button type="button" data-testid="reopen-dialog" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <button
        type="button"
        data-testid="toggle-dialog-owner"
        onClick={() => setOwnerMounted((mounted) => !mounted)}
      >
        Toggle owner
      </button>
      {ownerMounted ? <GlobalSearchDialog open={open} onOpenChange={setOpen} /> : null}
      <LocationProbe />
    </div>
  );
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function dialogTree(client: QueryClient, authRevision: number, initialEntry = "/cultivars") {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ControlledDialogHarness authRevision={authRevision} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function startWhileAuthLoads(testId = "watering") {
  const client = createClient();
  const view = render(dialogTree(client, 0));
  fireEvent.change(screen.getByTestId("global-search-input"), {
    target: { value: "missing plant" },
  });
  fireEvent.click(screen.getByTestId(`global-search-empty-start-${testId}`));

  expect(screen.getByTestId("location")).toHaveTextContent("/cultivars");
  expect(screen.getByTestId("global-search-input")).toBeInTheDocument();
  return { client, view };
}

async function settleAuth(
  client: QueryClient,
  view: ReturnType<typeof render>,
  authRevision: number,
  user: { id: string } | null,
) {
  await act(async () => {
    authMock.loading = false;
    authMock.user = user;
    view.rerender(dialogTree(client, authRevision));
  });
}

function visitsTo(value: string) {
  return visitedLocations.filter((entry) => entry.value === value);
}

beforeEach(() => {
  authMock.loading = true;
  authMock.user = null;
  visitedLocations.length = 0;
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("GlobalSearchDialog auth-resolution intent", () => {
  it("waits with the dialog open, then routes a signed-in grower exactly once", async () => {
    const { client, view } = startWhileAuthLoads();

    await settleAuth(client, view, 1, { id: "grower-1" });

    const expected = "/dashboard?open=quick-log&type=watering";
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(expected);
      expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
    });
    expect(visitsTo(expected)).toHaveLength(1);

    view.rerender(dialogTree(client, 2));
    expect(visitsTo(expected)).toHaveLength(1);
  });

  it("waits with the dialog open, then preserves the signed-out public fallback", async () => {
    const { client, view } = startWhileAuthLoads();

    await settleAuth(client, view, 1, null);

    const expected = "/quick-log?type=watering";
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(expected);
      expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
    });
    expect(visitsTo(expected)).toHaveLength(1);
  });

  it.each([
    ["photo", "/dashboard?open=quick-log&type=photo"],
    ["training", "/dashboard?open=quick-log&type=training"],
  ])("preserves deferred %s as the exact authenticated event type", async (testId, expected) => {
    const { client, view } = startWhileAuthLoads(testId);

    await settleAuth(client, view, 1, { id: "grower-1" });

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(expected);
    });
    expect(visitsTo(expected)).toHaveLength(1);
  });

  it("dedupes repeats and lets the latest different preset win across equal public fallbacks", async () => {
    const { client, view } = startWhileAuthLoads("photo");

    fireEvent.click(screen.getByTestId("global-search-empty-start-photo"));
    fireEvent.click(screen.getByTestId("global-search-empty-start-training"));
    fireEvent.click(screen.getByTestId("global-search-empty-start-training"));

    await settleAuth(client, view, 1, { id: "grower-1" });

    const expected = "/dashboard?open=quick-log&type=training";
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(expected);
    });
    expect(visitsTo(expected)).toHaveLength(1);
    expect(visitsTo("/dashboard?open=quick-log&type=photo")).toHaveLength(0);
  });

  it("cancels a deferred intent when the grower closes the dialog", async () => {
    const { client, view } = startWhileAuthLoads();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
    });

    await settleAuth(client, view, 1, { id: "grower-1" });
    expect(screen.getByTestId("location")).toHaveTextContent("/cultivars");
    expect(visitedLocations.filter(({ value }) => value.includes("open=quick-log"))).toHaveLength(
      0,
    );

    fireEvent.click(screen.getByTestId("reopen-dialog"));
    expect(screen.getByTestId("global-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/cultivars");
  });

  it("cancels a deferred intent when the dialog owner unmounts", async () => {
    const { client, view } = startWhileAuthLoads();

    fireEvent.click(screen.getByTestId("toggle-dialog-owner"));
    expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();

    await settleAuth(client, view, 1, { id: "grower-1" });
    fireEvent.click(screen.getByTestId("toggle-dialog-owner"));

    expect(screen.getByTestId("global-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/cultivars");
    expect(visitedLocations.filter(({ value }) => value !== "/cultivars")).toHaveLength(0);
  });

  it.each([
    ["/plants/plant-1", { targetKey: "plant:plant-1", action: "water" }],
    ["/tents/tent-1", { targetKey: "tent:tent-1", action: "water" }],
  ])("dispatches context-bearing watering immediately from %s", async (initialEntry, detail) => {
    const client = createClient();
    const listener = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);

    try {
      render(dialogTree(client, 0, initialEntry));
      fireEvent.change(screen.getByTestId("global-search-input"), {
        target: { value: "missing plant" },
      });
      fireEvent.click(screen.getByTestId("global-search-empty-start-watering"));

      await waitFor(() => {
        expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(detail);
      expect(screen.getByTestId("location")).toHaveTextContent(initialEntry);
      expect(visitedLocations.filter(({ value }) => value !== initialEntry)).toHaveLength(0);
    } finally {
      window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    }
  });
});
