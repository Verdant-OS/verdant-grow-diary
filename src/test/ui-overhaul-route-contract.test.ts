import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

const APP_SHELL_ROUTE_FILES = [
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
