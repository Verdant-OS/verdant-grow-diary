import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/athenaFeedLogAnalytics", () => ({ trackFeedLogEvent: vi.fn() }));

import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import { getAppRouteManifestPaths } from "@/lib/appRouteManifest";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { guideRouteHead, UNKNOWN_GUIDE_ROBOTS } from "@/lib/guideRouteHeadRules";
import AthenaFeedLog from "@/pages/AthenaFeedLog";
import { Route } from "@/routes/guides.$slug";

type Head = ReturnType<typeof guideRouteHead>;

function robotsOf(head: Head): string[] {
  return head.meta.filter((m) => m.name === "robots").map((m) => m.content);
}

function routeHead(slug: string): Head {
  const head = Route.options.head as unknown as (ctx: { params: { slug: string } }) => Head;
  return head({ params: { slug } });
}

describe("/guides/$slug head for slugs that are not published guides", () => {
  it.each(["does-not-exist", "advanced-nutrients-feeding-chart-log", "", "GROW-ROOM-VPD-TRACKER"])(
    "route head for %j is noindex, follow with no canonical",
    (slug) => {
      const head = routeHead(slug);
      expect(robotsOf(head)).toEqual([UNKNOWN_GUIDE_ROBOTS]);
      expect(robotsOf(head)).not.toContain("index, follow");
      expect(head.links.filter((l) => l.rel === "canonical")).toEqual([]);
    },
  );

  it("treats a missing slug the same way", () => {
    expect(robotsOf(guideRouteHead(undefined))).toEqual(["noindex, follow"]);
  });

  it("leaves every published guide on its existing static head", () => {
    expect(VERDANT_GUIDE_SLUGS.length).toBeGreaterThan(0);
    for (const slug of VERDANT_GUIDE_SLUGS) {
      expect(routeHead(slug)).toEqual(staticRouteHead(`/guides/${slug}`));
    }
  });
});

describe("Athena feed log related guide links", () => {
  it("every /guides link resolves to a registered route or a published guide slug", () => {
    const { container } = render(
      <MemoryRouter>
        <AthenaFeedLog />
      </MemoryRouter>,
    );
    const staticRoutes = new Set(getAppRouteManifestPaths().filter((p) => !p.includes(":")));
    const published = new Set(VERDANT_GUIDE_SLUGS);
    const guideHrefs = [...container.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href === "/guides" || href.startsWith("/guides/"));

    expect(guideHrefs.length).toBeGreaterThan(0);
    const unresolved = guideHrefs.filter((href) => {
      const path = href.split(/[?#]/)[0];
      if (staticRoutes.has(path)) return false;
      const slug = path.slice("/guides/".length);
      return !published.has(slug);
    });
    expect(unresolved).toEqual([]);
  });
});
