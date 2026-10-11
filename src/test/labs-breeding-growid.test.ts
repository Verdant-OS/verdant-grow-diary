/**
 * GDP-LABS-BREEDING-GROWID-001
 *
 * Labs → Breeding Programs must retain an explicit growId already present
 * on the current location. The Phase-1 static Labs manifest stays `/breeding`.
 * Soft-couple only: never invent a grow. Soft #1601 Pheno Hunt remains scoped.
 */
import { describe, expect, it } from "vitest";

import {
  LABS_NAVIGATION_DESTINATIONS,
  resolveLabsNavigationDestinations,
} from "@/lib/growerNavigationRules";
import { resolveNavigationGrowId } from "@/lib/navigationGrowIdRules";
import { breedingProgramsPath } from "@/lib/routes";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const STATIC_LABS_PATHS = {
  lineageRepair: "/grow-lineage",
  agentIntegrations: "/settings/agent-integrations",
  aiSessions: "/doctor/sessions",
  genetics: "/genetics",
} as const;

describe("Labs Breeding Programs retains growId", () => {
  it("breedingProgramsPath scopes growId the same way as plantsPath", () => {
    expect(breedingProgramsPath(GROW)).toBe(`/breeding?growId=${GROW}`);
    expect(breedingProgramsPath(null)).toBe("/breeding");
    expect(breedingProgramsPath(undefined)).toBe("/breeding");
    expect(breedingProgramsPath("")).toBe("/breeding");
  });

  it("resolveLabsNavigationDestinations rewrites Breeding Programs and Pheno Hunt", () => {
    const resolved = resolveLabsNavigationDestinations(GROW);
    const byId = Object.fromEntries(resolved.map((item) => [item.id, item.to]));

    expect(byId.breedingPrograms).toBe(`/breeding?growId=${GROW}`);
    expect(byId.phenoHunt).toBe(`/pheno-hunts?growId=${GROW}`);
    expect(byId.lineageRepair).toBe(STATIC_LABS_PATHS.lineageRepair);
    expect(byId.agentIntegrations).toBe(STATIC_LABS_PATHS.agentIntegrations);
    expect(byId.aiSessions).toBe(STATIC_LABS_PATHS.aiSessions);
    expect(byId.genetics).toBe(STATIC_LABS_PATHS.genetics);
    expect(resolved.map((item) => item.id)).toEqual(
      LABS_NAVIGATION_DESTINATIONS.map((item) => item.id),
    );
  });

  it("fail-closed without growId stays on static /breeding", () => {
    const unscoped = resolveLabsNavigationDestinations(null);
    expect(unscoped.find((item) => item.id === "breedingPrograms")?.to).toBe("/breeding");
    expect(
      resolveLabsNavigationDestinations("   ").find((item) => item.id === "breedingPrograms")?.to,
    ).toBe("/breeding");
    expect(
      resolveLabsNavigationDestinations().find((item) => item.id === "breedingPrograms")?.to,
    ).toBe("/breeding");
    expect(unscoped.find((item) => item.id === "phenoHunt")?.to).toBe("/pheno-hunts");
  });

  it("keeps the Phase-1 static manifest unscoped for Breeding Programs", () => {
    const breeding = LABS_NAVIGATION_DESTINATIONS.find((item) => item.id === "breedingPrograms");
    expect(breeding?.to).toBe("/breeding");
    expect(breeding?.label).toBe("Breeding Programs");
  });

  it("resolveNavigationGrowId reads growId from /breeding and trims whitespace", () => {
    expect(resolveNavigationGrowId({ pathname: "/breeding", search: `?growId=${GROW}` })).toBe(
      GROW,
    );
    expect(resolveNavigationGrowId({ pathname: "/breeding", search: `growId=${GROW}` })).toBe(GROW);
    expect(resolveNavigationGrowId({ pathname: "/breeding", search: "?growId=" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/breeding", search: "?growId=%20" })).toBeNull();
  });

  it("round-trips location growId into scoped Labs Breeding Programs links", () => {
    const growId = resolveNavigationGrowId({
      pathname: `/grows/${GROW}/learning`,
      search: "",
    });
    const breeding = resolveLabsNavigationDestinations(growId).find(
      (item) => item.id === "breedingPrograms",
    );

    expect(breeding?.to).toBe(`/breeding?growId=${GROW}`);
    expect(
      resolveLabsNavigationDestinations(`  ${GROW}  `).find(
        (item) => item.id === "breedingPrograms",
      )?.to,
    ).toBe(`/breeding?growId=${GROW}`);
  });
});
