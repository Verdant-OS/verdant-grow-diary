/**
 * #2023 SEO: three public destinations (/glossary, /docs/mcp-api,
 * /creator-beta) had no contextual incoming links from the pages that
 * should send readers there. Each link must appear, with its label, in the
 * server-rendered HTML and in the hydrated DOM; the guide hub's static
 * no-JS fallback carries the glossary link too.
 */
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/components/LeadCaptureForm", () => ({ default: () => null }));
vi.mock("@/components/LandingAuthedOnboardingBridge", () => ({ default: () => null }));

import GuidesIndex from "@/pages/GuidesIndex";
import HardwareIntegrations from "@/pages/HardwareIntegrations";
import HowAiDoctorWorks from "@/pages/HowAiDoctorWorks";
import Landing from "@/pages/Landing";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { getRoutesByAccess } from "@/lib/appRouteManifest";

const CASES: ReadonlyArray<{
  page: string;
  element: () => ReactElement;
  path: string;
  href: string;
  label: string;
}> = [
  {
    page: "/guides",
    element: () => <GuidesIndex />,
    path: "/guides",
    href: "/glossary",
    label: "Cultivation glossary",
  },
  {
    page: "/hardware-integrations",
    element: () => <HardwareIntegrations />,
    path: "/hardware-integrations",
    href: "/docs/mcp-api",
    label: "read the read-only MCP API reference",
  },
  {
    page: "/",
    element: () => <Landing />,
    path: "/",
    href: "/creator-beta",
    label: "Creator and breeder beta",
  },
  {
    page: "/how-ai-doctor-works",
    element: () => <HowAiDoctorWorks />,
    path: "/how-ai-doctor-works",
    href: "/creator-beta",
    label: "Read the Creator & Breeder Beta walkthrough",
  },
];

function withRouter(path: string, element: ReactElement) {
  return <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>;
}

afterEach(() => cleanup());

describe("contextual internal links to orphaned public pages", () => {
  it.each(CASES)(
    "$page links to $href in server-rendered HTML",
    ({ path, element, href, label }) => {
      const html = renderToString(withRouter(path, element()));
      const doc = new DOMParser().parseFromString(html, "text/html");
      const anchors = [...doc.querySelectorAll(`a[href="${href}"]`)];
      expect(anchors).toHaveLength(1);
      expect(anchors[0].textContent?.trim()).toBe(label);
      expect(anchors[0].getAttribute("rel")).toBeNull();
    },
  );

  it.each(CASES)("$page links to $href after hydration", ({ path, element, href, label }) => {
    const { container } = render(withRouter(path, element()));
    const anchors = [...container.querySelectorAll(`a[href="${href}"]`)];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toBe(screen.getByRole("link", { name: label }));
    expect(anchors[0].getAttribute("rel")).toBeNull();
  });

  it("carries the glossary link in the guide hub's static no-JS body", () => {
    const hub = STATIC_PUBLIC_SEO_DOCUMENTS.find((doc) => doc.path === "/guides");
    const doc = new DOMParser().parseFromString(hub?.metadata.bodyFallbackHtml ?? "", "text/html");
    const anchor = doc.querySelector('a[href="/glossary"]');
    expect(anchor?.textContent).toBe("Cultivation glossary");
  });

  it("links only to public, indexable destinations", () => {
    const publicPaths = getRoutesByAccess("public").map((route) => route.path);
    for (const { href } of CASES) expect(publicPaths).toContain(href);
  });
});
