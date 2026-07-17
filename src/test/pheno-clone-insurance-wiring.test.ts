/**
 * Clone-insurance gate — static wiring contracts.
 *
 * Pins the seams so the gate cannot silently unwire:
 *  - the workspace hook loads clone rows via the canonical service and
 *    exposes clonedPlantIds (keeper -> sourcePlantId mapping);
 *  - the workspace page builds the pure summary, renders the banner
 *    testids, and threads the clone signal into evidence readiness
 *    (populating the previously-dormant cloneReadinessRecorded goal);
 *  - the suggest-only caveat renders wherever the banner does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const HOOK = readFileSync(
  path.resolve(__dirname, "../hooks/usePhenoHuntWorkspace.ts"),
  "utf8",
);
const PAGE = readFileSync(
  path.resolve(__dirname, "../pages/PhenoHuntWorkspace.tsx"),
  "utf8",
);

describe("hook — clonedPlantIds", () => {
  it("loads clones through the canonical keepers service", () => {
    expect(HOOK).toMatch(/listClonesForKeepers/);
    expect(HOOK).toMatch(/from "@\/lib\/phenoKeepersService"/);
  });

  it("maps keeper clones to source-plant ids and exposes the set", () => {
    expect(HOOK).toMatch(/clonedPlantIds: Set<string>/);
    expect(HOOK).toMatch(/clonedKeeperIds\.has\(k\.id\)/);
    expect(HOOK).toMatch(/setClonedPlantIds\(/);
  });
});

describe("workspace page — banner + readiness threading", () => {
  it("builds the pure clone-insurance summary from loaded candidates", () => {
    expect(PAGE).toMatch(/from "@\/lib\/phenoCloneInsuranceRules"/);
    expect(PAGE).toMatch(/summarizeCloneInsurance\(/);
    expect(PAGE).toMatch(/hasPreservedClone: ws\.clonedPlantIds\.has\(c\.candidateId\)/);
  });

  it("renders the banner only when actionable, with its testids and caveat", () => {
    expect(PAGE).toMatch(/cloneInsurance\.hasActionable/);
    expect(PAGE).toContain('data-testid="pheno-clone-insurance-banner"');
    expect(PAGE).toContain('data-testid="pheno-clone-insurance-summary"');
    expect(PAGE).toMatch(/data-testid=\{`pheno-clone-insurance-item-\$\{e\.candidateId\}`\}/);
    expect(PAGE).toMatch(/CLONE_INSURANCE_CAVEAT/);
  });

  it("threads the clone signal into evidence readiness (cloneReadinessRecorded)", () => {
    expect(PAGE).toMatch(/cloneReadinessRecorded: cloneInsured/);
    expect(PAGE).toMatch(/cloneInsured: boolean/);
    expect(PAGE).toMatch(/cloneInsured=\{ws\.clonedPlantIds\.has\(c\.candidateId\)\}/);
    // Both hunt-level readiness computations pass the clone signal too.
    const threaded = PAGE.match(/ws\.clonedPlantIds\.has\(c\.candidateId\),/g) ?? [];
    expect(threaded.length).toBeGreaterThanOrEqual(2);
  });

  it("stays suggestion-only: the banner region never writes or acts", () => {
    const bannerStart = PAGE.indexOf('data-testid="pheno-clone-insurance-banner"');
    expect(bannerStart).toBeGreaterThan(0);
    const bannerRegion = PAGE.slice(bannerStart, bannerStart + 2200);
    expect(bannerRegion).not.toMatch(/onClick|\.insert\(|\.update\(|\.rpc\(|functions\.invoke/);
  });
});
