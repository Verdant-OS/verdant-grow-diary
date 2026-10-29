import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";

const fixture = vi.hoisted(() => ({
  owner: "44444444-4444-4444-8444-444444444444",
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: fixture.owner } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: fixture.grow }],
    activeGrowId: fixture.grow,
    loading: false,
  }),
}));
// Keep the real always-enabled useGrowTents/useGrowPlants queries. Only their
// repository I/O is replaced; onlineManager produces the genuine paused state.
vi.mock("@/lib/growRepo", () => ({
  fetchTents: async () => [{ id: fixture.tent, growId: fixture.grow }],
  fetchPlants: async () => [{ id: fixture.plant, growId: fixture.grow, tentId: fixture.tent }],
  fetchTent: vi.fn(),
  fetchPlant: vi.fn(),
  fetchSensorReadings: vi.fn(),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: (tentId: string | null) => ({
    data: [],
    isPending: tentId === null,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: "ok",
    summary: { count: 0, hasEvidence: false, latestAt: null, latestSource: null },
  }),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";

const tentsKey = buildPrivateGrowQueryKey(fixture.owner, ["tents", "all"]);
const plantsKey = buildPrivateGrowQueryKey(fixture.owner, ["plants", "all", "all"]);
const clients: QueryClient[] = [];
let priorOnline = true;

beforeEach(() => {
  priorOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(priorOnline);
});

function mount(client: QueryClient) {
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LandingAuthedOnboardingBridge />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function expectSettledCount() {
  await waitFor(() => {
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveAttribute(
      "data-complete-count",
      "3",
    );
  });
}

describe("welcome count during genuine paused core queries", () => {
  it.each(["tents", "plants"] as const)(
    "withholds the count for an uncached paused %s read",
    async (paused) => {
      const cache = client();
      if (paused === "plants") {
        cache.setQueryData(tentsKey, [{ id: fixture.tent, growId: fixture.grow }]);
      } else {
        cache.setQueryData(plantsKey, [
          { id: fixture.plant, growId: fixture.grow, tentId: fixture.tent },
        ]);
      }
      mount(cache);
      expect(cache.getQueryState(paused === "tents" ? tentsKey : plantsKey)).toMatchObject({
        status: "pending",
        fetchStatus: "paused",
      });
      expect(screen.queryByTestId("onboarding-progress-pill")).not.toBeInTheDocument();
      expect(screen.getByText("Checking your setup…")).toBeInTheDocument();

      onlineManager.setOnline(true);
      await expectSettledCount();
    },
  );

  it("keeps one polite atomic status region through loading and the settled count", async () => {
    mount(client());
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Checking your setup…");

    onlineManager.setOnline(true);
    await expectSettledCount();
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("3 of 5 steps done");
  });

  it("keeps cached empty graph reads settled despite a disabled sensor query", () => {
    const cache = client();
    cache.setQueryData(tentsKey, []);
    cache.setQueryData(plantsKey, []);
    mount(cache);
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveAttribute(
      "data-complete-count",
      "1",
    );
  });
});
