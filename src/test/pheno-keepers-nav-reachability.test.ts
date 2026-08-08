/**
 * #585 — Paid keepers page must be reachable from grower UI navigation.
 *
 * Regression: /pheno-hunts/:id/keepers was mounted and Pro-gated but no
 * in-app Link pointed at it, so paying growers had to type the URL.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  phenoHuntComparePath,
  phenoHuntKeepersPath,
  phenoHuntShowcasePath,
  phenoHuntWorkspacePath,
} from "@/lib/routes";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("pheno keepers nav reachability (#585)", () => {
  it("builds encoded keepers / workspace / compare / showcase paths", () => {
    expect(phenoHuntKeepersPath("hunt/1")).toBe("/pheno-hunts/hunt%2F1/keepers");
    expect(phenoHuntWorkspacePath("abc")).toBe("/pheno-hunts/abc/workspace");
    expect(phenoHuntComparePath("abc")).toBe("/pheno-hunts/abc/compare");
    expect(phenoHuntShowcasePath("abc")).toBe("/pheno-hunts/abc/showcase");
  });

  it("workspace page links to keepers via the shared path helper", () => {
    const src = read("src/pages/PhenoHuntWorkspace.tsx");
    expect(src).toMatch(/phenoHuntKeepersPath/);
    expect(src).toMatch(/data-testid="pheno-workspace-keepers-link"/);
  });

  it("keepers page links back to the workspace via the shared path helper", () => {
    const src = read("src/pages/PhenoKeepersPage.tsx");
    expect(src).toMatch(/phenoHuntWorkspacePath/);
    expect(src).toMatch(/data-testid="pheno-keepers-workspace-link"/);
    // No raw hardcoded showcase path — use the helper.
    expect(src).not.toMatch(/to=\{`\/pheno-hunts\/\$\{id\}\/showcase`\}/);
  });

  it("routes.ts exports keepers path next to workspace", () => {
    const src = read("src/lib/routes.ts");
    expect(src).toMatch(/export const phenoHuntKeepersPath/);
    expect(src).toMatch(/export const phenoHuntWorkspacePath/);
  });
});
