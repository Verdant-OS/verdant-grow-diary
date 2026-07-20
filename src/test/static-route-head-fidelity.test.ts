/**
 * static-route-head-fidelity.test
 *
 * Unit-tests the pure `extractHead` + `checkRouteHead` helpers used by
 * the postbuild validator (scripts/validate-static-route-head-fidelity.mjs).
 * The postbuild CLI runs the same helpers against every dist/*.html
 * emitted by the staticSocialRouteDocuments vite plugin — this suite
 * pins the helper contract so silent regressions in the validator itself
 * can never mask a real drift.
 */
import { describe, expect, it } from "vitest";
import {
  extractHead,
  checkRouteHead,
  diffRouteHead,
  renderMarkdownReport,
} from "../../scripts/validate-static-route-head-fidelity.mjs";


const FIXTURE_META = {
  title: "Pricing — Free, Pro & Founder Lifetime | Verdant Grow Diary",
  description: "Free grow diary forever. Pro adds multi-tent support.",
  url: "https://verdantgrowdiary.com/pricing",
  image: "https://verdantgrowdiary.com/og/pricing.png",
  imageAlt: "Verdant pricing",
} as const;

function fixtureHtml(overrides: Partial<Record<string, string>> = {}) {
  const v = { ...FIXTURE_META, ...overrides } as Record<string, string>;
  return `<!doctype html><html><head>
    <title>${v.title}</title>
    <meta name="description" content="${v.description}" />
    <link rel="canonical" href="${v.url}" />
    <meta property="og:title" content="${v.title}" />
    <meta property="og:description" content="${v.description}" />
    <meta property="og:url" content="${v.url}" />
    <meta property="og:image" content="${v.image}" />
    <meta property="og:image:alt" content="${v.imageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${v.title}" />
    <meta name="twitter:description" content="${v.description}" />
    <meta name="twitter:image" content="${v.image}" />
  </head><body></body></html>`;
}

describe("static route head fidelity helpers", () => {
  it("passes a clean pre-rendered document", () => {
    const head = extractHead(fixtureHtml());
    const issues = checkRouteHead(head, { path: "/pricing", metadata: FIXTURE_META });
    expect(issues).toEqual([]);
  });

  it("flags a drifted <title>", () => {
    const head = extractHead(fixtureHtml({ title: "Wrong title" }));
    const issues = checkRouteHead(head, { path: "/pricing", metadata: FIXTURE_META });
    expect(issues.join("\n")).toMatch(/<title> mismatch/);
  });

  it("flags canonical pointing away from the route", () => {
    const head = extractHead(fixtureHtml({ url: "https://verdantgrowdiary.com/" }));
    const issues = checkRouteHead(head, { path: "/pricing", metadata: FIXTURE_META });
    // canonical, og:url all drift when url changes
    expect(issues.some((i: string) => i.includes("canonical"))).toBe(true);
    expect(issues.some((i: string) => i.includes("og:url"))).toBe(true);
  });

  it("flags a missing og:image tag as a mismatch", () => {
    const html = fixtureHtml().replace(/<meta property="og:image"[^>]*>/, "");
    const issues = checkRouteHead(extractHead(html), {
      path: "/pricing",
      metadata: FIXTURE_META,
    });
    expect(issues.some((i: string) => i.includes("og:image"))).toBe(true);
  });

  it("requires twitter:card=summary_large_image", () => {
    const html = fixtureHtml().replace(
      /twitter:card" content="summary_large_image"/,
      'twitter:card" content="summary"',
    );
    const issues = checkRouteHead(extractHead(html), {
      path: "/pricing",
      metadata: FIXTURE_META,
    });
    expect(issues.some((i: string) => i.includes("twitter:card"))).toBe(true);
  });

  it("checks robots when the manifest declares one", () => {
    const html = fixtureHtml().replace(
      "</head>",
      '<meta name="robots" content="noindex, follow" /></head>',
    );
    const clean = checkRouteHead(extractHead(html), {
      path: "/pricing",
      metadata: { ...FIXTURE_META, robots: "noindex, follow" },
    });
    expect(clean).toEqual([]);
    const drifted = checkRouteHead(extractHead(fixtureHtml()), {
      path: "/pricing",
      metadata: { ...FIXTURE_META, robots: "noindex, follow" },
    });
    expect(drifted.some((i: string) => i.includes("robots"))).toBe(true);
  });
});
