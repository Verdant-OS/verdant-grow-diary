/**
 * verdant-seo-guides-public-links.test.tsx
 *
 * Render-level hardening for the public /guides SEO surface:
 *  - /guides and every /guides/:slug page renders WITHOUT any auth
 *    provider mounted (no sign-in wall, no app shell).
 *  - Every internal link on every guide page resolves to a route the
 *    manifest explicitly marks `public` (or a real public/ static asset).
 *  - No internal link points at a missing route or a protected surface.
 *  - Clicking guide-family links keeps the user on public guide content.
 *  - Clicking /welcome and the Customer Guide link navigates to those
 *    public paths — never to /auth.
 *  - Rendered copy + head metadata carry no device-control/autopilot
 *    promises and no compliance-tool (Metrc/seed-to-sale) positioning.
 *
 * Tests only. No Supabase, no network, no product changes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import GuidesIndex from "@/pages/GuidesIndex";
import GuidePage from "@/pages/GuidePage";
import { VERDANT_CUSTOMER_GUIDE_PATH, VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const REPO = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Route-manifest matching helpers
// ---------------------------------------------------------------------------

/** True when `href`'s pathname matches a manifest path (":param" wildcard). */
function manifestEntryFor(pathname: string) {
  const segs = pathname.split("/").filter(Boolean);
  for (const entry of APP_ROUTES) {
    if (entry.path === "*") continue;
    const patSegs = entry.path.split("/").filter(Boolean);
    if (patSegs.length !== segs.length) continue;
    const ok = patSegs.every((p, i) => p.startsWith(":") || p === segs[i]);
    if (ok) return entry;
  }
  return null;
}

function pathnameOf(href: string): string {
  return href.split("#")[0].split("?")[0];
}

/** Collect every <a href> in the container, split internal vs external. */
function collectLinks(container: HTMLElement) {
  const anchors = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
  const hrefs = anchors.map((a) => a.getAttribute("href") ?? "");
  const internal = hrefs.filter((h) => h.startsWith("/"));
  const external = hrefs.filter((h) => !h.startsWith("/"));
  return { internal, external };
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/diary",
  "/settings",
  "/plants",
  "/tents",
  "/admin",
  "/operator",
  "/actions",
];

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname}</div>;
}

/** Mount the real guide routes; everything else lands on a location probe. */
function renderGuides(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ALL_GUIDE_PATHS = ["/guides", ...VERDANT_GUIDE_SLUGS.map((s) => `/guides/${s}`)];

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Public render without auth
// ---------------------------------------------------------------------------

describe("/guides pages render publicly (no auth mounted)", () => {
  it("guide slugs are derived from shared constants and non-empty", () => {
    expect(VERDANT_GUIDE_SLUGS.length).toBeGreaterThanOrEqual(7);
    for (const s of VERDANT_GUIDE_SLUGS) {
      expect(s).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("/guides renders the hub with no sign-in wall or app shell", () => {
    renderGuides("/guides");
    expect(screen.getByTestId("guides-index-page")).toBeInTheDocument();
    expect(screen.queryByText(/sign in\b/i)).toBeNull();
    expect(screen.queryByText(/create.*account/i)).toBeNull();
    expect(screen.queryByTestId("app-shell")).toBeNull();
  });

  for (const slug of VERDANT_GUIDE_SLUGS) {
    it(`/guides/${slug} renders its guide content with no sign-in wall`, () => {
      renderGuides(`/guides/${slug}`);
      const page = screen.getByTestId("guide-page");
      expect(page.getAttribute("data-guide-slug")).toBe(slug);
      expect(screen.queryByText(/sign in\b/i)).toBeNull();
      expect(screen.queryByTestId("app-shell")).toBeNull();
    });
  }

  it("an unknown slug redirects to the public /guides hub, not /auth", () => {
    renderGuides("/guides/not-a-real-guide");
    expect(screen.getByTestId("guides-index-page")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Internal-link integrity against the route manifest
// ---------------------------------------------------------------------------

describe("/guides internal links resolve to explicitly-public routes", () => {
  for (const path of ALL_GUIDE_PATHS) {
    it(`${path}: every internal link is a known public route or asset`, () => {
      const { container } = renderGuides(path);
      const { internal, external } = collectLinks(container);
      expect(internal.length).toBeGreaterThan(0);

      for (const href of internal) {
        const pathname = pathnameOf(href);
        const entry = manifestEntryFor(pathname);
        if (entry) {
          expect(
            entry.access,
            `${path} links to ${href} (manifest access "${entry.access}") — guide pages may only link to explicitly public routes`,
          ).toBe("public");
          continue;
        }
        // Not a route — must be a real static asset shipped in public/.
        expect(
          existsSync(resolve(REPO, "public", pathname.replace(/^\//, ""))),
          `${path} links to ${href}, which is neither a manifest route nor a public/ asset`,
        ).toBe(true);
      }

      for (const href of external) {
        expect(href, `${path} external link must be https: ${href}`).toMatch(/^https:\/\//);
      }
    });

    it(`${path}: no internal link targets a protected surface`, () => {
      const { container } = renderGuides(path);
      const { internal } = collectLinks(container);
      for (const href of internal) {
        const pathname = pathnameOf(href);
        for (const prefix of PROTECTED_PREFIXES) {
          if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
            const entry = manifestEntryFor(pathname);
            expect(entry?.access, `${path} links to protected-prefix route ${href}`).toBe("public");
          }
        }
      }
    });
  }

  it("guide-family slugs linked from /guides all exist in shared constants", () => {
    const { container } = renderGuides("/guides");
    const { internal } = collectLinks(container);
    const guideLinks = internal.filter((h) => /^\/guides\/[^/]+$/.test(h));
    expect(guideLinks.length).toBe(VERDANT_GUIDE_SLUGS.length);
    for (const href of guideLinks) {
      const slug = href.replace("/guides/", "");
      expect(VERDANT_GUIDE_SLUGS).toContain(slug);
    }
  });
});

// ---------------------------------------------------------------------------
// Click-through navigation stays public
// ---------------------------------------------------------------------------

describe("/guides click-through stays on public content", () => {
  it("clicking a guide card from /guides lands on that guide page", () => {
    const { container } = renderGuides("/guides");
    const firstSlug = VERDANT_GUIDE_SLUGS[0];
    const link = container.querySelector<HTMLAnchorElement>(`a[href="/guides/${firstSlug}"]`);
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("guide-page").getAttribute("data-guide-slug")).toBe(firstSlug);
  });

  it("clicking 'All guides' from a guide page returns to the /guides hub", () => {
    const { container } = renderGuides(`/guides/${VERDANT_GUIDE_SLUGS[0]}`);
    const link = container.querySelector<HTMLAnchorElement>('a[href="/guides"]');
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("guides-index-page")).toBeInTheDocument();
  });

  it("clicking /welcome navigates to /welcome — never to /auth", () => {
    const { container } = renderGuides("/guides");
    const link = container.querySelector<HTMLAnchorElement>('a[href="/welcome"]');
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/welcome");
  });

  it("clicking the Customer Guide link navigates to its public path — never to /auth", () => {
    const { container } = renderGuides(`/guides/${VERDANT_GUIDE_SLUGS[0]}`);
    const link = container.querySelector<HTMLAnchorElement>(
      `a[href="${VERDANT_CUSTOMER_GUIDE_PATH}"]`,
    );
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("location-probe")).toHaveTextContent(VERDANT_CUSTOMER_GUIDE_PATH);
  });

  it("/welcome and the Customer Guide path are explicitly public in the manifest", () => {
    expect(manifestEntryFor("/welcome")?.access).toBe("public");
    expect(manifestEntryFor(VERDANT_CUSTOMER_GUIDE_PATH)?.access).toBe("public");
    expect(manifestEntryFor("/pricing")?.access).toBe("public");
  });
});

// ---------------------------------------------------------------------------
// Safety: no device-control promises, no compliance-tool positioning
// ---------------------------------------------------------------------------

const FORBIDDEN_DEVICE_PHRASES = [
  "autopilot",
  "fully automated grow control",
  "AI controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your lights",
  "controls your fans",
  "controls irrigation",
  "controls humidifiers",
  "controls your equipment",
];

const FORBIDDEN_COMPLIANCE_POSITIONING = [
  "metrc",
  "seed-to-sale",
  "compliance tracking",
  "dispensary pos",
  "state tracking",
  "inventory compliance",
];

describe("/guides rendered copy + metadata carry no forbidden positioning", () => {
  for (const path of ALL_GUIDE_PATHS) {
    it(`${path}: no device-control/autopilot promises in copy or head metadata`, () => {
      const { container } = renderGuides(path);
      const description =
        document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      const haystack =
        `${container.textContent ?? ""}\n${document.title}\n${description}`.toLowerCase();
      for (const phrase of FORBIDDEN_DEVICE_PHRASES) {
        expect(
          haystack.includes(phrase.toLowerCase()),
          `${path} contains forbidden device-control phrase: "${phrase}"`,
        ).toBe(false);
      }
    });

    it(`${path}: not positioned as a compliance/ERP tool`, () => {
      const { container } = renderGuides(path);
      const description =
        document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      const haystack =
        `${container.textContent ?? ""}\n${document.title}\n${description}`.toLowerCase();
      for (const phrase of FORBIDDEN_COMPLIANCE_POSITIONING) {
        expect(
          haystack.includes(phrase),
          `${path} contains compliance positioning: "${phrase}"`,
        ).toBe(false);
      }
    });
  }
});
