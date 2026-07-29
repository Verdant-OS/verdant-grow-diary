/**
 * Alias-resolution smoke test.
 *
 * Purpose: fail loudly and cheaply if the `@/*` -> `./src/*` path alias
 * stops resolving in ANY of the three places that must agree:
 *
 *   1. `tsconfig.json` `compilerOptions.paths` (tsc / tsgo)
 *   2. `vite.config.ts` `resolve.alias`      (dev server + production build)
 *   3. `vitest` resolution                    (this test actually running)
 *
 * A drifted alias currently surfaces as a wall of unrelated module-not-found
 * noise deep inside a feature suite. This file turns it into one obvious
 * failure with a name that says exactly what broke.
 *
 * Scope is intentionally narrow: it imports the `@/constants` barrel and a
 * couple of deep `@/constants/*` modules, then asserts the bindings arrived
 * as real values. It does NOT assert on the *content* of those constants —
 * that belongs to their own suites, and duplicating it here would make this
 * file fail for reasons that have nothing to do with the alias.
 */

import { describe, expect, it } from "vitest";

// 1. Barrel import through the alias.
import * as constantsBarrel from "@/constants";

// 2. Named imports through the barrel (re-export chain must survive too:
//    verdantCultivars re-exports strainReferenceLibrary).
import { CULTIVAR_GUIDE_SECTION_KEYS, VERDANT_KEYWORD_CLUSTERS } from "@/constants";

// 3. Deep module imports through the alias, bypassing the barrel.
import { GROW_STAGES, normalizeGrowStage } from "@/constants/growStages";
import { PRICING } from "@/constants/pricing";

describe("@/ alias resolution smoke test", () => {
  it("resolves the @/constants barrel to a real module namespace", () => {
    expect(constantsBarrel).toBeTypeOf("object");
    expect(constantsBarrel).not.toBeNull();
    // A broken alias that silently resolves to an empty stub is still broken.
    expect(Object.keys(constantsBarrel).length).toBeGreaterThan(0);
  });

  it("resolves named exports through the barrel", () => {
    expect(VERDANT_KEYWORD_CLUSTERS).toBeTypeOf("object");
    expect(VERDANT_KEYWORD_CLUSTERS).toBeDefined();
  });

  it("resolves exports through a nested re-export chain in the barrel", () => {
    // verdantCultivars.ts is `export * from "./strainReferenceLibrary"`, so
    // this proves transitive re-exports survive alias resolution.
    expect(Array.isArray(CULTIVAR_GUIDE_SECTION_KEYS)).toBe(true);
    expect(CULTIVAR_GUIDE_SECTION_KEYS.length).toBeGreaterThan(0);
  });

  it("resolves deep @/constants/* module paths, not just the barrel", () => {
    expect(GROW_STAGES).toBeTypeOf("object");
    expect(normalizeGrowStage).toBeTypeOf("function");
    expect(PRICING).toBeTypeOf("object");
  });

  it("resolves an aliased module dynamically at runtime", async () => {
    // Static imports are rewritten at transform time; a dynamic specifier
    // exercises the resolver on a separate code path.
    const mod = await import("@/constants/growStages");
    expect(mod.GROW_STAGES).toBe(GROW_STAGES);
  });

  it("resolves the alias to the real src tree, not a catch-all stub", () => {
    // Guards against a misconfigured alias that maps everything to one
    // module — which would make every assertion above pass for the wrong
    // reason. Two distinct deep paths must yield two distinct namespaces.
    expect(GROW_STAGES).not.toBe(PRICING);
    expect(Object.keys(GROW_STAGES)).not.toEqual(Object.keys(PRICING));
  });
});
