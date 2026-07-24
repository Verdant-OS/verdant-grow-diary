import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";
import PlantDetailAiDoctorReadinessGate from "@/components/PlantDetailAiDoctorReadinessGate";
import PlantDetailAiDoctorSafeReviewStart from "@/components/PlantDetailAiDoctorSafeReviewStart";
import {
  buildAiDoctorRootZoneReadinessScope,
  selectSettledAiDoctorRootZoneObservations,
} from "@/lib/aiDoctorRootZoneReadinessScopeRules";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";

const mocks = vi.hoisted(() => ({
  timelineItems: [] as unknown[],
  rootZone: {
    observations: [] as RootZoneObservationV1[],
    isLoading: false,
    isFetching: false,
    isError: false,
  },
  rootZoneCalls: [] as Array<{ scope: unknown; limit: number }>,
}));

vi.mock("@/hooks/useTimelineMemory", () => ({
  TIMELINE_MEMORY_DEFAULT_LIMIT: 60,
  useTimelineMemory: () => ({ items: mocks.timelineItems, isLoading: false }),
}));

vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: (scope: unknown, limit: number) => {
    mocks.rootZoneCalls.push({ scope, limit });
    return mocks.rootZone;
  },
}));

const PLANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const plant = {
  id: PLANT_ID,
  name: "Root-zone consistency plant",
  strain: "Northern Lights",
  stage: "veg",
  medium: "coco",
  photo: "/plant.jpg",
  growId: GROW_ID,
  tentId: TENT_ID,
};

function observation(
  eventType: RootZoneObservationV1["eventType"],
  hoursAgo: number,
): RootZoneObservationV1 {
  return {
    occurredAt: new Date(Date.now() - hoursAgo * 60 * 60_000).toISOString(),
    eventType,
    source: "manual",
    metrics: {
      schemaVersion: 1,
      volumeMl: 750,
      inputPh: 6.1,
      inputEcMsCm: eventType === "feeding" ? 1.5 : null,
      outputEcMsCm: null,
      runoffMl: null,
      runoffPh: null,
      runoffEcMsCm: null,
      waterTempC: null,
      nutrientLine: eventType === "feeding" ? "Cronk" : null,
      products: [],
    },
    invalidFields: [],
  };
}

function renderAdjacentSurfaces() {
  return render(
    <MemoryRouter>
      <PlantDetailAiDoctorReadinessGate plantId={PLANT_ID} plant={plant} hasSafeAiDoctorFlow />
      <PlantDetailAiDoctorSafeReviewStart plantId={PLANT_ID} plant={plant} />
      <PlantDetailAiDoctorContextPanel plantId={PLANT_ID} plant={plant} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.timelineItems = [];
  mocks.rootZone.observations = [observation("watering", 2), observation("feeding", 4)];
  mocks.rootZone.isLoading = false;
  mocks.rootZone.isFetching = false;
  mocks.rootZone.isError = false;
  mocks.rootZoneCalls = [];
});

describe("Plant Detail AI Doctor root-zone readiness consistency", () => {
  it("uses the same context scope and makes every adjacent surface partial", () => {
    renderAdjacentSurfaces();

    expect(screen.getByTestId("plant-ai-doctor-readiness-gate")).toHaveAttribute(
      "data-readiness",
      "partial",
    );
    expect(screen.getByTestId("plant-ai-doctor-safe-review-start")).toHaveAttribute(
      "data-variant",
      "partial",
    );
    const panel = screen.getByTestId("plant-ai-doctor-context-panel");
    expect(panel).toHaveAttribute("data-readiness", "partial");
    expect(within(panel).getByText("Recent watering/feeding").parentElement).toHaveTextContent("2");
    expect(screen.queryByTestId("plant-ai-doctor-context-latest-snapshot")).toBeNull();

    expect(mocks.rootZoneCalls).toHaveLength(3);
    for (const call of mocks.rootZoneCalls) {
      expect(call.scope).toEqual({
        kind: "plant_context",
        plantId: PLANT_ID,
        tentId: TENT_ID,
        growId: GROW_ID,
      });
      expect(call.limit).toBe(20);
    }
  });

  it.each([
    ["loading", { isLoading: true, isFetching: true, isError: false }],
    ["cached-after-error", { isLoading: false, isFetching: false, isError: true }],
  ])("fails closed for %s root-zone rows", (_label, state) => {
    Object.assign(mocks.rootZone, state);

    renderAdjacentSurfaces();

    expect(screen.getByTestId("plant-ai-doctor-readiness-gate")).toHaveAttribute(
      "data-readiness",
      "insufficient",
    );
    expect(screen.queryByTestId("plant-ai-doctor-safe-review-start")).toBeNull();
    expect(screen.getByTestId("plant-ai-doctor-context-panel")).toHaveAttribute(
      "data-readiness",
      "insufficient",
    );
  });
});

describe("AI Doctor root-zone readiness scope rules", () => {
  it("falls back to plant scope and rejects a malformed plant id", () => {
    expect(
      buildAiDoctorRootZoneReadinessScope({
        plantId: PLANT_ID,
        tentId: null,
        growId: null,
      }),
    ).toEqual({ kind: "plant", plantId: PLANT_ID });
    expect(
      buildAiDoctorRootZoneReadinessScope({
        plantId: "not-a-uuid",
        tentId: TENT_ID,
        growId: GROW_ID,
      }),
    ).toBeNull();
  });

  it("returns cached observations only after a successful settled read", () => {
    const observations = [observation("watering", 1)];
    expect(
      selectSettledAiDoctorRootZoneObservations({
        observations,
        isLoading: false,
        isFetching: false,
        isError: false,
      }),
    ).toBe(observations);
    expect(
      selectSettledAiDoctorRootZoneObservations({
        observations,
        isLoading: false,
        isFetching: true,
        isError: false,
      }),
    ).toEqual([]);
  });
});
