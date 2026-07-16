import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import { buildCultivarStaticRouteManifest } from "@/lib/build/cultivarStaticRouteManifest";

describe("cultivar static route manifest", () => {
  const routes = buildCultivarStaticRouteManifest();

  it("emits an index/detail document and a noindex legacy fallback for each", () => {
    expect(routes).toHaveLength(2 + VERDANT_CULTIVARS.length * 2);
    expect(new Set(routes.map((route) => route.routePath)).size).toBe(routes.length);
    expect(new Set(routes.map((route) => route.fileName)).size).toBe(routes.length);
  });

  it("keeps canonical cultivar documents indexable with complete PNG metadata", () => {
    for (const route of routes.filter((candidate) => !candidate.legacyRedirect)) {
      expect(route.routePath).toMatch(/^\/cultivars(?:\/|$)/);
      expect(route.metadata.url).toBe(`https://verdantgrowdiary.com${route.routePath}`);
      expect(route.metadata.robots).toBe("index, follow");
      expect(route.metadata.image).toMatch(
        /^https:\/\/verdantgrowdiary\.com\/og\/cultivars\/[a-z0-9-]+\.png$/,
      );
      expect(route.metadata.imageWidth).toBe(1200);
      expect(route.metadata.imageHeight).toBe(630);
      expect(route.metadata.imageType).toBe("image/png");
    }
  });

  it("makes every /strains fallback noindex and canonical to /cultivars", () => {
    for (const route of routes.filter((candidate) => candidate.legacyRedirect)) {
      expect(route.routePath).toMatch(/^\/strains(?:\/|$)/);
      expect(route.metadata.robots).toBe("noindex, follow");
      expect(route.metadata.url).toMatch(/^https:\/\/verdantgrowdiary\.com\/cultivars(?:\/|$)/);
    }
  });
});
