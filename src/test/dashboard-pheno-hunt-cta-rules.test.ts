import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PHENO_HUNT_MIN_CANDIDATES,
  buildDashboardPhenoHuntCtaView,
  resolvePhenoHuntCtaGrowId,
} from "@/lib/dashboardPhenoHuntCtaRules";

const ROOT = resolve(__dirname, "../..");

describe("dashboardPhenoHuntCtaRules", () => {
  it("hides while loading or without grow", () => {
    expect(
      buildDashboardPhenoHuntCtaView({
        growId: "g1",
        candidateCount: 5,
        loading: true,
      }).visible,
    ).toBe(false);
    expect(
      buildDashboardPhenoHuntCtaView({
        growId: null,
        candidateCount: 5,
      }).visible,
    ).toBe(false);
  });

  it("hides when below min candidates", () => {
    const v = buildDashboardPhenoHuntCtaView({
      growId: "g1",
      growName: "Spring",
      candidateCount: PHENO_HUNT_MIN_CANDIDATES - 1,
    });
    expect(v.visible).toBe(false);
    expect(v.reasonHidden).toBe("need_more_plants");
  });

  it("shows CTA with deep link when ≥2 candidates", () => {
    const v = buildDashboardPhenoHuntCtaView({
      growId: "g1",
      growName: "Spring",
      candidateCount: 3,
    });
    expect(v.visible).toBe(true);
    expect(v.href).toBe("/pheno-hunts/new?growId=g1");
    expect(v.ctaLabel).toMatch(/Start Pheno Hunt/i);
    expect(v.description).toMatch(/3 plants/);
  });

  it("prefers scoped grow over active", () => {
    expect(resolvePhenoHuntCtaGrowId({ scopedGrowId: "scoped", activeGrowId: "active" })).toBe(
      "scoped",
    );
    expect(resolvePhenoHuntCtaGrowId({ scopedGrowId: null, activeGrowId: "active" })).toBe(
      "active",
    );
  });
});

describe("Dashboard wiring", () => {
  const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
  const CARD = readFileSync(
    resolve(ROOT, "src/components/DashboardStartPhenoHuntCard.tsx"),
    "utf8",
  );

  it("mounts the card", () => {
    expect(DASH).toMatch(/DashboardStartPhenoHuntCard/);
  });

  it("card uses dual-binding filter + CTA test ids", () => {
    expect(CARD).toMatch(/buildPhenoHuntCandidateOrFilter/);
    expect(CARD).toContain('data-testid="dashboard-start-pheno-hunt-card"');
    expect(CARD).toContain('data-testid="dashboard-start-pheno-hunt-cta"');
  });
});
