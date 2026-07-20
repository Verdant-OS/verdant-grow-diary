import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  "src/pages/PhenoHuntNew.tsx",
  "src/pages/PhenoHuntsIndex.tsx",
  "src/pages/PhenoHuntWorkspace.tsx",
  "src/pages/PhenoKeepersPage.tsx",
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
    expect(RESPONSIVE_SPEC).toContain("BROWSER_ROUTES");
    expect(RESPONSIVE_SPEC).toContain("DOCUMENTED_EXCLUDED_ROUTES");

    for (const page of UI_OVERHAUL_CHANGED_PAGES) {
      const occurrences = RESPONSIVE_SPEC.split(`"${page}"`).length - 1;
      expect(occurrences, `${page} must have one manifest entry`).toBe(1);
    }
  });

  it("checks document, main-region, and visible control bounds", () => {
    expect(RESPONSIVE_SPEC).toContain("documentScrollWidth");
    expect(RESPONSIVE_SPEC).toContain("mainScrollWidth");
    expect(RESPONSIVE_SPEC).toContain("getBoundingClientRect");
    expect(RESPONSIVE_SPEC).toContain("visibleBoundsViolations");
  });

  it("proves the viewport assertion rejects a clipped oversized descendant", () => {
    expect(RESPONSIVE_SPEC).toContain("clipped-oversized-proof");
    expect(RESPONSIVE_SPEC).toMatch(/rejects\.toThrow/);
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
