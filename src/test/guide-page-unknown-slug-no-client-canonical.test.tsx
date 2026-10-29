/**
 * P3-1 from the #2597 review: while an unknown guide slug redirects to /guides,
 * the client head must not pair "noindex, follow" with a canonical pointing at
 * /guides. SSR already emits no canonical for these slugs; this pins the client
 * half. Published guides keep their self-canonical.
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

function canonical(): string | null {
  return (
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href") ??
    null
  );
}

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="robots"]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

describe("GuidePage client canonical", () => {
  it.each(["does-not-exist", "advanced-nutrients-feeding-chart-log"])(
    "writes no canonical for %j while it redirects to /guides",
    (slug) => {
      routeState.slug = slug;
      render(<GuidePage />);
      expect(canonical()).toBeNull();
    },
  );

  it("keeps the self-canonical on a published guide", () => {
    routeState.slug = VERDANT_GUIDE_SLUGS[0];
    render(<GuidePage />);
    expect(canonical()).toBe(`https://verdantgrowdiary.com/guides/${VERDANT_GUIDE_SLUGS[0]}`);
  });
});
