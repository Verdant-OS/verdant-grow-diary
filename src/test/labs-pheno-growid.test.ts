/**
 * GDP-LABS-PHENO-GROWID-001
 *
 * Labs → Pheno Hunt must retain an explicit growId already present on the
 * current location. The Phase-1 static Labs manifest stays `/pheno-hunts`.
 * Soft-couple only: never invent a grow.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LABS_NAVIGATION_DESTINATIONS,
  resolveLabsNavigationDestinations,
} from "@/lib/growerNavigationRules";
import { resolveNavigationGrowId } from "@/lib/navigationGrowIdRules";
import { phenoHuntsPath } from "@/lib/routes";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const ROOT = resolve(__dirname, "../..");

describe("Labs Pheno Hunt retains growId", () => {
  it("phenoHuntsPath scopes growId the same way as plantsPath", () => {
    expect(phenoHuntsPath(GROW)).toBe(`/pheno-hunts?growId=${GROW}`);
    expect(phenoHuntsPath(null)).toBe("/pheno-hunts");
    expect(phenoHuntsPath(undefined)).toBe("/pheno-hunts");
    expect(phenoHuntsPath("")).toBe("/pheno-hunts");
  });

  it("resolveLabsNavigationDestinations rewrites only Pheno Hunt", () => {
    const resolved = resolveLabsNavigationDestinations(GROW);
    const pheno = resolved.find((item) => item.id === "phenoHunt");
    const breeding = resolved.find((item) => item.id === "breedingPrograms");

    expect(pheno?.to).toBe(`/pheno-hunts?growId=${GROW}`);
    expect(breeding?.to).toBe("/breeding");
    expect(resolved.map((item) => item.id)).toEqual(
      LABS_NAVIGATION_DESTINATIONS.map((item) => item.id),
    );

    const unscoped = resolveLabsNavigationDestinations(null);
    expect(unscoped.find((item) => item.id === "phenoHunt")?.to).toBe("/pheno-hunts");
    expect(
      resolveLabsNavigationDestinations("   ").find((item) => item.id === "phenoHunt")?.to,
    ).toBe("/pheno-hunts");
    expect(resolveLabsNavigationDestinations().find((item) => item.id === "phenoHunt")?.to).toBe(
      "/pheno-hunts",
    );
  });

  it("resolveNavigationGrowId reads path and query, and does not invent", () => {
    expect(resolveNavigationGrowId({ pathname: `/grows/${GROW}`, search: "" })).toBe(GROW);
    expect(resolveNavigationGrowId({ pathname: `/grows/${GROW}/learning`, search: "" })).toBe(GROW);
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: `?growId=${GROW}` })).toBe(
      GROW,
    );
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: `growId=${GROW}` })).toBe(
      GROW,
    );
    expect(resolveNavigationGrowId({ pathname: "/grows", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/grows/", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/plants", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: "?growId=" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: "?growId=%20" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/dashboard", search: "" })).toBeNull();
  });

  it("resolveNavigationGrowId prefers grow hub path over query growId", () => {
    const pathGrow = "grow-from-path";
    const queryGrow = "grow-from-query";
    expect(
      resolveNavigationGrowId({
        pathname: `/grows/${pathGrow}`,
        search: `?growId=${queryGrow}`,
      }),
    ).toBe(pathGrow);
  });

  it("resolveNavigationGrowId decodes encoded grow ids from the path", () => {
    const encoded = encodeURIComponent(GROW);
    expect(resolveNavigationGrowId({ pathname: `/grows/${encoded}`, search: "" })).toBe(GROW);
  });

  it("resolveLabsNavigationDestinations leaves the static manifest untouched", () => {
    const before = LABS_NAVIGATION_DESTINATIONS.map((item) => item.to);
    resolveLabsNavigationDestinations(GROW);
    expect(LABS_NAVIGATION_DESTINATIONS.map((item) => item.to)).toEqual(before);
    expect(LABS_NAVIGATION_DESTINATIONS.find((item) => item.id === "phenoHunt")?.to).toBe(
      "/pheno-hunts",
    );
  });

  it("AppSidebar and MobileNav wire Labs through resolveLabsNavigationDestinations", () => {
    const sidebar = readFileSync(resolve(ROOT, "src/components/AppSidebar.tsx"), "utf8");
    const mobile = readFileSync(resolve(ROOT, "src/components/MobileNav.tsx"), "utf8");

    expect(sidebar).toContain("resolveLabsNavigationDestinations");
    expect(sidebar).toContain("resolveNavigationGrowId");
    expect(mobile).toContain("resolveLabsNavigationDestinations");
    expect(mobile).toContain("resolveNavigationGrowId");
  });
});
