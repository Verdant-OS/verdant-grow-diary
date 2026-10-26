import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const fixture = vi.hoisted(() => ({
  growId: "11111111-1111-4111-8111-111111111111",
  tentId: "22222222-2222-4222-8222-222222222222",
  plantId: "33333333-3333-4333-8333-333333333333",
  preference: "fahrenheit" as "fahrenheit" | "celsius",
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => fixture.preference,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "44444444-4444-4444-8444-444444444444" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: fixture.growId }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: fixture.tentId, name: "Tent A", grow_id: fixture.growId }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: fixture.plantId,
        name: "Plant A",
        grow_id: fixture.growId,
        tent_id: fixture.tentId,
        is_archived: false,
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({ urlGrowId: null, scopedGrow: null }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/PageHeader", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({ default: () => null }));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => null }));

import DailyCheck from "@/pages/DailyCheck";

const clients: QueryClient[] = [];
beforeEach(() => {
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

describe("Daily Check's saved display preference is separate from the entry unit", () => {
  it.each([
    { preference: "fahrenheit" as const, preferred: "F", temporary: "C" },
    { preference: "celsius" as const, preferred: "C", temporary: "F" },
  ])("labels the $preferred preference after a temporary $temporary toggle", async (row) => {
    fixture.preference = row.preference;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/daily-check?plantId=${fixture.plantId}&method=sensor`]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId(`manual-reading-temp-unit-${row.preferred}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByTestId(`manual-reading-temp-unit-${row.temporary}`));
    expect(screen.getByTestId(`manual-reading-temp-unit-${row.temporary}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(`Entered in °${row.temporary} — saved as Celsius.`),
    ).toBeInTheDocument();

    const footer = Array.from(view.container.querySelectorAll("p")).find((p) =>
      p.textContent?.replace(/\s+/g, " ").startsWith("Saved as manual, not live sensor data."),
    );
    expect(footer).toHaveTextContent(
      `Saved as manual, not live sensor data. Saved display preference: Temperature uses °${row.preferred}.`,
    );
  });
});
