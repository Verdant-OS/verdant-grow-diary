/**
 * Client half of the unknown-guide-slug noindex contract. The SSR head is
 * covered in seo-guide-slug-indexability.test.tsx; this pins that hydration
 * (usePageSeo in GuidePage) does not flip an unknown slug back to
 * "index, follow" before the <Navigate> to /guides runs.
 */
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ slug: "" }));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to }: { to: string }) => createElement("span", { "data-redirect-to": to }),
  useLocation: () => ({ hash: "" }),
  useParams: () => ({ slug: routeState.slug }),
}));
vi.mock("@/components/DiaryFaqLinkStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/customer/CustomerComparisonGuideQrOption", () => ({
  default: () => null,
}));

import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import GuidePage from "@/pages/GuidePage";

function robots(): string | null {
  return (
    document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.getAttribute("content") ??
    null
  );
}

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="robots"]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

describe("GuidePage client head for slugs that are not published guides", () => {
  it.each(["does-not-exist", "advanced-nutrients-feeding-chart-log"])(
    "keeps %j noindex while it redirects to /guides",
    (slug) => {
      routeState.slug = slug;
      const { container } = render(<GuidePage />);
      expect(container.querySelector("[data-redirect-to]")?.getAttribute("data-redirect-to")).toBe(
        "/guides",
      );
      expect(robots()).toBe("noindex, follow");
    },
  );

  it("leaves a published guide indexable", () => {
    routeState.slug = VERDANT_GUIDE_SLUGS[0];
    render(<GuidePage />);
    expect(robots()).toBe("index, follow");
  });
});
