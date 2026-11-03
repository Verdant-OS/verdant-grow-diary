/**
 * Audit 2026-11-03 finding 12, measured in docs/specs/contrast-tokens.md §2.3:
 * the freshness card drew its stale value at muted-foreground/60 (3.28:1),
 * "No plant manual log" at /50 (2.64:1) and the "Stale · Last manual log" line
 * at /70 (4.04:1). These are the words that tell a grower a reading is old or
 * absent, so they now use the full muted token (6.59:1 on card), which passes
 * WCAG AA. Stale still differs from fresh by colour, the alert icon and its word.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PlantManualSensorFreshnessCard from "@/components/PlantManualSensorFreshnessCard";
import type { PlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

vi.mock("@/hooks/usePlantManualSensorHistory", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePlantManualSensorHistory")>(
    "@/hooks/usePlantManualSensorHistory",
  );
  return { ...actual, usePlantManualSensorHistory: vi.fn() };
});

import { usePlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

const mocked = usePlantManualSensorHistory as unknown as ReturnType<typeof vi.fn>;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Muted text below 80% opacity fails AA on card (spec §2.3); full or /80+ passes. */
const FAINT_MUTED = /\btext-muted-foreground\/[1-7]\d\b/;

afterEach(() => {
  cleanup();
  mocked.mockReset();
});

function renderCard(data: PlantManualSensorHistory) {
  mocked.mockReturnValue({ data, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PlantManualSensorFreshnessCard plantId="p1" onUpdate={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("freshness card stale and missing text contrast", () => {
  it("draws a stale value and its 'Stale · Last manual log' line at readable contrast", () => {
    renderCard({
      temp_f: { value: 77, loggedAt: hoursAgo(72) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    const tile = screen.getByTestId("plant-manual-sensor-freshness-temp_f");
    expect(tile).toHaveAttribute("data-state", "stale");
    const value = within(tile).getByText("77");
    expect(value.className).toContain("text-muted-foreground");
    expect(value.className).not.toMatch(FAINT_MUTED);
    const lastLog = screen.getByTestId("plant-manual-sensor-freshness-temp_f-last-log");
    expect(lastLog).toHaveTextContent(/^Stale · Last manual log/);
    expect(lastLog.className).not.toMatch(FAINT_MUTED);
  });

  it("draws the missing-reading text at readable contrast", () => {
    renderCard({ temp_f: null, humidity_percent: null, ph: null, ec: null });
    const missing = screen.getByTestId("plant-manual-sensor-freshness-ph-missing");
    expect(missing).toHaveTextContent("No plant manual log");
    expect(missing.className).toContain("text-muted-foreground");
    expect(missing.className).not.toMatch(FAINT_MUTED);
  });

  it("still marks a stale reading with its alert icon and never styles it as fresh", () => {
    renderCard({
      temp_f: { value: 77, loggedAt: hoursAgo(72) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    expect(screen.getByTestId("plant-manual-sensor-freshness-temp_f-indicator")).toHaveAttribute(
      "aria-label",
      "Stale",
    );
    const value = within(screen.getByTestId("plant-manual-sensor-freshness-temp_f")).getByText(
      "77",
    );
    expect(value.className).not.toContain("text-primary");
  });

  it("keeps a fresh reading in the primary colour", () => {
    renderCard({
      temp_f: { value: 77, loggedAt: hoursAgo(1) },
      humidity_percent: null,
      ph: null,
      ec: null,
    });
    const value = within(screen.getByTestId("plant-manual-sensor-freshness-temp_f")).getByText(
      "77",
    );
    expect(value.className).toContain("text-primary");
  });
});
