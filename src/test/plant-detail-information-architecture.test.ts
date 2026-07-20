import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");
const SECTION_NAV = readFileSync(resolve(ROOT, "src/components/PlantDetailSectionNav.tsx"), "utf8");
const QUICK_ACTIONS = readFileSync(
  resolve(ROOT, "src/components/PlantDetailQuickActions.tsx"),
  "utf8",
);
const RECAP = readFileSync(
  resolve(ROOT, "src/components/PlantDetailRecentActivityRecap.tsx"),
  "utf8",
);
const STATUS = readFileSync(resolve(ROOT, "src/components/PlantQuickStatusStrip.tsx"), "utf8");
const ACTIVE_PAGE = PAGE.slice(
  PAGE.indexOf("const ageDays"),
  PAGE.indexOf("function ArchivedPlantBanner"),
);

function count(source: string, token: string) {
  return source.split(token).length - 1;
}

function countComponent(source: string, component: string) {
  return source.match(new RegExp(`<${component}(?=[\\s/>])`, "g"))?.length ?? 0;
}

describe("Plant Detail information architecture", () => {
  it("mounts the three controlled disclosure groups exactly once", () => {
    expect(count(ACTIVE_PAGE, '<PlantDetailDisclosureSection\n          group="history"')).toBe(1);
    expect(count(ACTIVE_PAGE, '<PlantDetailDisclosureSection\n          group="harvest"')).toBe(1);
    expect(count(ACTIVE_PAGE, '<PlantDetailDisclosureSection\n          group="ai"')).toBe(1);
  });

  it("keeps every long-form surface mounted exactly once", () => {
    for (const component of [
      "PlantDetailHarvestWatchCard",
      "PlantDetailHarvestEvidenceReportMount",
      "PlantRelativeTimelineSection",
      "PlantDetailAskDoctorHelper",
      "PlantDetailAiDoctorReadiness",
      "PlantDetailAiDoctorContextReadinessMount",
      "PlantDetailTimelineEvidenceReadinessLaunch",
      "PlantDetailDoctorContextPreview",
      "PlantDetailAiDoctorReadinessGate",
      "PlantDetailAiDoctorSafeReviewStart",
      "AiDoctorReviewResultPreview",
      "PlantDetailAiDoctorLiveReview",
      "PlantDetailAiDoctorContextPanel",
      "PlantAiDoctorSessionsPanel",
    ]) {
      expect(countComponent(ACTIVE_PAGE, component), component).toBe(1);
    }
  });

  it("keeps essentials ahead of disclosures and recap -> response -> harvest source order", () => {
    const overview = ACTIVE_PAGE.indexOf("PLANT_DETAIL_SECTION_ANCHORS.overview");
    const profile = ACTIVE_PAGE.indexOf("<PlantProfileContextCard");
    const missing = ACTIVE_PAGE.indexOf("<PlantDetailWhatsMissing");
    const recap = ACTIVE_PAGE.indexOf("<PlantDetailRecentActivityRecap");
    const response = ACTIVE_PAGE.indexOf("<PlantDetailRecentActionResponse");
    const environment = ACTIVE_PAGE.indexOf("<PlantTentEnvironmentPanel");
    const dailyCheck = ACTIVE_PAGE.indexOf('data-testid="plant-daily-grow-check-section"');
    const alerts = ACTIVE_PAGE.indexOf("PLANT_DETAIL_SECTION_ANCHORS.alerts");
    const actions = ACTIVE_PAGE.indexOf("PLANT_DETAIL_SECTION_ANCHORS.actions");
    const historyDisclosure = ACTIVE_PAGE.indexOf('group="history"');
    const harvestDisclosure = ACTIVE_PAGE.indexOf('group="harvest"');
    const aiDisclosure = ACTIVE_PAGE.indexOf('group="ai"');

    expect(overview).toBeGreaterThan(-1);
    expect(overview).toBeLessThan(profile);
    expect(profile).toBeLessThan(missing);
    expect(missing).toBeLessThan(recap);
    expect(recap).toBeLessThan(response);
    expect(response).toBeLessThan(environment);
    expect(environment).toBeLessThan(dailyCheck);
    expect(dailyCheck).toBeLessThan(alerts);
    expect(alerts).toBeLessThan(actions);
    expect(actions).toBeLessThan(historyDisclosure);
    expect(historyDisclosure).toBeLessThan(harvestDisclosure);
    expect(harvestDisclosure).toBeLessThan(aiDisclosure);
    expect(response).toBeLessThan(harvestDisclosure);
  });

  it("does not trap the legacy AI anchor restorer inside hidden content", () => {
    expect(PAGE).not.toContain("AiDoctorReviewAnchorRestorer");
  });

  it("wires one reveal coordinator through every in-page navigation surface", () => {
    expect(PAGE).toMatch(/revealAndNavigate/);
    for (const source of [SECTION_NAV, QUICK_ACTIONS, RECAP, STATUS]) {
      expect(source).toMatch(/onRevealAndNavigate/);
    }
  });

  it("pins mobile-safe disclosure/nav contracts without hiding overflow", () => {
    expect(SECTION_NAV).toMatch(/min-h-11/);
    expect(SECTION_NAV).toMatch(/whitespace-normal/);
    expect(SECTION_NAV).toMatch(/min-w-0/);
    expect(SECTION_NAV).not.toMatch(/overflow-hidden/);
    expect(PAGE).toMatch(/min-w-0/);
  });

  it("leaves the archived read-only early-return component untouched by disclosures", () => {
    const archivedStart = PAGE.indexOf("function ArchivedTimelineReadOnlyView");
    const activeStart = PAGE.indexOf("export default function PlantDetail");
    const archivedSource = PAGE.slice(archivedStart, activeStart);
    expect(archivedSource).toContain('data-testid="plant-detail-archived-timeline-readonly"');
    expect(archivedSource).not.toContain("PlantDetailDisclosureSection");
    expect(archivedSource).not.toContain("PlantDetailQuickActions");
    expect(archivedSource).not.toContain("PlantQuickLog");
  });
});
