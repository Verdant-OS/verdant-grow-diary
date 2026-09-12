import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { QUICK_LOG_V2_OPEN_EVENT, type QuickLogV2OpenIntent } from "@/lib/quickLogV2OpenIntent";

const GROW = "00000000-0000-4000-8000-000000000001";
const PLANT = "00000000-0000-4000-8000-000000000002";
const TENT = "00000000-0000-4000-8000-000000000003";
const plants = [{ id: PLANT, name: "Fixture plant", grow_id: GROW, tent_id: TENT, stage: "veg" }];
const tents = [{ id: TENT, name: "Fixture tent", grow_id: GROW }];
const grows = [{ id: GROW, name: "Fixture grow" }];
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: plants, isLoading: false }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: tents, isLoading: false }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows, activeGrowId: "00000000-0000-4000-8000-000000000099", loading: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({ useSensorReadings: () => ({ data: [] }) }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: [] }) }));
vi.mock("@/components/ManualSensorReadingCard", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => null }));
import DailyCheck from "@/pages/DailyCheck";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function WaterSheetHost() {
  const [intent, setIntent] = useState<QuickLogV2OpenIntent | null>(null);
  useEffect(() => {
    const open = (event: Event) => setIntent((event as CustomEvent<QuickLogV2OpenIntent>).detail);
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, open);
    return () => window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, open);
  }, []);
  return (
    <QuickLogV2Sheet
      open={!!intent}
      onOpenChange={(open) => {
        if (!open) setIntent(null);
      }}
      defaultTargetKey={intent?.targetKey}
      defaultAction="water"
    />
  );
}

function Probe() {
  const location = useLocation();
  return (
    <output data-testid="destination">
      {location.pathname}
      {location.search}
    </output>
  );
}
function renderRoute(source = "dashboard") {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter
        initialEntries={[`/daily-check?plantId=${PLANT}&growId=${GROW}&from=${source}`]}
      >
        <DailyCheck />
        <WaterSheetHost />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Soft P2 weekly batch: Daily Check return", () => {
  it("D cancel/back keeps growId when the watering diary CTA query is already correct", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter
          initialEntries={[
            `/daily-check?plantId=${PLANT}&from=dashboard&method=watering&growId=${GROW}`,
          ]}
        >
          <DailyCheck />
          <WaterSheetHost />
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const before = screen.getByTestId("destination").textContent!;
    const urlBefore = new URL(before, "https://fixture.invalid");
    expect(urlBefore.searchParams.get("growId")).toBe(GROW);
    expect(urlBefore.searchParams.get("method")).toBe("watering");
    await screen.findByTestId("daily-check-all-activities-picker-watering");
    expect(screen.getByTestId("destination").textContent).toBe(before);
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Dashboard" })));
    const url = new URL(screen.getByTestId("destination").textContent!, "https://fixture.invalid");
    expect(url.searchParams.get("growId")).toBe(GROW);
  });

  it("D watering page back link retains the originating grow instead of the active grow", async () => {
    renderRoute();
    const openWater = vi.fn();
    window.addEventListener("verdant:open-quicklog-v2", openWater);
    fireEvent.click(screen.getByTestId("daily-check-all-activities-picker-watering"));
    window.removeEventListener("verdant:open-quicklog-v2", openWater);
    expect(openWater).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Dashboard" })));
    const url = new URL(screen.getByTestId("destination").textContent!, "https://fixture.invalid");
    expect(url.searchParams.get("growId")).toBe(GROW);
  });

  it("cancels the real watering sheet without changing the URL, then returns to the originating plant grow", async () => {
    renderRoute("plant-detail");
    const before = screen.getByTestId("destination").textContent;
    fireEvent.click(screen.getByTestId("daily-check-all-activities-picker-watering"));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("destination").textContent).toBe(before);
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Back to Plant" })));
    expect(screen.getByTestId("destination")).toHaveTextContent(`/plants/${PLANT}?growId=${GROW}`);
  });

  it("post-submit plant and dashboard return links retain the explicit grow", () => {
    renderRoute("plant-detail");
    act(() => window.dispatchEvent(new CustomEvent("verdant:entry-created")));
    for (const key of ["plant", "dashboard"]) {
      const href = screen.getByTestId(`daily-grow-check-post-submit-${key}`).getAttribute("href")!;
      expect(new URL(href, "https://fixture.invalid").searchParams.get("growId")).toBe(GROW);
    }
  });
});
