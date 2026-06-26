import { describe, expect, it } from "vitest";
import {
  classifyStabilizationPrFiles,
  isAllowedStabilizationPath,
  isBlockedStabilizationPath,
} from "../../scripts/verify-stabilization-pr-scope.mjs";

describe("isAllowedStabilizationPath", () => {
  it("allows harness files", () => {
    expect(isAllowedStabilizationPath("src/test/setup.ts")).toBe(true);
    expect(isAllowedStabilizationPath("vitest.config.ts")).toBe(true);
    expect(isAllowedStabilizationPath("scripts/sensor-safety-check.mjs")).toBe(
      true,
    );
    expect(isAllowedStabilizationPath("tests/foo.spec.ts")).toBe(true);
    expect(isAllowedStabilizationPath("package.json")).toBe(true);
    expect(isAllowedStabilizationPath("bun.lockb")).toBe(true);
    expect(isAllowedStabilizationPath("playwright.config.ts")).toBe(true);
  });

  it("blocks docs by default and allows with allowDocs", () => {
    expect(isAllowedStabilizationPath("docs/foo.md")).toBe(false);
    expect(
      isAllowedStabilizationPath("docs/foo.md", { allowDocs: true }),
    ).toBe(true);
  });
});

describe("isBlockedStabilizationPath", () => {
  const blocked = [
    "src/lib/genetics/foo.ts",
    "src/components/genetics/Foo.tsx",
    "supabase/functions/_shared/genetics/foo.ts",
    "supabase/functions/create-breeding-suggestions/index.ts",
    "supabase/migrations/20260626000000_test.sql",
    "src/lib/harvestWatchRules.ts",
    "src/components/PlantDetailHarvestWatchCard.tsx",
    "src/lib/harvestCureRules.ts",
    "src/constants/groveBagCureFields.ts",
    "src/lib/groveBagAirflowRules.ts",
    "src/lib/harvestEvidenceReportRules.ts",
    "src/components/HarvestEvidenceReportPanel.tsx",
    "src/hooks/useHarvestEvidenceReportData.ts",
    "src/pages/PlantDetail.tsx",
    "src/lib/verdantGeneticsXlsxAdapter.ts",
    "src/lib/somethingDrybackThing.ts",
    "src/lib/breedingAdvisor.ts",
  ];
  it.each(blocked)("blocks %s", (p) => {
    expect(isBlockedStabilizationPath(p)).toBe(true);
    expect(isAllowedStabilizationPath(p)).toBe(false);
    expect(isAllowedStabilizationPath(p, { allowDocs: true })).toBe(false);
  });

  it("blocks generic product components", () => {
    expect(
      isAllowedStabilizationPath("src/components/SomeProductComponent.tsx"),
    ).toBe(false);
  });

  it("does not self-block the guard's own test file or script", () => {
    expect(
      isBlockedStabilizationPath("src/test/verify-stabilization-pr-scope.test.ts"),
    ).toBe(false);
    expect(
      isBlockedStabilizationPath("scripts/verify-stabilization-pr-scope.mjs"),
    ).toBe(false);
  });
});

describe("classifyStabilizationPrFiles", () => {
  it("returns pass when only harness files are present", () => {
    const result = classifyStabilizationPrFiles([
      "src/test/setup.ts",
      "vitest.config.ts",
      "scripts/sensor-safety-check.mjs",
    ]);
    expect(result.verdict).toBe("pass");
    expect(result.blocked).toEqual([]);
    expect(result.allowed.length).toBe(3);
  });

  it("emits STOP-SHIP verdict when any blocked path is present", () => {
    const result = classifyStabilizationPrFiles([
      "src/test/setup.ts",
      "src/lib/harvestWatchRules.ts",
      "supabase/migrations/20260626_x.sql",
    ]);
    expect(result.verdict).toBe("stop-ship");
    expect(result.blocked).toEqual(
      expect.arrayContaining([
        "src/lib/harvestWatchRules.ts",
        "supabase/migrations/20260626_x.sql",
      ]),
    );
    expect(result.allowed).toEqual(["src/test/setup.ts"]);
  });

  it("honors allowDocs option", () => {
    const passNoDocs = classifyStabilizationPrFiles(["docs/foo.md"]);
    expect(passNoDocs.verdict).toBe("stop-ship");
    const passWithDocs = classifyStabilizationPrFiles(["docs/foo.md"], {
      allowDocs: true,
    });
    expect(passWithDocs.verdict).toBe("pass");
  });
});

describe("classifyStabilizationPrFiles — staged-mode file lists", () => {
  it("allows a staged harness-only set", () => {
    const r = classifyStabilizationPrFiles([
      "src/test/setup.ts",
      "vitest.config.ts",
      "scripts/sensor-safety-check.mjs",
    ]);
    expect(r.verdict).toBe("pass");
    expect(r.blocked).toEqual([]);
  });

  it("blocks a staged set that mixes harness + product page", () => {
    const r = classifyStabilizationPrFiles([
      "src/test/setup.ts",
      "src/pages/PlantDetail.tsx",
    ]);
    expect(r.verdict).toBe("stop-ship");
    expect(r.allowed).toEqual(["src/test/setup.ts"]);
    expect(r.blocked).toEqual(["src/pages/PlantDetail.tsx"]);
  });

  it("blocks a staged Supabase migration even when mixed with harness", () => {
    const r = classifyStabilizationPrFiles([
      "src/test/setup.ts",
      "supabase/migrations/20260626000000_test.sql",
    ]);
    expect(r.verdict).toBe("stop-ship");
    expect(r.blocked).toEqual([
      "supabase/migrations/20260626000000_test.sql",
    ]);
  });

  it("blocks a staged harvest/cure file", () => {
    const r = classifyStabilizationPrFiles(["src/lib/harvestCureRules.ts"]);
    expect(r.verdict).toBe("stop-ship");
    expect(r.blocked).toEqual(["src/lib/harvestCureRules.ts"]);
  });

  it("blocks a staged genetics file", () => {
    const r = classifyStabilizationPrFiles(["src/lib/genetics/foo.ts"]);
    expect(r.verdict).toBe("stop-ship");
    expect(r.blocked).toEqual(["src/lib/genetics/foo.ts"]);
  });

  it("allows staged docs only with allowDocs: true", () => {
    const blocked = classifyStabilizationPrFiles([
      "docs/test-stabilization-pr-runbook.md",
    ]);
    expect(blocked.verdict).toBe("stop-ship");
    const passed = classifyStabilizationPrFiles(
      ["docs/test-stabilization-pr-runbook.md"],
      { allowDocs: true },
    );
    expect(passed.verdict).toBe("pass");
  });
});

describe("classifyStabilizationPrFiles — lockfile allowlist", () => {
  it.each([
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ])("allows lockfile %s on its own", (lock) => {
    const r = classifyStabilizationPrFiles([lock]);
    expect(r.verdict).toBe("pass");
    expect(r.allowed).toEqual([lock]);
  });

  it("blocks overall when a product file rides along with a lockfile", () => {
    const r = classifyStabilizationPrFiles([
      "package-lock.json",
      "src/lib/harvestWatchRules.ts",
    ]);
    expect(r.verdict).toBe("stop-ship");
    expect(r.allowed).toEqual(["package-lock.json"]);
    expect(r.blocked).toEqual(["src/lib/harvestWatchRules.ts"]);
  });
});

