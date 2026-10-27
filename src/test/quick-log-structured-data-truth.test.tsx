/**
 * /quick-log structured data. The root route already emits the sitewide
 * SoftwareApplication (@id /#app, real public offers from PRICING). The page
 * must not add a second, offer-less "Verdant Grow Diary" app node with a
 * different category: that duplicate is what the rich-results validator
 * warned about. No offers, ratings or reviews are invented here; the only
 * app node is the sitewide one.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { SITE_SOFTWARE_APPLICATION_JSON_LD } from "@/lib/build/siteSoftwareApplicationJsonLd";
import { staticRouteHead } from "@/lib/build/staticRouteHead";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));

import QuickLogStarter from "@/pages/QuickLogStarter";

afterEach(() => {
  cleanup();
  clearLocalStorageForTest();
});

type Node = Record<string, unknown>;

function quickLogNodes(): Node[] {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((d) => d.path === "/quick-log");
  return (doc?.metadata.jsonLd ?? []) as Node[];
}

describe("/quick-log static structured data", () => {
  it("keeps WebPage and FAQPage", () => {
    const types = quickLogNodes().map((n) => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebPage", "FAQPage"]));
  });

  it("uses only the sitewide app node, with its real offers", () => {
    const apps = quickLogNodes().filter((n) => n["@type"] === "SoftwareApplication");
    expect(apps).toEqual([SITE_SOFTWARE_APPLICATION_JSON_LD]);
    expect(apps.every((n) => !("aggregateRating" in n) && !("review" in n))).toBe(true);
  });
});

describe("/quick-log composed SSR head", () => {
  it("leaves the sitewide app node to the root head, so it appears once", () => {
    // The root route's head() always emits SITE_SOFTWARE_APPLICATION_JSON_LD.
    const routeNodes = staticRouteHead("/quick-log").scripts.map(
      (script) => JSON.parse(script.children) as Node,
    );
    const composed = [SITE_SOFTWARE_APPLICATION_JSON_LD as Node, ...routeNodes];
    expect(composed.filter((n) => n["@type"] === "SoftwareApplication")).toHaveLength(1);
    expect(routeNodes.map((n) => n["@type"])).toEqual(
      expect.arrayContaining(["WebPage", "FAQPage"]),
    );
  });
});

describe("/quick-log hydrated page", () => {
  it("does not inject a second, offer-less app node", () => {
    render(
      <MemoryRouter initialEntries={["/quick-log"]}>
        <QuickLogStarter />
      </MemoryRouter>,
    );
    const nodes = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (el) => JSON.parse(el.textContent ?? "{}") as Node,
    );
    expect(nodes.filter((n) => n["@type"] === "SoftwareApplication")).toEqual([]);
    expect(nodes.some((n) => n["@type"] === "FAQPage")).toBe(true);
  });
});
