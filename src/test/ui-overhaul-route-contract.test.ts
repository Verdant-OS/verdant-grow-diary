import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

const RESPONSIVE_SPEC = readSource("e2e/ui-overhaul-responsive.spec.ts");

// Production pages changed by feat(ui) commit 27f404265. The browser proof
// must account for each page exactly once as runnable or explicitly excluded.
const UI_OVERHAUL_CHANGED_PAGES = [
  "src/pages/ActionDetail.tsx",
  "src/pages/ActionQueue.tsx",
  "src/pages/AiDoctorConfidenceAudit.tsx",
  "src/pages/AiDoctorSessionDetail.tsx",
  "src/pages/AiDoctorSessionsIndex.tsx",
  "src/pages/BreedingProgramDetail.tsx",
  "src/pages/BreedingProgramNew.tsx",
  "src/pages/BreedingProgramsIndex.tsx",
  "src/pages/DailyCheck.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/EcowittIngestAudit.tsx",
  "src/pages/EcowittLiveBringup.tsx",
  "src/pages/GrowDetail.tsx",
  "src/pages/GrowerInvite.tsx",
  "src/pages/Grows.tsx",
  "src/pages/HealthCheck.tsx",
  "src/pages/OperatorAiDoctorPhase1.tsx",
  "src/pages/OperatorBillingEntitlementResolutionAudit.tsx",
  "src/pages/OperatorBillingSubscriptionUpdateAudit.tsx",
  "src/pages/OperatorEcowittTentPreview.tsx",
  "src/pages/OperatorPaddleProcessingAudit.tsx",
  "src/pages/OperatorSubscriberGrowth.tsx",
  "src/pages/PlantDetail.tsx",
  "src/pages/PhenoHuntNew.tsx",
  "src/pages/PhenoHuntsIndex.tsx",
  "src/pages/PhenoHuntWorkspace.tsx",
  "src/pages/PhenoKeepersPage.tsx",
  "src/pages/QuickLogStarter.tsx",
  "src/pages/TentDetail.tsx",
  "src/pages/Tents.tsx",
  "src/pages/Timeline.tsx",
] as const;

const APP_SHELL_ROUTE_FILES = [
  "src/pages/BreedingProgramDetail.tsx",
  "src/pages/PhenoHuntWorkspace.tsx",
  "src/pages/PhenoKeepersPage.tsx",
  "src/pages/GrowerInvite.tsx",
  "src/pages/HealthCheck.tsx",
  "src/pages/AiDoctorConfidenceAudit.tsx",
  "src/pages/EcowittLiveBringup.tsx",
  "src/pages/EcowittIngestAudit.tsx",
  "src/pages/OperatorAiDoctorPhase1.tsx",
  "src/pages/OperatorBillingSubscriptionUpdateAudit.tsx",
  "src/pages/OperatorBillingEntitlementResolutionAudit.tsx",
  "src/pages/OperatorPaddleProcessingAudit.tsx",
  "src/pages/OperatorEcowittTentPreview.tsx",
  "src/pages/OperatorSubscriberGrowth.tsx",
] as const;

describe("Verdant UI overhaul route contract", () => {
  it("accounts for every redesigned production page exactly once in the browser manifest", () => {
    expect(RESPONSIVE_SPEC).toContain("const CORE_CHANGED_PAGES");
    expect(RESPONSIVE_SPEC).toContain("BROWSER_ROUTES");
    expect(RESPONSIVE_SPEC).toContain("DOCUMENTED_EXCLUDED_ROUTES");

    const browserRoutesBlock = RESPONSIVE_SPEC.slice(
      RESPONSIVE_SPEC.indexOf("const BROWSER_ROUTES"),
      RESPONSIVE_SPEC.indexOf("const DOCUMENTED_EXCLUDED_ROUTES"),
    );
    expect(browserRoutesBlock.match(/sourcePage:\s*CORE_CHANGED_PAGES\./g)).toHaveLength(6);

    const coverageOracle = RESPONSIVE_SPEC.slice(
      RESPONSIVE_SPEC.indexOf(
        'test("accounts for every redesigned production page in browser or documented exclusions"',
      ),
      RESPONSIVE_SPEC.indexOf('test("rejects clipped content'),
    );
    expect(coverageOracle).toContain("Object.values(CORE_CHANGED_PAGES)");
    expect(coverageOracle).toContain("Object.values(REDESIGNED_PRODUCTION_PAGES)");

    for (const page of UI_OVERHAUL_CHANGED_PAGES) {
      const occurrences = RESPONSIVE_SPEC.split(`"${page}"`).length - 1;
      expect(occurrences, `${page} must have one manifest entry`).toBe(1);
    }
  });

  it("checks document, main-region, and visible control bounds", () => {
    const progress = readSource("src/components/ui/progress.tsx");

    expect(RESPONSIVE_SPEC).toContain("documentScrollWidth");
    expect(RESPONSIVE_SPEC).toContain("mainScrollWidth");
    expect(RESPONSIVE_SPEC).toContain("getBoundingClientRect");
    expect(RESPONSIVE_SPEC).toContain("visibleBoundsViolations");
    expect(RESPONSIVE_SPEC).toMatch(/expect\(\s*snapshot\.layoutBoundsViolations/);
    expect(RESPONSIVE_SPEC).toMatch(/expect\(\s*snapshot\.intrinsicWidthViolations/);
    expect(progress).toMatch(/<ProgressPrimitive\.Indicator[\s\S]*?aria-hidden="true"/);
  });

  it("proves the viewport assertion rejects clipped non-semantic nested content", () => {
    expect(RESPONSIVE_SPEC).toContain("clipped-oversized-proof");
    expect(RESPONSIVE_SPEC).toMatch(/overflow-x:\s*(?:clip|hidden)/);
    expect(RESPONSIVE_SPEC).toMatch(/<p[^>]*style="[^"]*width:\s*640px/);
    expect(RESPONSIVE_SPEC).toMatch(/rejects\.toThrow/);
  });

  it("validates every horizontal-scroller exemption before using it", () => {
    expect(RESPONSIVE_SPEC).toContain("scrollerValidationViolations");
    expect(RESPONSIVE_SPEC).toContain("validatedScrollerElements");
    expect(RESPONSIVE_SPEC).toMatch(/\["auto",\s*"scroll"\]/);
    expect(RESPONSIVE_SPEC).toMatch(/snapshot\.scrollerValidationViolations/);
    expect(
      RESPONSIVE_SPEC.split('"timeline-stage-progression-scroll"').length - 1,
      "the Timeline-only scroller must not be allowlisted on Plant Detail",
    ).toBe(1);
  });

  it("ties runnable and excluded route patterns to the canonical manifest", () => {
    const declaredPatterns = [...RESPONSIVE_SPEC.matchAll(/routePattern:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    const canonicalPatterns = new Set(APP_ROUTES.map((route) => route.path));

    expect(declaredPatterns).toHaveLength(31);
    for (const routePattern of declaredPatterns) {
      expect(canonicalPatterns.has(routePattern), `${routePattern} must exist in APP_ROUTES`).toBe(
        true,
      );
    }
    expect(RESPONSIVE_SPEC).toMatch(/import\s*\{\s*APP_ROUTES\s*\}/);
  });

  it("requires concrete static-proof files and route-specific readiness before measurement", () => {
    const browserRoutesBlock = RESPONSIVE_SPEC.slice(
      RESPONSIVE_SPEC.indexOf("const BROWSER_ROUTES"),
      RESPONSIVE_SPEC.indexOf("const DOCUMENTED_EXCLUDED_ROUTES"),
    );
    const exclusionsBlock = RESPONSIVE_SPEC.slice(
      RESPONSIVE_SPEC.indexOf("const DOCUMENTED_EXCLUDED_ROUTES"),
      RESPONSIVE_SPEC.indexOf("const CRITICAL_OPERATING_LOOP_ROUTES"),
    );

    expect(browserRoutesBlock.match(/readySelector:/g)).toHaveLength(19);
    expect(browserRoutesBlock.match(/routePattern:/g)).toHaveLength(19);
    expect(exclusionsBlock.match(/staticProof:\s*\{/g)).toHaveLength(12);
    expect(exclusionsBlock.match(/file:/g)).toHaveLength(12);
    expect(exclusionsBlock.match(/contains:/g)).toHaveLength(12);
    expect(RESPONSIVE_SPEC).toContain("waitForStableLayout");
    expect(RESPONSIVE_SPEC).toMatch(/route\.readySelector/);

    const stableLayoutBlock = RESPONSIVE_SPEC.slice(
      RESPONSIVE_SPEC.indexOf("async function waitForStableLayout"),
      RESPONSIVE_SPEC.indexOf("async function assertViewportFit"),
    );
    const fontMarkerIndex = stableLayoutBlock.indexOf("FONT_FIXTURE_PROPERTY");
    const fontReadyIndex = stableLayoutBlock.indexOf("document.fonts.ready");
    const signatureIndex = stableLayoutBlock.indexOf("const signature");

    expect(RESPONSIVE_SPEC).toContain('page.route("https://fonts.googleapis.com/**"');
    expect(RESPONSIVE_SPEC).toContain('page.route("https://fonts.gstatic.com/**"');
    expect(fontMarkerIndex, "the fixture stylesheet marker must settle first").toBeGreaterThan(-1);
    expect(fontReadyIndex, "document.fonts.ready must settle before sampling").toBeGreaterThan(
      fontMarkerIndex,
    );
    expect(
      signatureIndex,
      "layout signatures must be sampled after font settlement",
    ).toBeGreaterThan(fontReadyIndex);
  });

  it("connects the skip link to the single application main region", () => {
    const shell = readSource("src/components/AppShell.tsx");

    expect(shell).toContain('href="#main-content"');
    expect(shell).toMatch(/<main[\s\S]*?id="main-content"/);
    expect(shell.match(/<main\b/g)).toHaveLength(1);
  });

  it("does not nest additional main landmarks in AppShell routes", () => {
    for (const file of APP_SHELL_ROUTE_FILES) {
      const source = readSource(file);
      expect(source).not.toMatch(/<\/?main\b/);
    }
  });

  it("keeps pheno workflow roots as named sections", () => {
    for (const file of ["src/pages/PhenoHuntWorkspace.tsx", "src/pages/PhenoKeepersPage.tsx"]) {
      expect(readSource(file)).toMatch(/<section\b[\s\S]*?aria-(?:label|labelledby)=/);
    }
  });

  it("keeps Timeline on the shared header and a deliberate narrow-screen stage rail", () => {
    const timeline = readSource("src/pages/Timeline.tsx");

    expect(timeline).toMatch(/import PageHeader from ["']@\/components\/PageHeader["']/);
    expect(timeline).toContain("<PageHeader");
    expect(timeline).toContain('data-testid="timeline-stage-progression-scroll"');
    expect(timeline).toMatch(/overflow-x-auto/);
    expect(timeline).toMatch(/min-w-\[34rem\]/);
    expect(timeline).toMatch(/aria-current=\{isCurrent \? ["']step["'] : undefined\}/);
  });
});
