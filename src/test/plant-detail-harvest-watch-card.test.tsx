/**
 * Plant Detail Harvest Watch card tests.
 *
 * Covers the pure Plant Detail adapter, the read-only card renderer, Plant
 * Detail wiring via the existing What's Missing mount point, and safety
 * guardrails. Harvest Watch remains advisory-only and does not call AI, write
 * alerts/actions, or control devices.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";
import { buildPlantDetailHarvestWatchCardViewModel } from "@/lib/plantDetailHarvestWatchCardViewModel";

const mocks = vi.hoisted(() => ({
  useGrowPlant: vi.fn(),
  usePlantRecentActivity: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlant: mocks.useGrowPlant,
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: mocks.usePlantRecentActivity,
}));

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const CARD = read("src/components/PlantDetailHarvestWatchCard.tsx");
const VM = read("src/lib/plantDetailHarvestWatchCardViewModel.ts");
const WHATS_MISSING = read("src/components/PlantDetailWhatsMissing.tsx");

const plant = {
  id: "p1",
  name: "Sour Diesel Auto",
  strain: "Sour Diesel Auto",
  stage: "flower",
  startedAt: "2026-05-01T00:00:00.000Z",
  photo: "https://example.test/photo.jpg",
};

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
  mocks.useGrowPlant.mockReturnValue({ data: plant, isLoading: false });
  mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
});

describe("Plant Detail Harvest Watch view-model adapter", () => {
  it("uses existing Harvest Watch row view-model and keeps missing context explicit", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant,
      hasPlantPhoto: true,
      recentActivityRows: [{ hasPhoto: true, occurredAt: "2026-06-17T12:00:00.000Z" }],
      now: new Date("2026-06-17T13:00:00.000Z"),
    });

    expect(vm.row.plantId).toBe("p1");
    expect(vm.row.plantLabel).toBe("Sour Diesel Auto");
    expect(vm.row.phenotypeLabel).toBe("Sour Diesel Auto");
    expect(vm.evidenceLabel).toMatch(/2 photo evidence points/i);
    expect(vm.missingContext).toContain("Flower start date or flip date");
    expect(vm.missingContext).toContain("Phenotype harvest history");
  });

  it("does not repurpose plant startedAt as days-in-flower", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant,
      hasPlantPhoto: true,
      recentActivityRows: [],
      now: new Date("2026-06-17T13:00:00.000Z"),
    });

    expect(vm.row.daysInFlower).toBeNull();
    expect(vm.row.daysVsHistory.label).toMatch(/No phenotype history/i);
  });

  it("keeps Harvest Watch advisory-only", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({ plant, hasPlantPhoto: false });
    expect(vm.advisoryLabel).toMatch(/grower decides/i);
    expect(vm.nextObservation).toMatch(/photos|harvest notes/i);
  });
});

describe("PlantDetailHarvestWatchCard", () => {
  it("renders a read-only Harvest Watch card", () => {
    render(<PlantDetailHarvestWatchCard plantId="p1" hasPlantPhoto />);

    expect(screen.getByTestId("plant-detail-harvest-watch-card")).toBeTruthy();
    expect(screen.getByText("Harvest Watch")).toBeTruthy();
    expect(screen.getByTestId("plant-detail-harvest-watch-advisory-copy").textContent).toMatch(
      /does not decide harvest timing/i,
    );
    expect(screen.getByTestId("plant-detail-harvest-watch-readiness")).toBeTruthy();
    expect(screen.getByTestId("plant-detail-harvest-watch-window")).toBeTruthy();
    expect(screen.getByTestId("plant-detail-harvest-watch-next-observation")).toBeTruthy();
  });

  it("renders loading state safely while plant/activity data loads", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: true });
    render(<PlantDetailHarvestWatchCard plantId="p1" hasPlantPhoto={false} />);
    expect(screen.getByTestId("plant-detail-harvest-watch-card-loading")).toBeTruthy();
  });

  it("renders nothing without a plant id", () => {
    const { container } = render(<PlantDetailHarvestWatchCard plantId={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("Plant Detail wiring", () => {
  it("mounts Harvest Watch through the existing PlantDetailWhatsMissing slot", () => {
    expect(WHATS_MISSING).toContain("PlantDetailHarvestWatchCard");
    expect(WHATS_MISSING).toMatch(/PlantDetailHarvestWatchCard[\s\S]{0,120}plantId=\{plantId\}/);
  });
});

describe("Harvest Watch card safety", () => {
  const ALL = [CARD, VM, WHATS_MISSING].join("\n");

  it("contains no writes or RPC/function calls", () => {
    for (const src of [CARD, VM, WHATS_MISSING]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\.invoke/);
    }
  });

  it("does not call AI, alerts, Action Queue, or device control", () => {
    expect(ALL).not.toMatch(/openai|ai_doctor_sessions|askDoctor|aiDoctor|model_call|model\.create/i);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)|from\(["']alert_events["']\)/);
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)|actionQueue|queued action/i);
    expect(ALL).not.toMatch(/mqtt|relay\.on|relay\.off|device\.command|smart plug/i);
  });

  it("does not render raw payload or definitive harvest-now copy", () => {
    expect(ALL).not.toMatch(/raw_payload|rawPayload/);
    expect(ALL).not.toMatch(/harvest now|ready to harvest|guaranteed peak/i);
    expect(ALL).toMatch(/grower decides|does not decide harvest timing/i);
  });

  it("keeps business logic out of JSX by using the adapter and existing Harvest Watch view-model", () => {
    expect(CARD).toContain("buildPlantDetailHarvestWatchCardViewModel");
    expect(VM).toContain("buildHarvestWatchRowViewModel");
  });
});
