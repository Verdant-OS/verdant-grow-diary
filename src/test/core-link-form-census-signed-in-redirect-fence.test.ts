import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  SIGNED_IN_FIXTURE_REDIRECTS,
  expectedCensusNavigationPath,
} from "../../e2e/lib/coreLinkFormCensus";

const CENSUS_SPEC_SOURCE = readFileSync(
  resolve(process.cwd(), "e2e/core-link-form-census.spec.ts"),
  "utf8",
);

describe("core census signed-in redirect fences", () => {
  it("keeps fixture redirect map aligned with authenticated census route contracts", () => {
    for (const [path, landingPathname] of Object.entries(SIGNED_IN_FIXTURE_REDIRECTS)) {
      const route = AUTHENTICATED_CORE_CENSUS_ROUTES.find((entry) => entry.path === path);
      expect(route, `missing census route for signed-in redirect ${path}`).toBeDefined();
      expect(
        route && "expectedPathname" in route ? route.expectedPathname : undefined,
        `${path} redirect target`,
      ).toBe(landingPathname);
      expect(expectedCensusNavigationPath(path, APP_ROUTES, true)).toBe(landingPathname);
    }
  });

  it("skips link audits on routes that redirect before the landing page (#2045 /onboarding)", () => {
    expect(CENSUS_SPEC_SOURCE).toMatch(/const redirected = finalPath !==/);
    expect(CENSUS_SPEC_SOURCE).toMatch(/redirected \? \[\] : await visibleLinkAudits/);
    expect(CENSUS_SPEC_SOURCE).toMatch(/redirected \? finalPath : route\.path/);
  });
});
