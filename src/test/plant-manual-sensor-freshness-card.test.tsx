/**
 * Gate 1B polish — Freshness card CTA rendering.
 *
 * Presenter-only render tests:
 *  - All metrics missing → "Add first snapshot" CTA, clicking it fires onUpdate.
 *  - Aging metric → existing "Update" CTA preserved.
 *  - All fresh → no CTA (no nag).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PlantManualSensorFreshnessCard from "@/components/PlantManualSensorFreshnessCard";
import type { PlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

vi.mock("@/hooks/usePlantManualSensorHistory", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/usePlantManualSensorHistory")
  >("@/hooks/usePlantManualSensorHistory");
  return {
    ...actual,
    usePlantManualSensorHistory: vi.fn(),
  };
});

import { usePlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

const mocked = usePlantManualSensorHistory as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  mocked.mockReset();
});

function renderCard(onUpdate = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <PlantManualSensorFreshnessCard plantId="p1" onUpdate={onUpdate} />
    </QueryClientProvider>,
  );
  return { ...utils, onUpdate };
}

function setHistory(data: PlantManualSensorHistory | undefined, isLoading = false) {
  mocked.mockReturnValue({ data, isLoading });
}

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

describe("PlantManualSensorFreshnessCard CTA", () => {
  it("renders 'Add first snapshot' and invokes onUpdate when all metrics missing", () => {
    setHistory({ temp_f: null, humidity_percent: null, ph: null, ec: null });
    const { onUpdate } = renderCard();
    const btn = screen.getByTestId("plant-manual-sensor-freshness-update");
    expect(btn.textContent ?? "").toMatch(/add first snapshot/i);
    expect(btn.getAttribute("data-cta")).toBe("add_first");
    fireEvent.click(btn);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders 'Update' when at least one metric is aging/stale", () => {
    setHistory({
      temp_f: { value: 77, loggedAt: hoursAgo(30) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    renderCard();
    const btn = screen.getByTestId("plant-manual-sensor-freshness-update");
    expect((btn.textContent ?? "").trim()).toMatch(/^update$/i);
    expect(btn.getAttribute("data-cta")).toBe("update");
  });

  it("renders no CTA when all present metrics are fresh", () => {
    setHistory({
      temp_f: { value: 77, loggedAt: hoursAgo(1) },
      humidity_percent: { value: 50, loggedAt: hoursAgo(1) },
      ph: { value: 6.1, loggedAt: hoursAgo(1) },
      ec: { value: 1.4, loggedAt: hoursAgo(1) },
    });
    renderCard();
    expect(
      screen.queryByTestId("plant-manual-sensor-freshness-update"),
    ).toBeNull();
  });

  it("does not nag when fresh + missing are mixed", () => {
    setHistory({
      temp_f: { value: 77, loggedAt: hoursAgo(1) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    renderCard();
    expect(
      screen.queryByTestId("plant-manual-sensor-freshness-update"),
    ).toBeNull();
  });

  it("uses gentle, plant-memory framing (no scary/alert words)", () => {
    setHistory({ temp_f: null, humidity_percent: null, ph: null, ec: null });
    renderCard();
    const card = screen.getByTestId("plant-manual-sensor-freshness-card");
    expect(card.textContent ?? "").not.toMatch(/danger|risk|warning|urgent|critical/i);
  });

  it("renders a 'Manual' source badge in the header", () => {
    setHistory({ temp_f: null, humidity_percent: null, ph: null, ec: null });
    renderCard();
    const badge = screen.getByTestId("plant-manual-sensor-freshness-source-badge");
    expect((badge.textContent ?? "").trim()).toMatch(/^manual$/i);
  });

  it("shows a 'Last manual log' timestamp for logged metrics", () => {
    setHistory({
      temp_f: { value: 77, loggedAt: hoursAgo(2) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    renderCard();
    const stamp = screen.getByTestId("plant-manual-sensor-freshness-temp_f-last-log");
    expect(stamp.textContent ?? "").toMatch(/last manual log/i);
    expect(stamp.textContent ?? "").toMatch(/ago/i);
  });

  it("does NOT show a 'Last manual log' timestamp for missing metrics", () => {
    setHistory({
      temp_f: { value: 77, loggedAt: hoursAgo(2) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    renderCard();
    // Logged metric has the stamp...
    expect(
      screen.queryByTestId("plant-manual-sensor-freshness-temp_f-last-log"),
    ).not.toBeNull();
    // ...but missing metrics do not invent one.
    for (const m of ["humidity_percent", "ph", "ec"]) {
      expect(
        screen.queryByTestId(`plant-manual-sensor-freshness-${m}-last-log`),
      ).toBeNull();
    }
  });
});
