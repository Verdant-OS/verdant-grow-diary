import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDashboardPhenoHuntCtaView,
  resolvePhenoHuntCtaGrowId,
  PHENO_HUNT_MIN_CANDIDATES,
} from "@/lib/dashboardPhenoHuntCtaRules";

const ROOT = resolve(__dirname, "../..");

describe("dashboardPhenoHuntCtaRules", () => {
  it("hides without grow or enough plants", () => {
    expect(buildDashboardPhenoHuntCtaView({ growId: null, candidateCount: 5 }).visible).toBe(false);
    expect(
      buildDashboardPhenoHuntCtaView({
        growId: "g1",
        candidateCount: PHENO_HUNT_MIN_CANDIDATES - 1,
      }).visible,
    ).toBe(false);
    expect(
      buildDashboardPhenoHuntCtaView({ growId: "g1", candidateCount: 2, loading: true }).visible,
    ).toBe(false);
  });

  it("shows CTA at ≥2 candidates with hunt href", () => {
    const v = buildDashboardPhenoHuntCtaView({
      growId: "g1",
      growName: "Spring",
      candidateCount: 3,
    });
    expect(v.visible).toBe(true);
    expect(v.href).toBe("/pheno-hunts/new?growId=g1");
    expect(v.description).toMatch(/3 plants/);
    expect(v.ctaLabel).toMatch(/Pheno Hunt/i);
  });

  it("prefers scoped grow over active", () => {
    expect(resolvePhenoHuntCtaGrowId({ scopedGrowId: "s1", activeGrowId: "a1" })).toBe("s1");
    expect(resolvePhenoHuntCtaGrowId({ scopedGrowId: null, activeGrowId: "a1" })).toBe("a1");
  });
});

describe("Dashboard wiring", () => {
  const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
  const CARD = readFileSync(
    resolve(ROOT, "src/components/DashboardStartPhenoHuntCard.tsx"),
    "utf8",
  );

  it("mounts the Start Pheno Hunt card", () => {
    expect(DASH).toMatch(/DashboardStartPhenoHuntCard/);
  });

  it("card loads dual-binding candidates and exposes CTA test id", () => {
    expect(CARD).toMatch(/loadPhenoHuntCandidates/);
    expect(CARD).toContain('data-testid="dashboard-start-pheno-hunt-cta"');
    expect(CARD).toContain('data-testid="dashboard-start-pheno-hunt-card"');
  });
});
