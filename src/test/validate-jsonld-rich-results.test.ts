import { describe, it, expect } from "vitest";
import {
  extractJsonLdBlocks,
  validateHtmlDocument,
  validateJsonLdObject,
} from "../../scripts/validate-jsonld-rich-results.mjs";

const wrap = (obj: unknown) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;

describe("validate-jsonld-rich-results", () => {
  it("extracts every JSON-LD script block", () => {
    const html = `${wrap({ "@context": "https://schema.org", "@type": "WebSite", name: "x", url: "https://x.co/" })}<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"y"}</script>`;
    expect(extractJsonLdBlocks(html)).toHaveLength(2);
  });

  it("passes a valid FAQPage", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Q1", acceptedAnswer: { "@type": "Answer", text: "A1" } },
      ],
    });
    expect(res.issues).toEqual([]);
  });

  it("rejects FAQPage with empty answer", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "" } }],
    });
    expect(res.issues.some((i) => i.message.includes('missing required field "text"'))).toBe(true);
  });

  it("rejects Article missing headline, author, non-ISO date, and relative url", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "Article",
      url: "/not-absolute",
      datePublished: "yesterday",
    });
    const msgs = res.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/headline/);
    expect(msgs).toMatch(/absolute http/);
    expect(msgs).toMatch(/ISO-8601/);
    expect(msgs).toMatch(/author/);
  });

  it("rejects BreadcrumbList with wrong position ordering", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 2, name: "A", item: "https://x.co/a" },
        { "@type": "ListItem", position: 1, name: "B", item: "https://x.co/b" },
      ],
    });
    expect(res.issues.some((i) => i.path.endsWith(".position"))).toBe(true);
  });

  it("rejects unknown @type", () => {
    const res = validateJsonLdObject({ "@context": "https://schema.org", "@type": "PotatoSalad" });
    expect(res.issues.some((i) => i.message.includes("not one of the known types"))).toBe(true);
  });

  it("rejects wrong @context", () => {
    const res = validateJsonLdObject({ "@context": "https://example.org", "@type": "Organization", name: "x" });
    expect(res.issues.some((i) => i.message.includes("@context"))).toBe(true);
  });

  it("rejects null values embedded in the payload", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "x",
      url: "https://x.co/",
      sameAs: [null],
    });
    expect(res.issues.some((i) => i.message.includes("null value"))).toBe(true);
  });

  it("warns on SoftwareApplication without offers/aggregateRating but does not error", () => {
    const res = validateJsonLdObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Verdant",
      applicationCategory: "LifestyleApplication",
    });
    expect(res.issues).toEqual([]);
    expect(res.warnings.some((w) => w.message.includes("offers or aggregateRating"))).toBe(true);
  });

  it("supports @graph arrays", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "V", url: "https://x.co/" },
        { "@type": "WebSite", name: "V", url: "https://x.co/" },
      ],
    })}</script>`;
    // @graph entries inherit context via top-level object; validator falls back to top-level context check
    const res = validateHtmlDocument(html, "test.html");
    // Graph child objects don't carry @context; we expect the @context warning per child
    // The point of this test: extraction + iteration works without crashing and each child is validated.
    expect(res.blockCount).toBe(1);
    // Each graph node is validated separately
    expect(res.issues.filter((i) => i.path.includes("@graph")).length).toBeGreaterThan(0);
  });

  it("flags a partial </script sequence that would break HTML parsing if closed", () => {
    // Simulates a payload where a string contains "</scriptx" (no closing >).
    // Realistic </script> would prematurely close the outer <script> element,
    // so we assert the pre-parse guard catches the partial form here.
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"</scriptx"}</script>`;
    const res = validateHtmlDocument(html, "xss.html");
    expect(res.issues.some((i) => i.message.includes("</script"))).toBe(true);
  });


  it("returns clean result for well-formed multi-block HTML", () => {
    const html = `${wrap({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Verdant",
      url: "https://verdantgrowdiary.com/",
    })}${wrap({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://verdantgrowdiary.com/" },
        { "@type": "ListItem", position: 2, name: "Guides", item: "https://verdantgrowdiary.com/guides" },
      ],
    })}`;
    const res = validateHtmlDocument(html, "good.html");
    expect(res.issues).toEqual([]);
    expect(res.blockCount).toBe(2);
  });
});
