/**
 * Gate 1B polish — Freshness card CTA rendering.
 *
 * Presenter-only render tests:
 *  - All metrics missing → "Add first snapshot" CTA, clicking it fires onUpdate.
 *  - Aging metric → existing "Update" CTA preserved.
 *  - All fresh → no CTA (no nag).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  afterEachCleanup();

  it("renders 'Add first snapshot' and invokes onUpdate when all metrics missing", async () => {
    setHistory({ temp_f: null, humidity_percent: null, ph: null, ec: null });
    const { onUpdate } = renderCard();
    const btn = screen.getByTestId("plant-manual-sensor-freshness-update");
    expect(btn).toHaveTextContent(/add first snapshot/i);
    expect(btn).toHaveAttribute("data-cta", "add_first");
    await userEvent.click(btn);
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
    expect(btn).toHaveTextContent(/^update$/i);
    expect(btn).toHaveAttribute("data-cta", "update");
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
});

// Vitest doesn't auto-cleanup between tests with @testing-library/react when
// not configured globally; do it explicitly here so DOM-state doesn't bleed.
function afterEachCleanup() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { afterEach } = require("vitest");
  afterEach(() => cleanup());
}
