/**
 * Alert row → Blueprint target-band link.
 *
 * #924 built the deep-link anchor and only the Daily Check hint used it. The
 * tent-alerts panel knows WHICH metric breached, so a row can link that
 * specific alert to the band it scores against — information the full teaser
 * above the panel (on Plant Detail) does not carry, which is what keeps this
 * from being a second pitch for the same feature.
 *
 * Two invariants:
 *
 * 1. HONESTY. The link renders only when the breached metric actually has a
 *    Blueprint band. Soil-probe alerts do NOT map — Blueprint's ec/ph bands
 *    score the grower's fed input, not soil sensors, and connecting the two
 *    would mislead. Snapshot-level alerts have no single metric.
 *
 * 2. TIER-AGNOSTIC. This is navigation, not upsell: Craft lands on live
 *    scoring, everyone else on the free preview. The panel must not gain
 *    entitlement logic (asserted in tent-alerts-blueprint-hint.test.tsx).
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { resolveAlertBlueprintMetric } from "@/lib/alertBlueprintLinkRules";
import {
  buildPlantBlueprintPath,
  PLANT_BLUEPRINT_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";

const ROOT = resolve(__dirname, "../..");
const PANEL = readFileSync(
  resolve(ROOT, "src/components/PlantAssignedTentAlertsPanel.tsx"),
  "utf8",
);

const row = (metric: string | null) => ({
  id: "alert-1",
  title: "Temperature high",
  reason: "28.4C above the flower band",
  severity: "warning" as const,
  severityLabel: "Warning",
  metric,
  status: "open" as const,
  lastSeenAt: null,
});

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ status: "ready", rows: mocks.rows }),
}));

vi.mock("@/components/ui/card", () => {
  const P = ({ children, ...r }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...r}>{children}</div>
  );
  return { Card: P, CardContent: P, CardHeader: P, CardTitle: P };
});

import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";

function renderPanel(plantId: string | null) {
  return render(
    <MemoryRouter initialEntries={["/plants/plant-1"]}>
      <PlantAssignedTentAlertsPanel
        tentId="tent-1"
        tentName="Flower Tent"
        growId="grow-1"
        plantId={plantId}
      />
    </MemoryRouter>,
  );
}

const BAND = "plant-assigned-tent-alert-target-band";

beforeEach(() => {
  mocks.rows = [row("temp")];
});

describe("alert metric → Blueprint band mapping", () => {
  it("maps exactly the metrics Blueprint actually bands", () => {
    expect(resolveAlertBlueprintMetric("temp")).toBe("tempC");
    expect(resolveAlertBlueprintMetric("rh")).toBe("rh");
    expect(resolveAlertBlueprintMetric("vpd")).toBe("vpdKpa");
    expect(resolveAlertBlueprintMetric("ppfd")).toBe("ppfd");
  });

  it("refuses soil-probe metrics — Blueprint ec/ph score fed input, not soil", () => {
    expect(resolveAlertBlueprintMetric("soil")).toBeNull();
    expect(resolveAlertBlueprintMetric("soil_ec")).toBeNull();
    expect(resolveAlertBlueprintMetric("soil_temp")).toBeNull();
  });

  it("refuses snapshot-level and unknown metrics", () => {
    expect(resolveAlertBlueprintMetric("snapshot")).toBeNull();
    expect(resolveAlertBlueprintMetric("targets")).toBeNull();
    expect(resolveAlertBlueprintMetric(null)).toBeNull();
    expect(resolveAlertBlueprintMetric(undefined)).toBeNull();
    expect(resolveAlertBlueprintMetric("temperature_c")).toBeNull();
  });
});

describe("tent alerts · Target Band link", () => {
  it("links a banded metric's alert to the Blueprint anchor, exactly", () => {
    renderPanel("plant-1");
    const href = screen.getByTestId(BAND).getAttribute("href") ?? "";
    expect(href).toBe(buildPlantBlueprintPath("plant-1"));
    // Exact parsed hash, independent of the helper — comparing only to the
    // helper is circular, and toContain passes for a drifted superset.
    expect(new URL(href, "http://plant-detail.local").hash).toBe(`#${PLANT_BLUEPRINT_ANCHOR_ID}`);
  });

  it("renders alongside the Ask AI Doctor CTA, not instead of it", () => {
    renderPanel("plant-1");
    expect(screen.getByTestId("plant-assigned-tent-alert-ask-doctor")).toBeInTheDocument();
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeInTheDocument();
  });

  it("withholds the link for a soil alert — no band exists to show", () => {
    mocks.rows = [row("soil_ec")];
    renderPanel("plant-1");
    expect(screen.queryByTestId(BAND)).toBeNull();
    // The row's other affordances are untouched.
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeInTheDocument();
  });

  it("withholds the link when the caller cannot prove plant ownership", () => {
    renderPanel(null);
    expect(screen.queryByTestId(BAND)).toBeNull();
  });
});

describe("tent alerts · Target Band wiring guards", () => {
  it("builds the href from the shared helper, never by hand", () => {
    expect(PANEL).toMatch(
      /import\s*\{[^}]*buildPlantBlueprintPath[^}]*\}\s*from\s*["']@\/lib\/plantDetailQuickActions["']/,
    );
    expect(PANEL).toMatch(/buildPlantBlueprintPath\(plantId\)/);
  });

  it("gates on the mapping, so unmappable alerts can never grow a link", () => {
    expect(PANEL).toMatch(/resolveAlertBlueprintMetric\(row\.metric\)/);
  });
});
