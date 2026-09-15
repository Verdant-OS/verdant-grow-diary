/**
 * Sensors → Doctor plant re-emission, proven from the RENDERED page.
 *
 * Sensors is the middle link of the Doctor-says-so carry: it forwards the
 * `?plantId=` UUID intent onward WITHOUT resolving it against any plant row,
 * so `AiDoctorStart` stays the single validator.
 *
 * Measured on deploy tip `52c8abe2b` against the **current** ten rendered
 * cases (five Timeline + five Sensors): commenting this prop out (with the
 * matching Timeline prop) left the grep string in `Sensors.tsx`. Exact RED:
 * **5 failed / 5 passed** on the new files; source-scan suites 17/17 green.
 * That is the #1102 failure mode with a different file name, so the guard is
 * replaced here by one that renders the page and reads the href.
 *
 * Presenter-level only: no schema, no writes, no plant-row resolution, and no
 * assertion that Sensors knows anything about the plant beyond the token.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "aaaaaaaa-1111-4111-8111-111111111111";
const TENT = "bbbbbbbb-2222-4222-8222-222222222222";
const PLANT = "dddddddd-4444-4444-8444-444444444444";
const UNOWNED_TENT = "eeeeeeee-5555-4555-8555-555555555555";

const growTentsQuery = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  isSuccess: true,
  isPending: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => growTentsQuery,
  useGrowSensorReadings: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: "available",
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "denied", granted: false, error: null }),
}));

vi.mock("@/hooks/useEcowittIngestAuditProofRows", () => ({
  useEcowittIngestAuditProofRows: () => ({ status: "idle", rows: [] }),
}));

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Deliberately NOT mocked: `@/components/OneTentLoopNextStepCard`. Stubbing it
// is what left the forwarding unguarded in the first place.
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));

import Sensors from "@/pages/Sensors";

function renderSensors(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The href a grower actually follows from the rendered next-step CTA. */
function nextStepHref(): string | null {
  const cta = screen.getByTestId("sensors-one-tent-loop-next-step-card-cta");
  const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
  return anchor?.getAttribute("href") ?? null;
}

describe("Sensors → Doctor plant re-emission (rendered page, not source text)", () => {
  beforeEach(() => {
    Object.assign(growTentsQuery, {
      data: [{ id: TENT, name: "Tent A", growId: GROW }],
      isLoading: false,
      isError: false,
      isSuccess: true,
      isPending: false,
    });
  });

  it("re-emits the carried plant UUID into the rendered Doctor href", async () => {
    renderSensors(`/sensors?tentId=${TENT}&tentIntent=required&plantId=${PLANT}`);

    // Grow is derived from the selected tent row; the plant rides along as the
    // untouched token Timeline sent. Doctor validates it, not this page.
    await waitFor(() =>
      expect(nextStepHref()).toBe(`/doctor?growId=${GROW}&tentId=${TENT}&plantId=${PLANT}`),
    );
  });

  it("does not resolve the plant into a name or show its UUID", async () => {
    const { container } = renderSensors(
      `/sensors?tentId=${TENT}&tentIntent=required&plantId=${PLANT}`,
    );
    await waitFor(() => expect(nextStepHref()).toContain(PLANT));

    // Sensors holds no plant rows. Rendering the raw UUID would be the page
    // inventing an identity it cannot vouch for.
    const card = screen.getByTestId("sensors-one-tent-loop-next-step-card");
    expect(card.textContent ?? "").not.toContain(PLANT);
    expect(container.textContent ?? "").not.toContain(PLANT);
  });

  it("carries no plant when the URL carried none", async () => {
    renderSensors(`/sensors?tentId=${TENT}`);

    await waitFor(() => expect(nextStepHref()).toBe(`/doctor?growId=${GROW}&tentId=${TENT}`));
  });

  it("drops a malformed plant token instead of forwarding it", async () => {
    renderSensors(`/sensors?tentId=${TENT}&plantId=not-a-uuid`);

    // UUID-only. A filter string nobody validated must not reach Doctor, where
    // it could only ever resolve to "unavailable" noise.
    await waitFor(() => expect(nextStepHref()).toBe(`/doctor?growId=${GROW}&tentId=${TENT}`));
    expect(nextStepHref()).not.toContain("not-a-uuid");
  });

  it("carries no plant onward when the required tent is not one the grower owns", async () => {
    renderSensors(`/sensors?tentId=${UNOWNED_TENT}&tentIntent=required&plantId=${PLANT}`);

    // Required intent that cannot be honoured leaves no tent selected, so the
    // pair is incomplete and the plant must not travel on its own. Exact
    // `/doctor` is the pin — a grow-less `?plantId=` would still contain the
    // UUID and a weaker `not.toContain(PLANT)` would miss other leftovers.
    await screen.findByTestId("sensors-required-tent-unavailable");
    await waitFor(() => expect(nextStepHref()).toBe("/doctor"));
  });
});
