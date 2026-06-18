/**
 * Plant Detail Harvest Watch mount tests.
 *
 * Verifies the v1.5 Harvest Watch card is mounted on PlantDetail.tsx via a
 * static-source scan, the mandated v0 evidence-only caution copy renders,
 * and the card source contains no unsafe harvest-instruction language or
 * forbidden imports (AI/alerts/Action Queue/device control/Supabase writes).
 *
 * Pure source-text + render-level assertions. No Supabase, no AI.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";

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

const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const CARD = read("src/components/PlantDetailHarvestWatchCard.tsx");
const RULES = read("src/lib/harvestWatchRules.ts");
const ROW_VM = read("src/lib/harvestWatchViewModel.ts");
const ADAPTER_VM = read("src/lib/plantDetailHarvestWatchCardViewModel.ts");

const ALL_HARVEST_SOURCES = [CARD, RULES, ROW_VM, ADAPTER_VM];

const FORBIDDEN_PHRASES = [
  /\bharvest now\b/i,
  /\bready to harvest\b/i,
  /\bguaranteed\b/i,
  /\boptimal\b/i,
  /\bchop\b/i,
  /\bflush\b/i,
  /\bdark period\b/i,
  /\bfix immediately\b/i,
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["'][^"']*ai-?doctor[^"']*["']/i,
  /from\s+["'][^"']*aiDoctor[^"']*["']/i,
  /from\s+["'][^"']*\/alerts?[^"']*["']/i,
  /from\s+["'][^"']*action[-_]?queue[^"']*["']/i,
  /from\s+["'][^"']*actionQueue[^"']*["']/i,
  /from\s+["'][^"']*device[-_]?control[^"']*["']/i,
  /supabase[^"']*\.(insert|update|delete|upsert)\s*\(/i,
];

describe("Plant Detail Harvest Watch mount", () => {
  it("PlantDetail.tsx imports the Harvest Watch card", () => {
    expect(PLANT_DETAIL).toMatch(
      /import\s+PlantDetailHarvestWatchCard\s+from\s+["']@\/components\/PlantDetailHarvestWatchCard["']/,
    );
  });

  it("PlantDetail.tsx mounts <PlantDetailHarvestWatchCard /> exactly once", () => {
    const occurrences =
      PLANT_DETAIL.match(/<PlantDetailHarvestWatchCard\b/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it("mount passes only safe Plant Detail context props", () => {
    const mountMatch = PLANT_DETAIL.match(
      /<PlantDetailHarvestWatchCard[\s\S]*?\/>/,
    );
    expect(mountMatch).not.toBeNull();
    const mount = mountMatch![0];
    expect(mount).toMatch(/plantId=/);
    // Must not pass alerts, AI, action-queue, or device-control props.
    expect(mount).not.toMatch(/alerts?=|actionQueue=|aiDoctor=|device/i);
  });

  it("harvest watch sources contain no unsafe instruction phrases", () => {
    for (const src of ALL_HARVEST_SOURCES) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(src).not.toMatch(phrase);
      }
    }
  });

  it("harvest watch sources have no forbidden imports/writes", () => {
    for (const src of ALL_HARVEST_SOURCES) {
      for (const pat of FORBIDDEN_IMPORT_PATTERNS) {
        expect(src).not.toMatch(pat);
      }
    }
  });

  it("renders evidence-only caution copy when card loads in limited mode", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: true });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    expect(
      screen.getByTestId("plant-detail-harvest-watch-card-loading"),
    ).toBeInTheDocument();
  });

  it("renders mandated evidence-only caution copy on the loaded card", () => {
    mocks.useGrowPlant.mockReturnValue({
      data: {
        id: "p1",
        name: "Test",
        strain: "Test Strain",
        stage: "flower",
        startedAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
        tentId: "t1",
        growId: "g1",
        photo: "",
        health: "healthy",
        lastNote: "",
      },
      isLoading: false,
    });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    const caution = screen.getByTestId(
      "plant-detail-harvest-watch-evidence-only-caution",
    );
    expect(caution.textContent).toMatch(
      /Harvest Watch is evidence-only\. Confirm with direct plant inspection before making harvest decisions\./,
    );
    // No certainty / instruction phrasing leaks into the rendered DOM.
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain("harvest now");
    expect(html).not.toContain("ready to harvest");
    expect(html).not.toContain("guaranteed");
    expect(html).not.toContain("optimal");
  });
});
