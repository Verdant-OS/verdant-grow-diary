import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ported from draft #2239 (the one case not already on base). When a census route
 * redirects before its landing page (signed-in /onboarding goes to "/" since
 * #2045), the spec must settle reads on the final path and skip the link audit
 * for the route it never rendered. The branch lives inline in a Playwright spec
 * that cannot be imported under Vitest, so this is a presence fence over the spec
 * source: it proves the construct exists, it does not verify configuration. The
 * resolved redirect values are pinned in
 * src/test/core-link-form-census-onboarding-redirect.test.ts.
 */
const CENSUS_SPEC_SOURCE = readFileSync(
  resolve(process.cwd(), "e2e/core-link-form-census.spec.ts"),
  "utf8",
);

describe("core census redirected-route link audit skip", () => {
  it("skips link audits on routes that redirect before the landing page", () => {
    expect(CENSUS_SPEC_SOURCE).toMatch(/const redirected = finalPath !==/);
    expect(CENSUS_SPEC_SOURCE).toMatch(/redirected \? \[\] : await visibleLinkAudits/);
    expect(CENSUS_SPEC_SOURCE).toMatch(/redirected \? finalPath : route\.path/);
  });
});
