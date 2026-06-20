/**
 * useHarvestEvidenceReportData — data-hook tests.
 *
 * Confirms the hook:
 *   - maps diary note rows into report input (single plant scope)
 *   - maps photo rows into report input
 *   - never reads sensor_readings
 *   - tolerates missing/malformed rows
 *   - returns loading state
 *   - returns empty state
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useHarvestEvidenceReportData } from "@/hooks/useHarvestEvidenceReportData";
import { buildHarvestEvidenceReport } from "@/lib/harvestEvidenceReportViewModel";

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
  tentId: "t1",
  growId: "g1",
  photo: "",
};

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "e",
    event_type: "observation",
    created_at: "2026-06-15T10:00:00.000Z",
    note: "",
    plant_id: "p1",
    tent_id: "t1",
    photo_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
});

describe("useHarvestEvidenceReportData", () => {
  it("returns loading state when either source is loading", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: true, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { result } = renderHook(() => useHarvestEvidenceReportData("p1"));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.plantInputs).toEqual([]);
  });

  it("returns empty state when no rows", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { result } = renderHook(() => useHarvestEvidenceReportData("p1"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.plantInputs).toHaveLength(1);
    expect(result.current.plantInputs[0].plantId).toBe("p1");
  });

  it("returns no plant inputs when plantId is null", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { result } = renderHook(() => useHarvestEvidenceReportData(null));
    expect(result.current.plantInputs).toEqual([]);
  });

  it("maps diary note rows into report input that classify as trichome", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        row({ id: "n1", note: "Checked trichomes — 30% cloudy across upper colas." }),
      ],
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useHarvestEvidenceReportData("p1"));
    const report = buildHarvestEvidenceReport(result.current.plantInputs);
    expect(report.totals.trichomeInspections).toBe(1);
    expect(report.totals.closeFlowerPhotos).toBe(0);
  });

  it("maps photo rows into report input as close flower photos", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        row({
          id: "p1ph",
          event_type: "photo",
          note: "",
          photo_url: "https://example.test/photo.jpg",
        }),
      ],
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useHarvestEvidenceReportData("p1"));
    const report = buildHarvestEvidenceReport(result.current.plantInputs);
    expect(report.totals.closeFlowerPhotos).toBe(1);
    // Generic photo must NOT be counted as trichome evidence.
    expect(report.totals.trichomeInspections).toBe(0);
  });

  it("does not call sensor_readings APIs", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/hooks/useHarvestEvidenceReportData.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/sensor_readings/i);
    expect(src).not.toMatch(/useSensorReadings|useLatestSensorSnapshot|usePlantTentLatestReadings/);
  });

  it("tolerates malformed rows without throwing", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [null, undefined, {}, row({ id: "ok", note: "Trichomes cloudy." })],
      isLoading: false,
      isError: false,
    });
    expect(() => {
      const { result } = renderHook(() => useHarvestEvidenceReportData("p1"));
      buildHarvestEvidenceReport(result.current.plantInputs);
    }).not.toThrow();
  });

  it("does not import AI, alerts, action queue, or device control", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/hooks/useHarvestEvidenceReportData.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/ai-doctor|aiDoctor|ai_doctor/i);
    expect(src).not.toMatch(/alerts?\//i);
    expect(src).not.toMatch(/action[_-]?queue/i);
    expect(src).not.toMatch(/device[_-]?control/i);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
