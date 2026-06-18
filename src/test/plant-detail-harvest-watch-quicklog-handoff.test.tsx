/**
 * Plant Detail Harvest Watch — Quick Log handoff integration test.
 *
 * Mounts the card, drives it through scenarios where different evidence
 * items are missing, clicks the "Next inspection" CTA, and asserts the
 * dispatched `verdant:open-quicklog` event carries the correct preset,
 * eventType, and cautious note copy. The handoff is read-only — no
 * Supabase write, no AI, no alerts, no Action Queue, no device control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

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

const PLANT = {
  id: "p1",
  name: "Sour Diesel",
  strain: "Sour Diesel Auto",
  stage: "flower",
  startedAt: "2026-05-01T00:00:00.000Z",
  photo: "",
  tentId: "t1",
  growId: "g1",
  health: "healthy",
  lastNote: "",
};

function captureEvent(): Array<{ name: string; detail: unknown }> {
  const captured: Array<{ name: string; detail: unknown }> = [];
  const handler = (e: Event) => {
    const ce = e as CustomEvent<unknown>;
    captured.push({ name: e.type, detail: ce.detail });
  };
  window.addEventListener(
    PLANT_QUICKLOG_PREFILL_EVENT,
    handler as EventListener,
  );
  // Return both the captured array and a cleanup the test can ignore
  // (vitest will recreate window between tests via cleanup()).
  (captureEvent as unknown as { _last: () => void })._last = () =>
    window.removeEventListener(
      PLANT_QUICKLOG_PREFILL_EVENT,
      handler as EventListener,
    );
  return captured;
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // Shape consumed by buildPlantRecentActivity (raw DB-ish row).
  return {
    id: overrides.id ?? "e1",
    event_type: overrides.event_type ?? "observation",
    occurred_at: overrides.occurred_at ?? "2026-06-15T10:00:00.000Z",
    notes: overrides.notes ?? "",
    plant_id: "p1",
    tent_id: "t1",
    photo_url: overrides.photo_url ?? null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
  mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false });
});

afterEach(() => {
  (captureEvent as unknown as { _last?: () => void })._last?.();
  cleanup();
});

describe("Harvest Watch — Quick Log handoff", () => {
  it("missing trichome → dispatches trichome_inspection preset (observation)", () => {
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
    const captured = captureEvent();
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-harvest-watch-next-inspection-cta"),
    );
    expect(captured.length).toBe(1);
    const detail = captured[0].detail as Record<string, unknown>;
    expect(detail.preset).toBe("trichome_inspection");
    expect(detail.eventType).toBe("observation");
    expect(detail.source).toBe("harvest-watch-inspection");
    expect(detail.plantId).toBe("p1");
    expect(detail.tentId).toBe("t1");
    expect(String(detail.note)).toMatch(/Trichome inspection/i);
    expect(String(detail.note)).toMatch(/grower decides/i);
  });

  it("trichome present, pistil missing → dispatches pistil_recession preset", () => {
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        makeRow({
          id: "n1",
          notes: "Checked trichomes — about 30% cloudy across upper colas.",
        }),
      ],
      isLoading: false,
    });
    const captured = captureEvent();
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-harvest-watch-next-inspection-cta"),
    );
    const detail = captured[0].detail as Record<string, unknown>;
    expect(detail.preset).toBe("pistil_recession");
    expect(detail.eventType).toBe("observation");
    expect(String(detail.note)).toMatch(/Pistil/i);
  });

  it("trichome + pistil present, bud missing → dispatches bud_maturity preset", () => {
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        makeRow({ id: "n1", notes: "Trichomes mostly cloudy." }),
        makeRow({ id: "n2", notes: "Pistils 50% receded." }),
      ],
      isLoading: false,
    });
    const captured = captureEvent();
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-harvest-watch-next-inspection-cta"),
    );
    const detail = captured[0].detail as Record<string, unknown>;
    expect(detail.preset).toBe("bud_maturity");
    expect(String(detail.note)).toMatch(/Bud maturity/i);
  });

  it("only photo missing → dispatches close_flower_photo preset (eventType=photo)", () => {
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        makeRow({ id: "n1", notes: "Trichomes mostly cloudy." }),
        makeRow({ id: "n2", notes: "Pistils 50% receded." }),
        makeRow({ id: "n3", notes: "Buds swelling, calyxes dense." }),
      ],
      isLoading: false,
    });
    const captured = captureEvent();
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-harvest-watch-next-inspection-cta"),
    );
    const detail = captured[0].detail as Record<string, unknown>;
    expect(detail.preset).toBe("close_flower_photo");
    expect(detail.eventType).toBe("photo");
    expect(String(detail.note)).toMatch(/Close flower photo/i);
  });

  it("dispatched event uses the existing PLANT_QUICKLOG_PREFILL_EVENT name", () => {
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
    const captured = captureEvent();
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-harvest-watch-next-inspection-cta"),
    );
    expect(captured[0].name).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
    expect(captured[0].name).toBe("verdant:open-quicklog");
  });
});
