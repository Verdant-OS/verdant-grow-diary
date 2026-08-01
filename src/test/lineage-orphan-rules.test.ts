import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasLineageOrphans,
  totalOrphanCount,
  canBulkAssignOrphansToActiveGrow,
  buildDashboardLineageOrphansView,
  formatBulkAssignResult,
  LINEAGE_REPAIR_HREF,
} from "@/lib/lineageOrphanRules";

const ROOT = resolve(__dirname, "../..");

describe("lineageOrphanRules", () => {
  it("counts and visibility", () => {
    expect(totalOrphanCount({ unboundTentCount: 2, unboundPlantCount: 3 })).toBe(5);
    expect(hasLineageOrphans({ unboundTentCount: 0, unboundPlantCount: 0 })).toBe(false);
    expect(hasLineageOrphans({ unboundTentCount: 1, unboundPlantCount: 0 })).toBe(true);
  });

  it("bulk assign requires active grow + orphans", () => {
    expect(
      canBulkAssignOrphansToActiveGrow({
        activeGrowId: "g1",
        unboundTentCount: 1,
        unboundPlantCount: 0,
      }),
    ).toBe(true);
    expect(
      canBulkAssignOrphansToActiveGrow({
        activeGrowId: null,
        unboundTentCount: 1,
        unboundPlantCount: 0,
      }),
    ).toBe(false);
    expect(
      canBulkAssignOrphansToActiveGrow({
        activeGrowId: "g1",
        unboundTentCount: 0,
        unboundPlantCount: 0,
      }),
    ).toBe(false);
  });

  it("dashboard view hidden when clean", () => {
    const v = buildDashboardLineageOrphansView({
      unboundTentCount: 0,
      unboundPlantCount: 0,
      activeGrowId: "g1",
    });
    expect(v.visible).toBe(false);
  });

  it("dashboard view shows counts and bulk CTA with active grow", () => {
    const v = buildDashboardLineageOrphansView({
      unboundTentCount: 2,
      unboundPlantCount: 4,
      activeGrowId: "g1",
      activeGrowName: "Spring",
    });
    expect(v.visible).toBe(true);
    expect(v.totalCount).toBe(6);
    expect(v.canBulkAssign).toBe(true);
    expect(v.bulkCtaLabel).toMatch(/Spring/);
    expect(v.repairHref).toBe(LINEAGE_REPAIR_HREF);
  });

  it("dashboard view disables bulk without active grow", () => {
    const v = buildDashboardLineageOrphansView({
      unboundTentCount: 1,
      unboundPlantCount: 0,
      activeGrowId: null,
    });
    expect(v.canBulkAssign).toBe(false);
    expect(v.bulkDisabledReason).toMatch(/active grow/i);
  });

  it("formats bulk toast", () => {
    expect(formatBulkAssignResult({ tentsUpdated: 1, plantsUpdated: 2 })).toMatch(
      /1 tent.*2 plants/,
    );
    expect(formatBulkAssignResult({ tentsUpdated: 0, plantsUpdated: 0 })).toMatch(/No unbound/);
  });
});

describe("Dashboard + Lineage wiring", () => {
  const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
  const CARD = readFileSync(
    resolve(ROOT, "src/components/DashboardLineageOrphansCard.tsx"),
    "utf8",
  );
  const REPAIR = readFileSync(resolve(ROOT, "src/pages/GrowLineageRepair.tsx"), "utf8");
  const HOOK = readFileSync(resolve(ROOT, "src/hooks/useLineageOrphans.ts"), "utf8");

  it("Dashboard mounts the orphans card", () => {
    expect(DASH).toMatch(/DashboardLineageOrphansCard/);
  });

  it("card exposes bulk assign + repair link test ids", () => {
    expect(CARD).toContain('data-testid="dashboard-lineage-orphans-card"');
    expect(CARD).toContain('data-testid="dashboard-lineage-orphans-bulk-assign"');
    expect(CARD).toContain('data-testid="dashboard-lineage-orphans-repair-link"');
  });

  it("bulk assign only updates grow_id on tents/plants", () => {
    expect(HOOK).toMatch(/\.from\("tents"\)[\s\S]*\.update\(\{\s*grow_id:\s*growId\s*\}\)/);
    expect(HOOK).toMatch(/\.from\("plants"\)[\s\S]*\.update\(\{\s*grow_id:\s*growId\s*\}\)/);
    expect(HOOK).toMatch(/\.is\("grow_id", null\)/);
    expect(HOOK).not.toMatch(/diary_entries|action_queue|service_role|functions\.invoke/);
  });

  it("Lineage Repair exposes bulk assign panel", () => {
    expect(REPAIR).toContain('data-testid="lineage-bulk-assign-panel"');
    expect(REPAIR).toContain('data-testid="lineage-bulk-assign-active-grow"');
    expect(REPAIR).toMatch(/bulkAssignOrphansToGrow/);
  });
});
