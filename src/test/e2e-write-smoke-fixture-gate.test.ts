/**
 * Write-smoke fixture gates (#570 playbook) — pure helpers + source wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertGrowAllowedForWriteSmoke,
  assertPhenoWriteFixtureEnv,
  buildE2eHuntName,
  isForbiddenRealGrowName,
  validatePhenoWriteFixtureEnv,
} from "../../e2e/lib/fixtureSafety";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const FIXTURE_ENV = {
  E2E_FIXTURE_MODE: "true",
  E2E_FIXTURE_EXPECTED_TENT_NAME: "E2E Test Tent",
  E2E_FIXTURE_EXPECTED_PLANT_NAME: "E2E Test Plant",
  allowMissingPlantUrl: true as const,
};

describe("isForbiddenRealGrowName / assertGrowAllowedForWriteSmoke", () => {
  it("blocks known real grows without E2E markers", () => {
    expect(isForbiddenRealGrowName("Project McDonald")).toBe(true);
    expect(isForbiddenRealGrowName("Starter Grow")).toBe(true);
    expect(() => assertGrowAllowedForWriteSmoke("Project McDonald")).toThrow(/denylist|#570/i);
  });

  it("allows E2E/Test-marked names even if they mention starter", () => {
    expect(isForbiddenRealGrowName("E2E Starter Grow")).toBe(false);
    expect(isForbiddenRealGrowName("E2E Test Grow")).toBe(false);
    expect(() => assertGrowAllowedForWriteSmoke("E2E Test Grow")).not.toThrow();
  });

  it("blocks unmarked grow names that are not on the denylist", () => {
    expect(() => assertGrowAllowedForWriteSmoke("Flowering Room A")).toThrow(/E2E\/Test markers/);
  });
});

describe("buildE2eHuntName", () => {
  it("prefixes E2E and a date so leftovers are greppable", () => {
    const n = buildE2eHuntName("paid-journey", new Date("2026-08-08T12:00:00Z"));
    expect(n).toBe("E2E paid-journey 2026-08-08");
    expect(n.startsWith("E2E ")).toBe(true);
  });
});

describe("validatePhenoWriteFixtureEnv", () => {
  it("requires fixture mode and E2E tent/plant names", () => {
    const ok = validatePhenoWriteFixtureEnv(FIXTURE_ENV);
    expect(ok.ok).toBe(true);
    const bad = validatePhenoWriteFixtureEnv({
      ...FIXTURE_ENV,
      E2E_FIXTURE_MODE: "false",
    });
    expect(bad.ok).toBe(false);
    expect(() =>
      assertPhenoWriteFixtureEnv({ ...FIXTURE_ENV, E2E_FIXTURE_MODE: undefined }),
    ).toThrow(/fixture env gate/i);
  });
});

describe("write-producing pheno specs wire the gate", () => {
  const specs = ["e2e/pheno-paid-journey.spec.ts", "e2e/pheno-workspace-state-integrity.spec.ts"];

  it("import assertPhenoWriteFixtureEnv, grow denylist, and buildE2eHuntName", () => {
    for (const f of specs) {
      const body = read(f);
      expect(body, f).toMatch(/assertPhenoWriteFixtureEnv/);
      expect(body, f).toMatch(/assertGrowAllowedForWriteSmoke/);
      expect(body, f).toMatch(/buildE2eHuntName/);
      // Must replace name via fill, not type/append-only.
      expect(body, f).toMatch(/ph-name-input"\)\.fill\(/);
    }
  });

  it("documents the playbook path", () => {
    const doc = read("docs/cleanup/e2e-test-data-management.md");
    expect(doc).toMatch(/#570/);
    expect(doc).toMatch(/buildE2eHuntName/);
    expect(doc).toMatch(/denylist/i);
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/e2e-test-data-management\.md/);
  });
});
