/**
 * /welcome now 308s to /, so the public census audits the canonical home
 * instead. Without this row the signed-out landing page's links and forms
 * would leave the census entirely.
 */
import { describe, expect, it } from "vitest";
import {
  PUBLIC_CORE_CENSUS_BATCHES,
  PUBLIC_CORE_CENSUS_ROUTES,
} from "../../e2e/lib/coreLinkFormCensus";

describe("public census covers the canonical home", () => {
  it("audits / and no longer lists the /welcome alias", () => {
    const home = PUBLIC_CORE_CENSUS_ROUTES.find((route) => route.path === "/");
    expect(home?.fieldPolicy).toBe("audit-only");
    expect(PUBLIC_CORE_CENSUS_ROUTES.map((route): string => route.path)).not.toContain("/welcome");
  });

  it("schedules / in exactly one batch", () => {
    const hits = PUBLIC_CORE_CENSUS_BATCHES.flat().filter((route) => route.path === "/");
    expect(hits).toHaveLength(1);
  });
});
