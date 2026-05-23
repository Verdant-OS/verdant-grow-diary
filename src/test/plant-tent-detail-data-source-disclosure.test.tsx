/**
 * Tests for PlantDetail and TentDetail data-source disclosure wiring.
 *
 * Static contract tests verify imports and presenter wiring.
 * Pure render tests confirm Demo/Mixed/Live behavior via the shared
 * GrowDataSourceDisclosure presenter (which is what the detail pages render).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const PLANT_DETAIL = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");
const TENT_DETAIL = readFileSync(resolve(ROOT, "src/pages/TentDetail.tsx"), "utf8");

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
  isDemoData = dataSource === "mock" || dataSource === "mixed",
): GrowDataSourceMeta => ({
  isDemoData,
  dataSource,
  sourceReason: "test",
});

describe("PlantDetail disclosure behavior", () => {
  it("renders Demo badge for mock-backed plant detail metas", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plant"
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
        testId="plant-detail-data-source-disclosure"
      />,
    );
    const b = screen.getByTestId("plant-detail-data-source-disclosure-badge");
    expect(b.getAttribute("data-label")).toBe("Demo");
  });

  it("renders Mixed badge when plant is supabase and tent is mock", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plant"
        hasAnyData
        metas={[meta("supabase", false), meta("mock")]}
        testId="plant-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Mixed");
  });

  it("never renders Live for mock-backed plant detail", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plant"
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
        testId="plant-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("renders safe not-found state when no usable plant exists", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={false}
        metas={[meta("unavailable", false)]}
        testId="plant-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Unavailable");
  });
});

describe("TentDetail disclosure behavior", () => {
  it("renders Demo badge for mock-backed tent detail metas", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
        testId="tent-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tent-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Demo");
  });

  it("renders Mixed badge when tent is supabase but subdata is mock", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[meta("supabase", false), meta("mock")]}
        testId="tent-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tent-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Mixed");
  });

  it("never renders Live for mock-backed tent detail", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
        testId="tent-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tent-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("renders safe not-found state when no usable tent exists", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData={false}
        metas={[meta("unavailable", false)]}
        testId="tent-detail-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tent-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Unavailable");
  });
});

describe("PlantDetail page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(PLANT_DETAIL).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(PLANT_DETAIL).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("reads classification metadata via getGrowDataMeta", () => {
    expect(PLANT_DETAIL).toMatch(/getGrowDataMeta/);
  });

  it("renders a not-found empty state when plant is missing", () => {
    expect(PLANT_DETAIL).toMatch(/Plant not found/);
  });

  it("uses real grow tent hook (not mock useTent) for the tent lookup", () => {
    expect(PLANT_DETAIL).not.toMatch(/from\s+["']@\/hooks\/useMockData["']/);
    expect(PLANT_DETAIL).toMatch(/useGrowTent/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(PLANT_DETAIL).not.toMatch(/service_role/);
    expect(PLANT_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});

describe("TentDetail page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(TENT_DETAIL).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(TENT_DETAIL).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("reads classification metadata via getGrowDataMeta", () => {
    expect(TENT_DETAIL).toMatch(/getGrowDataMeta/);
  });

  it("no longer relies on mock subdata — sensors and plants are real", () => {
    expect(TENT_DETAIL).not.toMatch(/DEMO_SUBDATA_META/);
    expect(TENT_DETAIL).not.toMatch(/from\s+["']@\/hooks\/useMockData["']/);
    expect(TENT_DETAIL).toMatch(/from\s+["']@\/hooks\/use-sensor-readings["']/);
  });

  it("renders a not-found empty state when tent is missing", () => {
    expect(TENT_DETAIL).toMatch(/Tent not found/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(TENT_DETAIL).not.toMatch(/service_role/);
    expect(TENT_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});
