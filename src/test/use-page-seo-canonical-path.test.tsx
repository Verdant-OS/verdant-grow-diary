/**
 * usePageSeo — `canonicalPath` override.
 *
 * Ordinary routes are self-canonical and must stay that way; the override
 * exists only so an audience variant can concede its ranking URL to another
 * page (see src/test/breeder-beta-cross-canonical.test.ts).
 *
 * Both the canonical link AND og:url move together: a page whose og:url
 * disagrees with its canonical gives crawlers two different answers to the
 * same question.
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { usePageSeo, type PageSeo } from "@/hooks/usePageSeo";

const ORIGIN = "https://verdantgrowdiary.com";

function Probe(props: PageSeo) {
  usePageSeo(props);
  return null;
}

function head() {
  return {
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    ogUrl: document.head.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
    robots: document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    title: document.title,
  };
}

const BASE: PageSeo = {
  title: "T | Verdant Grow Diary",
  description: "D",
  path: "/breeder-beta",
};

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("link[rel='canonical']").forEach((n) => n.remove());
});

describe("usePageSeo · canonicalPath", () => {
  it("defaults to a self-canonical when omitted", () => {
    render(<Probe {...BASE} />);
    const { canonical, ogUrl } = head();
    expect(canonical).toBe(`${ORIGIN}/breeder-beta`);
    expect(ogUrl).toBe(`${ORIGIN}/breeder-beta`);
  });

  it("points canonical AND og:url at the override when supplied", () => {
    render(<Probe {...BASE} canonicalPath="/creator-beta" />);
    const { canonical, ogUrl } = head();
    expect(canonical).toBe(`${ORIGIN}/creator-beta`);
    expect(ogUrl).toBe(`${ORIGIN}/creator-beta`);
    expect(canonical).toBe(ogUrl);
  });

  it("leaves the variant's own title and description alone", () => {
    // The override moves indexing identity only — not the page's copy.
    render(<Probe {...BASE} canonicalPath="/creator-beta" />);
    expect(head().title).toBe("T | Verdant Grow Diary");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "D",
    );
  });

  it("stays indexable — the override is not a noindex in disguise", () => {
    render(<Probe {...BASE} canonicalPath="/creator-beta" />);
    expect(head().robots).toBe("index, follow");
  });

  it("still honours an explicit noindex alongside an override", () => {
    // Not a combination we ship, but the flags must remain independent rather
    // than one silently suppressing the other.
    render(<Probe {...BASE} canonicalPath="/creator-beta" noindex />);
    expect(head().robots).toBe("noindex, follow");
    expect(head().canonical).toBe(`${ORIGIN}/creator-beta`);
  });

  it("accepts an absolute URL override without double-prefixing the origin", () => {
    render(<Probe {...BASE} canonicalPath={`${ORIGIN}/creator-beta`} />);
    expect(head().canonical).toBe(`${ORIGIN}/creator-beta`);
  });

  it("is deterministic across repeated renders of the same input", () => {
    render(<Probe {...BASE} canonicalPath="/creator-beta" />);
    const first = head().canonical;
    cleanup();
    render(<Probe {...BASE} canonicalPath="/creator-beta" />);
    expect(head().canonical).toBe(first);
  });
});
