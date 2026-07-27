import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { matchRoutes } from "react-router-dom";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APP = read("src/App.tsx");
const SEO_CONTENT = read("src/constants/verdantSeoContent.ts");
const MOBILE_ROUTE_SPEC = read("e2e/auth-route-protection-mobile.spec.ts");

const RETIRED_CUSTOMER_ROUTES = ["/customer/:shareId", "/customer/:shareId/cannabis-care"] as const;

describe("retired unbacked Customer Mode routes", () => {
  it("does not load or mount the dormant Customer Mode pages", () => {
    expect(APP).not.toMatch(/import\(\s*["']\.\/pages\/CustomerModeGuide["']\s*\)/);
    expect(APP).not.toMatch(/import\(\s*["']\.\/pages\/CustomerModeCannabisCareFaq["']\s*\)/);

    for (const path of RETIRED_CUSTOMER_ROUTES) {
      expect(APP).not.toContain(`path="${path}"`);
    }
  });

  it("removes both fake-valid paths from the route manifest", () => {
    for (const path of RETIRED_CUSTOMER_ROUTES) {
      expect(APP_ROUTES.find((route) => route.path === path)).toBeUndefined();
      expect(MOBILE_ROUTE_SPEC).not.toContain(`"${path}"`);
    }
  });

  it.each(["/customer/invented-share", "/customer/invented-share/cannabis-care"])(
    "%s reaches the catch-all Not Found route",
    (path) => {
      expect(APP).toContain('<Route path="*" element={<NotFound />} />');

      const matches = matchRoutes(
        APP_ROUTES.map((route) => ({
          path: route.path,
          id: route.path === "*" ? "not-found" : route.path,
        })),
        path,
      );

      expect(matches?.at(-1)?.route.id).toBe("not-found");
    },
  );

  it("removes the stable fake share ID from SEO constants", () => {
    expect(SEO_CONTENT).not.toContain("VERDANT_CUSTOMER_GUIDE_PATH");
    expect(SEO_CONTENT).not.toContain('"/customer/guide"');
  });
});
