/**
 * The readiness chip on PlantDetail describes the snapshot that drives the
 * freshness grade. A manual snapshot dated beyond clock skew must not make
 * the chip read stale while a genuinely fresh snapshot grades the plant
 * strong (#2956 review P3-1).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorReadinessGate from "@/components/PlantDetailAiDoctorReadinessGate";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => {
        throw new Error("DB write not allowed in gate render test");
      },
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in gate render test");
      },
    },
  },
}));

const HOUR = 3600 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let mockTimelineItems: unknown[] = [];
vi.mock("@/hooks/useTimelineMemory", () => ({
  TIMELINE_MEMORY_DEFAULT_LIMIT: 60,
  useTimelineMemory: () => ({ items: mockTimelineItems, isLoading: false }),
}));
let mockRootZoneObservations: RootZoneObservationV1[] = [];
vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: () => ({
    observations: mockRootZoneObservations,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

const watering = (occurredAt: string): RootZoneObservationV1 => ({
  occurredAt,
  eventType: "watering",
  source: "manual",
  metrics: {
    schemaVersion: 1,
    volumeMl: 500,
    inputPh: 5.9,
    inputEcMsCm: 1.2,
    outputEcMsCm: null,
    runoffMl: 50,
    runoffPh: 6,
    runoffEcMsCm: 1.6,
    waterTempC: 21,
    nutrientLine: null,
    products: [],
  },
});

const PLANT = {
  id: "p1",
  name: "Plant A",
  strain: "NL Auto",
  plantType: "autoflower",
  stage: "veg",
  medium: "soil",
  photo: "/photo.jpg",
  growId: "g1",
  tentId: "t1",
};

const renderGate = () =>
  render(
    <MemoryRouter>
      <PlantDetailAiDoctorReadinessGate plantId="p1" plant={PLANT} hasSafeAiDoctorFlow />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockTimelineItems = [];
  mockRootZoneObservations = [watering(at(-10 * HOUR))];
});

const baseItems = [
  { kind: "diary_entry", occurredAt: at(-12 * HOUR), entryType: "watering" },
  { kind: "diary_entry", occurredAt: at(-36 * HOUR), entryType: "note" },
];

describe("PlantDetailAiDoctorReadinessGate — future-dated snapshot beside a fresh one", () => {
  it("grades strong and the chip reads fresh", () => {
    mockTimelineItems = [
      { kind: "manual_sensor_snapshot", occurredAt: at(HOUR), card: { severity: "ok" } },
      { kind: "manual_sensor_snapshot", occurredAt: at(-6 * HOUR), card: { severity: "ok" } },
      ...baseItems,
    ];
    renderGate();
    expect(
      screen.getByTestId("plant-ai-doctor-readiness-gate").getAttribute("data-readiness"),
    ).toBe("strong");
    expect(
      screen
        .getByTestId("plant-ai-doctor-readiness-gate-snapshot-freshness")
        .getAttribute("data-freshness-state"),
    ).toBe("fresh");
  });

  it("with only a future-dated snapshot, the chip reads stale with an unknown age", () => {
    mockTimelineItems = [
      { kind: "manual_sensor_snapshot", occurredAt: at(HOUR), card: { severity: "ok" } },
      ...baseItems,
    ];
    renderGate();
    expect(
      screen
        .getByTestId("plant-ai-doctor-readiness-gate-snapshot-freshness")
        .getAttribute("data-freshness-state"),
    ).toBe("stale");
    expect(
      screen.getByTestId("plant-ai-doctor-readiness-gate-snapshot-freshness-badge").textContent,
    ).toContain("future time");
  });
});
