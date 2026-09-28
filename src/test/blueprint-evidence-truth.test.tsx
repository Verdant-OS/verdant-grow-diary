import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PlantBlueprintOverlaySection } from "@/components/PlantBlueprintOverlaySection";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const h = vi.hoisted(() => ({
  now: Date.parse("2026-09-23T12:00:00Z"),
  snapshot: {} as Record<string, unknown>,
  root: {} as Record<string, unknown>,
  read: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  retryRoot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    entitlement: { isActive: true, capabilities: { blueprint: true } },
    loading: false,
  }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: (...args: unknown[]) => {
    h.read(...args);
    return h.snapshot;
  },
}));
vi.mock("@/hooks/useRootZoneObservations", () => ({ useRootZoneObservations: () => h.root }));
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => h.now }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: h.invalidate }),
}));

const NOW = Date.parse("2026-09-23T12:00:00Z");
function reading(source = "live", ageMinutes = 1) {
  return {
    ...EMPTY_SNAPSHOT,
    source,
    ts: new Date(NOW - ageMinutes * 60_000).toISOString(),
    temp: 25,
    rh: 75,
    vpd: 0.6,
    ppfd: 200,
  };
}
function view(tentId: string | null = "tent-a") {
  return (
    <PlantBlueprintOverlaySection
      growId="grow-a"
      tentId={tentId}
      plantId="plant-a"
      stage="seedling"
      isDay
    />
  );
}
function row(metric: string) {
  return screen.getByTestId(`pro-blueprint-overlay-row-${metric}`);
}

beforeEach(() => {
  h.now = NOW;
  h.snapshot = { status: "ok", snapshot: reading(), isFetching: false, isPaused: false };
  h.root = {
    observations: [{ metrics: { inputEcMsCm: 0.7, inputPh: 6 } }],
    readStatus: "success",
    refetch: h.retryRoot,
  };
  h.read.mockClear();
  h.invalidate.mockClear();
  h.retryRoot.mockClear();
});

describe("Blueprint evidence is not automatically current", () => {
  it.each([
    ["live", 16],
    ["live", 2880],
    ["manual", 1441],
  ] as const)("retains %s at %i minutes without scoring it", (source, age) => {
    h.snapshot.snapshot = reading(source, age);
    render(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByTestId("pro-blueprint-overlay-value-tempC")).toHaveTextContent("25 °C");
    expect(screen.getByText(/Stale sensor evidence/)).toBeVisible();
    expect(row("ec")).toHaveAttribute("data-tone", "green");
  });
  it("accepts a current manual reading using its longer freshness window", () => {
    h.snapshot.snapshot = reading("manual", 60);
    render(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "green");
    expect(row("tempC")).toHaveTextContent("Logged");
  });
  it("rechecks freshness while the same reading stays mounted", () => {
    h.snapshot.snapshot = reading("live", 14);
    const page = render(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "green");
    h.now += 120_000;
    page.rerender(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
  });
  it("keeps CSV source on temperature, VPD and PPFD and excludes historical scores", () => {
    h.snapshot.snapshot = reading("csv");
    render(view());
    for (const key of ["tempC", "rh", "vpdKpa", "ppfd"]) {
      expect(row(key)).toHaveAttribute("data-tone", "neutral");
      expect(within(row(key)).getByText("CSV history")).toBeVisible();
    }
  });
  it.each(["sim", "unverified", "diary"])("does not score %s as current evidence", (source) => {
    h.snapshot.snapshot = reading(source);
    render(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
  });
  it.each([null, "bad-date", new Date(NOW + 60_000).toISOString()])(
    "does not score invalid capture time %s",
    (ts) => {
      h.snapshot.snapshot = { ...reading(), ts };
      render(view());
      expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
    },
  );
  it.each([
    ["loading", { status: "loading", snapshot: EMPTY_SNAPSHOT }],
    ["paused", { isPaused: true }],
    ["refreshing", { isFetching: true }],
    ["unavailable", { status: "unavailable" }],
  ])("withholds sensor scoring during %s", (_name, state) => {
    h.snapshot = { ...h.snapshot, ...state };
    render(view());
    expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByTestId("blueprint-sensor-notice")).toBeVisible();
    expect(row("ec")).toHaveAttribute("data-tone", "green");
  });
  it.each(["loading", "paused", "refreshing", "error"])(
    "withholds cached feed scoring during %s",
    (readStatus) => {
      h.root.readStatus = readStatus;
      render(view());
      expect(row("ec")).toHaveAttribute("data-tone", "neutral");
      expect(screen.getByTestId("pro-blueprint-overlay-value-ec")).toHaveTextContent("0.7");
      expect(screen.getByTestId("blueprint-feeding-notice")).toBeVisible();
      expect(row("tempC")).toHaveAttribute("data-tone", "green");
    },
  );
  it("retries failed evidence reads without writing", () => {
    h.snapshot.status = "unavailable";
    h.root.readStatus = "error";
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Retry evidence" }));
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.retryRoot).toHaveBeenCalledTimes(1);
    const filter = h.invalidate.mock.calls[0][0].predicate;
    expect(filter({ queryKey: ["latest-sensor-snapshot", "owner", "grow-a"] })).toBe(true);
    expect(filter({ queryKey: ["latest-sensor-snapshot", "owner", "other-grow"] })).toBe(false);
    expect(filter({ queryKey: ["sensor_readings", "owner", "grow-a"] })).toBe(false);
  });
  it("does not query or score grow-wide sensor evidence for a plant without a tent", () => {
    render(view(null));
    expect(h.read).toHaveBeenCalledWith(null, []);
    expect(row("tempC")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByText(/Assign this plant to a tent/)).toBeVisible();
  });
});
