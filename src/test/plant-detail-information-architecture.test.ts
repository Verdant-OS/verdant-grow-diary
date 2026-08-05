import { existsSync, readFileSync } from "node:fs";
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

const FRESHNESS_E2E_PATH = "e2e/ai-doctor-freshness-gate.spec.ts";
const FRESHNESS_E2E = readFileSync(resolve(ROOT, FRESHNESS_E2E_PATH), "utf8");

/**
 * Test ids the mocked AI Doctor freshness e2e lane asserts POSITIVELY (must
 * render). Negative assertions in that spec (`toHaveCount(0)`) are excluded on
 * purpose — requiring them to be mountable would invert their meaning.
 *
 * This list exists because a Playwright lane cannot defend itself. Commit
 * a6972773d unmounted PlantDetailDoctorContextPreview from Plant Detail, which
 * silently orphaned PlantDetailDoctorLaunchDialog and every test id the lane
 * drove. Nothing failed for eleven days, because the lane only triggered on
 * dependency files. The two assertions below close that gap: the ids must be
 * reachable from Plant Detail's real mount graph, and the spec must still use
 * them, so neither side can drift away from the other unnoticed.
 */
const FRESHNESS_E2E_REQUIRED_TEST_IDS = [
  "plant-detail-disclosure-ai-trigger",
  "plant-detail-disclosure-ai-content",
  "plant-ai-doctor-context-panel",
  "plant-ai-doctor-context-evidence",
  "plant-ai-doctor-context-missing",
  "plant-ai-doctor-context-notice",
  "plant-ai-doctor-context-latest-snapshot",
] as const;

/** Resolve a `@/…` specifier to a real file under src/. */
function resolveAliasImport(specifier: string): string | null {
  if (!specifier.startsWith("@/")) return null;
  const base = resolve(ROOT, "src", specifier.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, resolve(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every file transitively reachable from Plant Detail through `@/components`
 * imports — i.e. everything the page can actually put on screen.
 */
function collectMountedSources(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  const sources: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, "utf8");
    sources.push(source);

    for (const match of source.matchAll(/from\s+"(@\/components\/[^"]+)"/g)) {
      const next = resolveAliasImport(match[1]);
      if (next) queue.push(next);
    }
  }
  return sources;
}

/**
 * Can this mount graph render `testId`? Handles the three shapes the repo
 * uses: a literal attribute, a template attribute
 * (`data-testid={`plant-detail-disclosure-${group}-trigger`}`), and a
 * `const SOMETHING_TEST_ID = "…"` indirection.
 */
function canRenderTestId(sources: string[], testId: string): boolean {
  for (const source of sources) {
    if (source.includes(`data-testid="${testId}"`)) return true;
    if (new RegExp(`_TEST_ID\\s*=\\s*"${testId}"`).test(source)) return true;

    for (const match of source.matchAll(/data-testid=\{`([^`]+)`\}/g)) {
      // Split on the interpolations, escape the literal chunks, and let each
      // `${…}` stand for one test-id segment.
      const pattern = match[1]
        .split(/\$\{[^}]*\}/)
        .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[a-z0-9-]+");
      if (new RegExp(`^${pattern}$`).test(testId)) return true;
    }
  }
  return false;
}

function count(source: string, token: string) {
  return source.split(token).length - 1;
}

function countComponent(source: string, component: string) {
  return source.match(new RegExp(`<${component}(?=[\\s/>])`, "g"))?.length ?? 0;
}

describe("Plant Detail information architecture", () => {
  it("mounts the three controlled disclosure groups exactly once", () => {
    expect(count(ACTIVE_PAGE, "<PlantDetailDisclosureSection")).toBe(3);
    expect(count(ACTIVE_PAGE, 'group="history"')).toBe(1);
    expect(count(ACTIVE_PAGE, 'group="harvest"')).toBe(1);
    expect(count(ACTIVE_PAGE, 'group="ai"')).toBe(1);
  });

  it("keys each disclosure subtree to the exact plant identity and group", () => {
    for (const group of ["history", "harvest", "ai"] as const) {
      const keyIndex = ACTIVE_PAGE.indexOf("key={`${plant.id}:" + group + "`}");
      const groupIndex = ACTIVE_PAGE.indexOf(`group="${group}"`, keyIndex);

      expect(keyIndex).toBeGreaterThan(-1);
      expect(groupIndex).toBeGreaterThan(keyIndex);
    }
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
      "PlantDetailAiDoctorLiveReview",
      "PlantDetailAiDoctorContextPanel",
      "PlantAiDoctorSessionsPanel",
    ]) {
      expect(countComponent(ACTIVE_PAGE, component), component).toBe(1);
    }
  });

  it("mounts one real AI review action without legacy preview launchers", () => {
    expect(countComponent(ACTIVE_PAGE, "PlantDetailAiDoctorLiveReview")).toBe(1);
    for (const component of [
      "PlantDetailDoctorContextPreview",
      "PlantDetailAiDoctorReadinessGate",
      "PlantDetailAiDoctorSafeReviewStart",
      "AiDoctorReviewResultPreview",
    ]) {
      expect(countComponent(ACTIVE_PAGE, component), component).toBe(0);
      expect(PAGE).not.toMatch(new RegExp(`import\\s+${component}\\s+from`));
    }
  });

  it("keeps every test id the freshness e2e drives reachable from the real mount graph", () => {
    const mounted = collectMountedSources(resolve(ROOT, "src/pages/PlantDetail.tsx"));

    // Sanity-check the walker itself, so a resolver regression that silently
    // returned an empty graph cannot make the real assertion vacuously pass.
    expect(mounted.length).toBeGreaterThan(1);

    const unreachable = FRESHNESS_E2E_REQUIRED_TEST_IDS.filter(
      (testId) => !canRenderTestId(mounted, testId),
    );
    expect(
      unreachable,
      `${FRESHNESS_E2E_PATH} drives test ids that nothing mounted on Plant Detail can render. ` +
        `Either the surface was unmounted (fix the page) or the lane outlived its subject (re-point the spec).`,
    ).toEqual([]);
  });

  it("keeps the freshness e2e actually driving the test ids pinned above", () => {
    const unused = FRESHNESS_E2E_REQUIRED_TEST_IDS.filter(
      (testId) => !FRESHNESS_E2E.includes(`"${testId}"`),
    );
    expect(
      unused,
      `These ids are pinned as load-bearing but ${FRESHNESS_E2E_PATH} no longer references them. ` +
        `Update the list deliberately so the mount-graph guard keeps matching the spec.`,
    ).toEqual([]);
  });

  it("keeps visible readiness content inside the Ask Doctor anchor when live review is blocked", () => {
    const anchorStart = ACTIVE_PAGE.indexOf(`id={PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`);
    const anchorEnd = ACTIVE_PAGE.indexOf("</section>", anchorStart);
    const anchorSource = ACTIVE_PAGE.slice(anchorStart, anchorEnd);

    expect(anchorStart).toBeGreaterThan(-1);
    expect(anchorEnd).toBeGreaterThan(anchorStart);
    expect(countComponent(anchorSource, "PlantDetailAiDoctorReadiness")).toBe(1);
    expect(countComponent(anchorSource, "PlantDetailAiDoctorContextReadinessMount")).toBe(1);
    expect(countComponent(anchorSource, "PlantDetailAiDoctorLiveReview")).toBe(1);
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
