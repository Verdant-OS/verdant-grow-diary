/**
 * Unit + rendering tests for legal-page JSON-LD structured data.
 *
 * Covers:
 *  - Helper output shape for /privacy, /terms, /refund (@id/url/name/publisher).
 *  - Determinism and no undefined/null/secret fields.
 *  - LegalPageShell renders exactly one JSON-LD script per route with the
 *    correct canonical URL, @id, and publisher.
 *  - Canonical is still owned by usePageSeo (single <link rel="canonical">).
 *  - Per-page OG/Twitter tags match the canonical.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import RefundPolicy from "@/pages/RefundPolicy";
import {
  buildLegalPageJsonLd,
  buildLegalPageCanonicalUrl,
  VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR,
  VERDANT_SITE_ORIGIN,
} from "@/lib/seo/legalPageStructuredData";

afterEach(() => cleanup());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/refund" element={<RefundPolicy />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("buildLegalPageJsonLd", () => {
  const cases = [
    { path: "/privacy", name: "Privacy Policy" },
    { path: "/terms", name: "Terms of Service" },
    { path: "/refund", name: "Refund Policy" },
  ] as const;

  for (const { path, name } of cases) {
    it(`${path}: URL, @id, name, publisher, inLanguage`, () => {
      const url = `${VERDANT_SITE_ORIGIN}${path}`;
      const out = buildLegalPageJsonLd({ path, name, description: `${name} for Verdant.` });
      expect(out["@context"]).toBe("https://schema.org");
      expect(out["@type"]).toBe("WebPage");
      expect(out.url).toBe(url);
      expect(out["@id"]).toBe(`${url}#webpage`);
      expect(out.name).toBe(name);
      expect(out.inLanguage).toBe("en-US");
      expect(out.publisher.name).toBe("Verdant");
      expect(out.publisher.url).toBe(VERDANT_SITE_ORIGIN);
      expect(out.isPartOf.name).toBe("Verdant");
      expect(out.isPartOf.url).toBe(VERDANT_SITE_ORIGIN);
      expect(out.about.name).toBe(name);
    });
  }

  it("is deterministic (same input → identical JSON)", () => {
    const a = buildLegalPageJsonLd({ path: "/privacy", name: "Privacy Policy", description: "d" });
    const b = buildLegalPageJsonLd({ path: "/privacy", name: "Privacy Policy", description: "d" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("rejects invalid paths and empty fields", () => {
    expect(() => buildLegalPageCanonicalUrl("privacy")).toThrow();
    expect(() =>
      buildLegalPageJsonLd({ path: "/privacy", name: " ", description: "d" }),
    ).toThrow();
    expect(() =>
      buildLegalPageJsonLd({ path: "/privacy", name: "n", description: "" }),
    ).toThrow();
  });

  it("emits no undefined/null fields and no secret-shaped strings", () => {
    const json = JSON.stringify(
      buildLegalPageJsonLd({ path: "/refund", name: "Refund Policy", description: "d" }),
    );
    expect(json).not.toMatch(/null|undefined/);
    expect(json).not.toMatch(/service_role|eyJ[A-Za-z0-9_-]{8,}\.|PADDLE_(API|WEBHOOK|SECRET)/i);
  });
});

describe("LegalPageShell: canonical + OG + Twitter + JSON-LD per route", () => {
  const routes = [
    { path: "/privacy", name: "Privacy Policy", render: () => renderAt("/privacy") },
    { path: "/terms", name: "Terms of Service", render: () => renderAt("/terms") },
    { path: "/refund", name: "Refund Policy", render: () => renderAt("/refund") },
  ] as const;

  for (const r of routes) {
    it(`${r.path}: one canonical (usePageSeo-owned), matching OG/Twitter, one WebPage JSON-LD`, () => {
      r.render();
      const url = `${VERDANT_SITE_ORIGIN}${r.path}`;

      // Exactly one canonical, and it matches the route.
      const canonicals = document.head.querySelectorAll('link[rel="canonical"]');
      expect(canonicals.length).toBe(1);
      expect(canonicals[0].getAttribute("href")).toBe(url);

      // OG/Twitter tags exist and og:url mirrors the canonical.
      const meta = (sel: string) =>
        document.head.querySelector<HTMLMetaElement>(sel)?.getAttribute("content") ?? null;
      expect(meta('meta[name="description"]')).toBeTruthy();
      expect(meta('meta[property="og:title"]')).toContain(r.name);
      expect(meta('meta[property="og:description"]')).toBeTruthy();
      expect(meta('meta[property="og:url"]')).toBe(url);
      expect(meta('meta[property="og:type"]')).toBe("website");
      expect(meta('meta[property="og:site_name"]')).toBe("Verdant Grow Diary");
      expect(meta('meta[property="og:image"]')).toMatch(/^https?:\/\//);
      expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
      expect(meta('meta[name="twitter:title"]')).toContain(r.name);
      expect(meta('meta[name="twitter:description"]')).toBeTruthy();
      expect(meta('meta[name="twitter:image"]')).toMatch(/^https?:\/\//);

      // Exactly one JSON-LD script for this legal page and it parses cleanly.
      const scripts = document.querySelectorAll(
        `script[type="application/ld+json"][data-seo="${VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR}"]`,
      );
      expect(scripts.length).toBe(1);
      const parsed = JSON.parse(scripts[0].textContent ?? "");
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(parsed["@type"]).toBe("WebPage");
      expect(parsed.url).toBe(url);
      expect(parsed["@id"]).toBe(`${url}#webpage`);
      expect(parsed.name).toBe(r.name);
      expect(parsed.publisher.name).toBe("Verdant");
    });
  }
});
