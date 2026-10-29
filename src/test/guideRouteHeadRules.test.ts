/**
 * Pure unit tests for /guides/$slug SSR head selection.
 * Integration with the route module lives in seo-guide-slug-indexability.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { guideRouteHead, UNKNOWN_GUIDE_ROBOTS } from "@/lib/guideRouteHeadRules";
import { Route } from "@/routes/guides.$slug";

function robotsContent(head: ReturnType<typeof guideRouteHead>): string | undefined {
  return head.meta.find((m) => m.name === "robots")?.content;
}

describe("guideRouteHeadRules", () => {
  it("exports the pinned unknown-guide robots directive", () => {
    expect(UNKNOWN_GUIDE_ROBOTS).toBe("noindex, follow");
  });

  it("documents why staticRouteHead must not be used for arbitrary slugs", () => {
    const deadPath = "/guides/advanced-nutrients-feeding-chart-log";
    expect(staticRouteHead(deadPath)).toEqual({ meta: [], links: [], scripts: [] });
    expect(guideRouteHead("advanced-nutrients-feeding-chart-log")).toEqual({
      meta: [{ name: "robots", content: UNKNOWN_GUIDE_ROBOTS }],
      links: [],
      scripts: [],
    });
  });

  it("noindexes unknown slugs with robots-only head (no canonical or title leak)", () => {
    for (const slug of ["does-not-exist", "", "GROW-ROOM-VPD-TRACKER"]) {
      const head = guideRouteHead(slug);
      expect(robotsContent(head)).toBe(UNKNOWN_GUIDE_ROBOTS);
      expect(head.meta).toHaveLength(1);
      expect(head.links).toEqual([]);
      expect(head.scripts).toEqual([]);
    }
    expect(guideRouteHead(undefined)).toMatchObject({
      meta: [{ name: "robots", content: UNKNOWN_GUIDE_ROBOTS }],
      links: [],
      scripts: [],
    });
  });

  it("matches staticRouteHead for every published guide slug", () => {
    expect(VERDANT_GUIDE_SLUGS.length).toBeGreaterThan(0);
    for (const slug of VERDANT_GUIDE_SLUGS) {
      expect(guideRouteHead(slug)).toEqual(staticRouteHead(`/guides/${slug}`));
      expect(robotsContent(guideRouteHead(slug))).toBe("index, follow");
    }
  });

  it("keeps the route wired through guideRouteHead, not raw staticRouteHead(slug)", () => {
    const head = Route.options.head as unknown as (ctx: { params: { slug: string } }) => unknown;
    for (const slug of ["advanced-nutrients-feeding-chart-log", VERDANT_GUIDE_SLUGS[0]]) {
      expect(head({ params: { slug } })).toEqual(guideRouteHead(slug));
    }
  });
});
