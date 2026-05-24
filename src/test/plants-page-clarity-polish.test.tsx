/**
 * Plants page clarity polish — UI/copy/read-path-only.
 *
 * Verifies:
 *   - InfoPopover renders click/tap content (not hover-only).
 *   - HELP_COPY contains the required grower-facing strings.
 *   - GrowDataSourceDisclosure no longer labels saved grow records as
 *     "Live data" (the misleading copy is gone).
 *   - GrowDataSourceDisclosure presents "Current grow data" language for
 *     the supabase-backed data source.
 *   - Plants page wiring: current grow strip, contextual help cluster,
 *     tent filter counts, archived toggle count, visible Manage menu,
 *     and "Add photo" CTA on the empty placeholder.
 *   - Static safety: no sensor ingestion / pi-ingest / Edge Function /
 *     alert persistence / Action Queue / service_role / automation
 *     strings introduced.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import InfoPopover, { HELP_COPY } from "@/components/InfoPopover";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import PlantPhoto from "@/components/PlantPhoto";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PLANTS = read("src/pages/Plants.tsx");
const DISCLOSURE = read("src/components/GrowDataSourceDisclosure.tsx");
const INFO = read("src/components/InfoPopover.tsx");
const PLANT_PHOTO = read("src/components/PlantPhoto.tsx");

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
  isDemoData = dataSource === "mock" || dataSource === "mixed",
): GrowDataSourceMeta => ({ isDemoData, dataSource, sourceReason: "test" });

describe("InfoPopover", () => {
  it("renders click/tap-only trigger and opens content on click", () => {
    render(
      <InfoPopover
        title="Manual snapshot"
        body={HELP_COPY.manualSnapshot}
        testKey="manual-snapshot"
      />,
    );
    const trigger = screen.getByTestId("info-popover-trigger-manual-snapshot");
    expect(trigger).toBeInTheDocument();
    // Popover content is not in the DOM until opened.
    expect(
      screen.queryByTestId("info-popover-content-manual-snapshot"),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const content = screen.getByTestId("info-popover-content-manual-snapshot");
    expect(content).toHaveTextContent(/manual snapshot/i);
    expect(content).toHaveTextContent(
      /not live connected sensor data/i,
    );
  });

  it("does not rely on hover-only behavior in source", () => {
    expect(INFO).not.toMatch(/onMouseEnter|onMouseOver|Tooltip/);
  });
});

describe("HELP_COPY canonical strings", () => {
  it("manual snapshot says not live connected sensor data", () => {
    expect(HELP_COPY.manualSnapshot).toMatch(
      /not live connected sensor data/i,
    );
  });
  it("live sensor data describes connected sensor or bridge", () => {
    expect(HELP_COPY.liveSensorData).toMatch(
      /connected sensor or bridge/i,
    );
  });
  it("simulated data says test/demo and warns it is not real tent data", () => {
    expect(HELP_COPY.simulatedData).toMatch(/test\/demo data/i);
    expect(HELP_COPY.simulatedData).toMatch(/not.*real tent data/i);
  });
  it("stale data prompts user to refresh", () => {
    expect(HELP_COPY.staleData).toMatch(/old/i);
  });
  it("mixed data acknowledges partial demo/missing context", () => {
    expect(HELP_COPY.mixedData).toMatch(/some.*real.*some.*demo|demo, missing/i);
  });
  it("archived/merged plants copy says kept for history and hidden by default", () => {
    expect(HELP_COPY.archivedMergedPlants).toMatch(/history and audit/i);
    expect(HELP_COPY.archivedMergedPlants).toMatch(/hidden.*by default/i);
  });
});

describe("GrowDataSourceDisclosure copy", () => {
  it("does not render the misleading 'Live data' badge copy", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("supabase", false)]}
        testId="plants-data-source-disclosure"
      />,
    );
    const badge = screen.getByTestId("plants-data-source-disclosure-badge");
    expect(badge.textContent ?? "").not.toMatch(/live data/i);
    // data-label classification stays "Live" for downstream filters.
    expect(badge.getAttribute("data-label")).toBe("Live");
  });

  it("presents 'Current grow data' language for saved grow records", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("supabase", false)]}
        testId="plants-data-source-disclosure"
      />,
    );
    expect(
      screen.getByTestId("plants-data-source-disclosure"),
    ).toHaveTextContent(/current grow data/i);
  });

  it("renders an InfoPopover that distinguishes app records from live sensors", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("supabase", false)]}
        testId="plants-data-source-disclosure"
      />,
    );
    const trigger = screen.getByTestId(
      "info-popover-trigger-plants-data-source-disclosure-source",
    );
    fireEvent.click(trigger);
    const content = screen.getByTestId(
      "info-popover-content-plants-data-source-disclosure-source",
    );
    expect(content).toHaveTextContent(/not a live sensor reading|not live/i);
  });
});

describe("Plants page wiring", () => {
  it("renders the current grow context strip with help popover", () => {
    expect(PLANTS).toMatch(/plants-current-grow-strip/);
    expect(PLANTS).toMatch(/plants-current-grow-data/);
    // The strip now uses the deterministic filter-summary line instead of
    // the older "current grow name / empty" testids.
    expect(PLANTS).toMatch(/plants-filter-summary/);
  });

  it("renders the contextual help cluster with required popovers", () => {
    expect(PLANTS).toMatch(/plants-help-cluster/);
    for (const key of [
      "plants-manual-snapshot",
      "plants-live-sensor-data",
      "plants-simulated-data",
      "plants-stale-data",
      "plants-mixed-data",
      "plants-archived-merged",
    ]) {
      expect(PLANTS).toContain(key);
    }
  });

  it("renders per-tent filter counts via data-testid + (N) text", () => {
    expect(PLANTS).toMatch(/plants-tent-filter-/);
    expect(PLANTS).toMatch(/\{t\.name\}\s*\(\{t\.count\}\)/);
  });

  it("archived toggle shows count when archived plants exist", () => {
    expect(PLANTS).toMatch(/Show archived \(\$\{archivedCount\}\)/);
    expect(PLANTS).toMatch(/Hide archived \(\$\{archivedCount\}\)/);
    // Toggle is gated so it does not render when zero archived plants exist.
    expect(PLANTS).toMatch(/hasArchived\s*&&\s*archivedCount\s*>\s*0/);
  });

  it("renders an always-visible Manage menu (not hover-only) on cards", () => {
    expect(PLANTS).toMatch(/plant-card-manage-slot/);
    expect(PLANTS).toMatch(/<PlantCardActionsMenu/);
    expect(PLANTS).not.toMatch(/group-hover.*PlantCardActionsMenu/);
  });

  it("does not introduce sensor ingestion, automation, or device control", () => {
    expect(PLANTS).not.toMatch(/service_role/);
    expect(PLANTS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation/i,
    );
  });
});

describe("PlantPhoto placeholder copy", () => {
  it("renders 'No plant photo yet' caption", () => {
    render(<PlantPhoto src={null} caption="No plant photo yet" />);
    expect(screen.getByTestId("plant-photo-placeholder-caption")).toHaveTextContent(
      /no plant photo yet/i,
    );
  });

  it("renders 'Add photo' CTA copy", () => {
    render(<PlantPhoto src={null} caption="No plant photo yet" />);
    expect(screen.getByTestId("plant-photo-placeholder-cta")).toHaveTextContent(
      /add photo/i,
    );
  });

  it("PlantPhoto source still has no I/O and no writes", () => {
    expect(PLANT_PHOTO).not.toMatch(/service_role/);
    expect(PLANT_PHOTO).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });
});

describe("Static safety guardrails", () => {
  it("GrowDataSourceDisclosure remains read-only", () => {
    expect(DISCLOSURE).not.toMatch(/service_role/);
    expect(DISCLOSURE).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(DISCLOSURE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
  it("InfoPopover is presentation-only", () => {
    expect(INFO).not.toMatch(/service_role/);
    expect(INFO).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(INFO).not.toMatch(/supabase/i);
  });
});
