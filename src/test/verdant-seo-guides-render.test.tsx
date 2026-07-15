/**
 * verdant-seo-guides-render.test.tsx
 *
 * Integration render coverage for the public /guides hub and /guides/:slug
 * detail pages. Proves both surfaces render for an unauthenticated visitor —
 * no auth provider, no protected shell, no sign-in redirect — and that they
 * carry the SEO metadata + JSON-LD wired by the SEO slice.
 *
 * No Supabase, no network, no AI, no device control.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidesIndex from "@/pages/GuidesIndex";
import GuidePage from "@/pages/GuidePage";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";

afterEach(() => {
  cleanup();
  // Clean up any JSON-LD scripts injected by useEffect.
  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((el) => el.remove());
  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (canonical) canonical.remove();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function readMeta(selector: string): string | null {
  return (
    document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute(
      "content",
    ) ?? null
  );
}

function readJsonLd(marker: string): unknown {
  const el = document.head.querySelector<HTMLScriptElement>(
    `script[data-page-ldjson="${marker}"]`,
  );
  if (!el || !el.textContent) return null;
  return JSON.parse(el.textContent);
}

describe("/guides hub — public render", () => {
  it("renders without an authenticated user or protected shell", () => {
    renderAt("/guides");
    expect(screen.getByTestId("guides-index-page")).toBeTruthy();
    // Public H1 + Verdant positioning.
    expect(screen.getByText(/The Verdant grower guide/i)).toBeTruthy();
    expect(screen.getByText(/Plant memory\. Sensor truth\./i)).toBeTruthy();
  });

  it("emits canonical, title, description, OG and Twitter metadata", () => {
    renderAt("/guides");
    expect(document.title).toContain("Verdant Grower Guides");
    expect(readMeta('meta[name="description"]')).toMatch(
      /source-labeled sensor data/i,
    );
    const canonical = document.head
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.getAttribute("href");
    expect(canonical).toBe("https://verdantgrowdiary.com/guides");
    expect(readMeta('meta[property="og:url"]')).toBe(
      "https://verdantgrowdiary.com/guides",
    );
    expect(readMeta('meta[property="og:title"]')).toContain(
      "Verdant Grower Guides",
    );
    expect(readMeta('meta[property="og:description"]')).toBeTruthy();
    expect(readMeta('meta[property="og:type"]')).toBe("website");
    expect(readMeta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(readMeta('meta[name="twitter:title"]')).toContain(
      "Verdant Grower Guides",
    );
  });

  it("injects FAQPage + BreadcrumbList JSON-LD", () => {
    renderAt("/guides");
    const faq = readJsonLd("guides-index-faq") as {
      "@type": string;
      mainEntity: unknown[];
    } | null;
    expect(faq?.["@type"]).toBe("FAQPage");
    expect((faq?.mainEntity ?? []).length).toBeGreaterThan(0);

    const crumbs = readJsonLd("guides-index-breadcrumb") as {
      "@type": string;
      itemListElement: Array<{ position: number; item: string; name: string }>;
    } | null;
    expect(crumbs?.["@type"]).toBe("BreadcrumbList");
    expect(crumbs?.itemListElement.length).toBe(2);
    expect(crumbs?.itemListElement[0].position).toBe(1);
    expect(crumbs?.itemListElement[1].item).toBe(
      "https://verdantgrowdiary.com/guides",
    );
  });

  it("does not link to protected/auth-only app routes", () => {
    renderAt("/guides");
    const hrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).map((a) => a.getAttribute("href") ?? "");
    for (const forbidden of [
      "/dashboard",
      "/diary",
      "/tents",
      "/plants",
      "/settings",
      "/action-queue",
      "/operator",
      "/admin",
      "/internal",
    ]) {
      expect(hrefs.some((h) => h.startsWith(forbidden))).toBe(false);
    }
  });
});

describe("/guides/:slug detail — public render", () => {
  it("renders the grow-diary-app guide for an unauthenticated visitor", () => {
    renderAt("/guides/grow-diary-app");
    const page = screen.getByTestId("guide-page");
    expect(page.getAttribute("data-guide-slug")).toBe("grow-diary-app");
    expect(
      screen.getByText(/Best grow diary app for serious growers/i),
    ).toBeTruthy();
  });

  it("emits unique canonical + OG url per guide", () => {
    for (const g of VERDANT_SEO_GUIDES) {
      cleanup();
      document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((el) => el.remove());
      const prevCanon = document.head.querySelector('link[rel="canonical"]');
      if (prevCanon) prevCanon.remove();

      renderAt(`/guides/${g.slug}`);
      const expected = `https://verdantgrowdiary.com/guides/${g.slug}`;
      const canonical = document.head
        .querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.getAttribute("href");
      expect(canonical).toBe(expected);
      expect(readMeta('meta[property="og:url"]')).toBe(expected);
      expect(document.title).toBe(g.title);
      expect(readMeta('meta[name="description"]')).toBe(g.description);
      expect(readMeta('meta[property="og:title"]')).toBe(g.title);
      expect(readMeta('meta[property="og:description"]')).toBe(g.description);
      expect(readMeta('meta[name="twitter:title"]')).toBe(g.title);
      expect(readMeta('meta[name="twitter:card"]')).toBe(
        "summary_large_image",
      );

      const crumbs = readJsonLd(`guide-${g.slug}-breadcrumb`) as {
        itemListElement: Array<{ position: number; item: string; name: string }>;
      } | null;
      expect(crumbs?.itemListElement.length).toBe(3);
      expect(crumbs?.itemListElement[2].item).toBe(expected);
      expect(crumbs?.itemListElement[2].name).toBe(g.h1);
    }
  });

  it("renders FAQ accordion for each guide with visible questions", () => {
    renderAt("/guides/grow-diary-app");
    // FAQ heading is present.
    expect(screen.getByText(/Common questions/i)).toBeTruthy();
  });

  it("moves keyboard focus to the deep-linked FAQ accordion item", async () => {
    renderAt("/guides/cannabis-plant-care#faq-2");
    const target = document.getElementById("faq-2");
    expect(target).toBeTruthy();
    expect(target?.getAttribute("tabindex")).toBe("-1");
    await waitFor(() => expect(document.activeElement).toBe(target), {
      timeout: 300,
    });
  });

  it("keeps the FAQ highlight until the user manually closes it", async () => {
    renderAt("/guides/cannabis-plant-care#faq-2");
    const target = document.getElementById("faq-2");
    await waitFor(() => expect(target).toHaveAttribute("data-highlighted", "true"), {
      timeout: 300,
    });
    // Wait longer than the old auto-fade timer (2600ms) to confirm the
    // highlight is now driven by user action, not a timeout.
    await new Promise((r) => window.setTimeout(r, 3000));
    expect(target).toHaveAttribute("data-highlighted", "true");

    // Manually collapse the accordion item to dismiss the highlight.
    const trigger = target?.querySelector('[data-radix-accordion-trigger]');
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() =>
      expect(target).not.toHaveAttribute("data-highlighted", "true"),
    );
  });
});
