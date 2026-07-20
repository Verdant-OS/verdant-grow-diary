/**
 * Unit tests for scripts/validate-jsonld-id-canonical-parity.mjs
 *
 * Exercises the pure helpers on synthetic HTML — no dist read.
 */
import { describe, expect, it } from "vitest";
import {
  extractCanonicalHrefs,
  extractJsonLdBlocks,
  matchesCanonical,
  validateDocument,
} from "../../scripts/validate-jsonld-id-canonical-parity.mjs";

const CANONICAL = "https://verdantgrowdiary.com/pricing";
const canonicalTag = `<link rel="canonical" href="${CANONICAL}">`;

function docWith(jsonld: unknown, canonical: string | null = CANONICAL): string {
  const link = canonical ? `<link rel="canonical" href="${canonical}">` : "";
  const body =
    jsonld === undefined
      ? ""
      : `<script type="application/ld+json">${
          typeof jsonld === "string" ? jsonld : JSON.stringify(jsonld)
        }</script>`;
  return `<!doctype html><html><head>${link}${body}</head><body></body></html>`;
}

describe("extractCanonicalHrefs", () => {
  it("returns single canonical href", () => {
    expect(extractCanonicalHrefs(canonicalTag)).toEqual([CANONICAL]);
  });
  it("returns [] when no canonical", () => {
    expect(extractCanonicalHrefs("<html></html>")).toEqual([]);
  });
});

describe("extractJsonLdBlocks", () => {
  it("extracts inner content of every ld+json script", () => {
    const html =
      `<script type="application/ld+json">{"a":1}</script>` +
      `<script type="application/ld+json">{"b":2}</script>`;
    expect(extractJsonLdBlocks(html)).toEqual([`{"a":1}`, `{"b":2}`]);
  });
});

describe("matchesCanonical", () => {
  it("accepts exact match", () => {
    expect(matchesCanonical(CANONICAL, CANONICAL)).toBe(true);
  });
  it("accepts canonical + #fragment", () => {
    expect(matchesCanonical(`${CANONICAL}#webpage`, CANONICAL)).toBe(true);
  });
  it("rejects different origin/path", () => {
    expect(matchesCanonical("https://other.com/pricing", CANONICAL)).toBe(false);
    expect(matchesCanonical(`${CANONICAL}/extra`, CANONICAL)).toBe(false);
  });
  it("rejects non-string", () => {
    expect(matchesCanonical(undefined as unknown as string, CANONICAL)).toBe(false);
  });
});

describe("validateDocument", () => {
  it("passes when no JSON-LD present", () => {
    const issues = validateDocument({ file: "x.html", html: docWith(undefined) });
    expect(issues).toEqual([]);
  });

  it("passes when @id equals canonical", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@context": "https://schema.org", "@type": "WebPage", "@id": CANONICAL }),
    });
    expect(issues).toEqual([]);
  });

  it("passes when @id is canonical#fragment", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@type": "WebPage", "@id": `${CANONICAL}#webpage` }),
    });
    expect(issues).toEqual([]);
  });

  it("passes when mainEntityOfPage (object form) matches canonical", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({
        "@type": "Article",
        mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
      }),
    });
    expect(issues).toEqual([]);
  });

  it("passes when mainEntityOfPage (string form) matches canonical", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@type": "Article", mainEntityOfPage: CANONICAL }),
    });
    expect(issues).toEqual([]);
  });

  it("flags mismatched @id", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@type": "WebPage", "@id": "https://verdantgrowdiary.com/other" }),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/@id/);
  });

  it("flags mismatched mainEntityOfPage", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({
        "@type": "Article",
        mainEntityOfPage: { "@type": "WebPage", "@id": "https://elsewhere.com/x" },
      }),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/mainEntityOfPage/);
  });

  it("flags invalid JSON", () => {
    const html = docWith("{not json");
    const issues = validateDocument({ file: "x.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/invalid JSON/);
  });

  it("walks @graph nodes", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", "@id": CANONICAL },
          { "@type": "Article", "@id": "https://bad.example/x" },
        ],
      }),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("bad.example");
  });
  it("ignores site-level entity @ids (Organization / WebSite / SoftwareApplication)", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({
        "@graph": [
          { "@type": "Organization", "@id": "https://verdantgrowdiary.com/#organization" },
          { "@type": "WebSite", "@id": "https://verdantgrowdiary.com/#website" },
          { "@type": "SoftwareApplication", "@id": "https://verdantgrowdiary.com/#app" },
          { "@type": "WebPage", "@id": CANONICAL },
        ],
      }),
    });
    expect(issues).toEqual([]);
  });


  it("walks top-level array", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith([
        { "@type": "WebPage", "@id": CANONICAL },
        { "@type": "BreadcrumbList" },
      ]),
    });
    expect(issues).toEqual([]);
  });

  it("ignores nodes with neither @id nor mainEntityOfPage", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@type": "Organization", name: "Verdant" }),
    });
    expect(issues).toEqual([]);
  });

  it("flags @id when document has no canonical", () => {
    const issues = validateDocument({
      file: "x.html",
      html: docWith({ "@type": "WebPage", "@id": CANONICAL }, null),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/canonical tag/);
  });

  it("flags @id when document has duplicate canonicals", () => {
    const html =
      `<link rel="canonical" href="${CANONICAL}">` +
      `<link rel="canonical" href="${CANONICAL}">` +
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "WebPage",
        "@id": CANONICAL,
      })}</script>`;
    const issues = validateDocument({ file: "x.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/2 canonical tag/);
  });

  it("flags empty JSON-LD block", () => {
    const html = `${canonicalTag}<script type="application/ld+json">   </script>`;
    const issues = validateDocument({ file: "x.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/empty/);
  });
});
