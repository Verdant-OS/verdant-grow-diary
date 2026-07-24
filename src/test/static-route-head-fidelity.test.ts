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
  extractJsonLd,
  flattenJsonLdNodes,
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

const VALID_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://verdantgrowdiary.com/#app",
  name: "Verdant Grow Diary",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://verdantgrowdiary.com",
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro (monthly)", price: "9", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro (annual)", price: "90", priceCurrency: "USD" },
    { "@type": "Offer", name: "Founder Lifetime", price: "129", priceCurrency: "USD" },
  ],
};

function fixtureHtml(
  overrides: Partial<Record<string, string>> = {},
  opts: { jsonLd?: unknown | null } = {},
) {
  const v = { ...FIXTURE_META, ...overrides } as Record<string, string>;
  const robots = v.robots ?? "index, follow";
  const jsonLdNode = opts.jsonLd === undefined ? VALID_JSONLD : opts.jsonLd;
  const jsonLdTag =
    jsonLdNode === null
      ? ""
      : `<script type="application/ld+json">${
          typeof jsonLdNode === "string" ? jsonLdNode : JSON.stringify(jsonLdNode)
        }</script>`;
  return `<!doctype html><html><head>
    <title>${v.title}</title>
    <meta name="description" content="${v.description}" />
    <link rel="canonical" href="${v.url}" />
    <meta property="og:title" content="${v.title}" />
    <meta property="og:description" content="${v.description}" />
    <meta property="og:url" content="${v.url}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${v.image}" />
    <meta property="og:image:alt" content="${v.imageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${v.title}" />
    <meta name="twitter:description" content="${v.description}" />
    <meta name="twitter:image" content="${v.image}" />
    <meta name="robots" content="${robots}" />
    ${jsonLdTag}
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

  it("diffRouteHead returns a per-field structured diff", () => {
    const head = extractHead(fixtureHtml({ title: "Wrong title" }));
    const diff = diffRouteHead(head, {
      path: "/pricing",
      fileName: "pricing.html",
      metadata: FIXTURE_META,
    });
    expect(diff.ok).toBe(false);
    expect(diff.path).toBe("/pricing");
    expect(diff.fileName).toBe("pricing.html");
    // Every field has ok/expected/actual/label.
    for (const f of diff.fields) {
      expect(f).toHaveProperty("label");
      expect(f).toHaveProperty("expected");
      expect(f).toHaveProperty("actual");
      expect(typeof f.ok).toBe("boolean");
    }
    // Title mismatch is the only drift; og:title still matches (uses metadata.title).
    const titleField = diff.fields.find((f: any) => f.label === "<title>");
    expect(titleField.ok).toBe(false);
    expect(titleField.expected).toBe(FIXTURE_META.title);
    expect(titleField.actual).toBe("Wrong title");
    // title, og:title, and twitter:title all derive from metadata.title.
    expect(diff.mismatched).toHaveLength(3);
    expect(diff.mismatched.every((f: any) => f.actual === "Wrong title")).toBe(true);
  });

  it("renderMarkdownReport summarizes drifted routes with expected vs actual", () => {
    const cleanDiff = diffRouteHead(extractHead(fixtureHtml()), {
      path: "/clean",
      fileName: "clean.html",
      metadata: FIXTURE_META,
    });
    const drifted = diffRouteHead(
      extractHead(fixtureHtml({ title: "Wrong title" })),
      { path: "/pricing", fileName: "pricing.html", metadata: FIXTURE_META },
    );
    const md = renderMarkdownReport([cleanDiff, drifted], {
      generatedAt: "2026-07-20T00:00:00.000Z",
      distDir: "/tmp/dist",
      missingFiles: [{ path: "/gone", fileName: "gone.html" }],
    });
    expect(md).toContain("# SEO head fidelity report");
    expect(md).toContain("Routes checked: 2");
    expect(md).toContain("Routes with drift: 1");
    expect(md).toContain("Missing pre-rendered files");
    expect(md).toContain("`/gone`");
    expect(md).toContain("### `/pricing`");
    expect(md).toContain("Wrong title");
    expect(md).toContain("Pricing — Free, Pro & Founder Lifetime");
    // Clean route must not appear as a drifted section.
    expect(md).not.toContain("### `/clean`");
  });

  it("renderMarkdownReport reports a green run when nothing drifted", () => {
    const md = renderMarkdownReport(
      [diffRouteHead(extractHead(fixtureHtml()), { path: "/pricing", metadata: FIXTURE_META })],
      { generatedAt: "2026-07-20T00:00:00.000Z", distDir: "/tmp/dist", missingFiles: [] },
    );
    expect(md).toContain("All checked routes match");
  });

  describe("global head invariants (robots, og:type, twitter handles)", () => {
    it("requires og:type=website on every pre-rendered route", () => {
      const html = fixtureHtml().replace(
        /<meta property="og:type"[^>]*>/,
        '<meta property="og:type" content="article" />',
      );
      const diff = diffRouteHead(extractHead(html), { path: "/pricing", metadata: FIXTURE_META });
      const field = diff.mismatched.find((f: any) => f.label.includes("og:type"));
      expect(field).toBeTruthy();
      expect(field!.expected).toBe("website");
      expect(field!.actual).toBe("article");
    });

    it("flags a missing og:type as a mismatch (not silently allowed)", () => {
      const html = fixtureHtml().replace(/<meta property="og:type"[^>]*>/, "");
      const diff = diffRouteHead(extractHead(html), { path: "/pricing", metadata: FIXTURE_META });
      expect(diff.mismatched.some((f: any) => f.label.includes("og:type") && f.actual === null)).toBe(
        true,
      );
    });

    it("requires an explicit robots directive on every route (default index, follow)", () => {
      const html = fixtureHtml().replace(/<meta name="robots"[^>]*>/, "");
      const diff = diffRouteHead(extractHead(html), { path: "/pricing", metadata: FIXTURE_META });
      const field = diff.mismatched.find((f: any) => f.label === 'meta name="robots"');
      expect(field).toBeTruthy();
      expect(field!.expected).toBe("index, follow");
      expect(field!.actual).toBe(null);
    });

    it("rejects robots values outside the allowed set", () => {
      const html = fixtureHtml({ robots: "none" });
      const diff = diffRouteHead(extractHead(html), { path: "/pricing", metadata: FIXTURE_META });
      // Both the equality check AND the allowed-values policy check fire.
      const policy = diff.mismatched.find((f: any) => f.label.includes("allowed values"));
      expect(policy).toBeTruthy();
      expect(policy!.actual).toBe("none");
    });

    it("accepts noindex, follow when the manifest opts in", () => {
      const html = fixtureHtml({ robots: "noindex, follow" });
      const diff = diffRouteHead(extractHead(html), {
        path: "/pricing",
        metadata: { ...FIXTURE_META, robots: "noindex, follow" },
      });
      expect(diff.ok).toBe(true);
    });

    it("asserts twitter:site and twitter:creator are absent while no handle is configured", () => {
      // Fixture omits both — invariant currently expects null on both.
      const diff = diffRouteHead(extractHead(fixtureHtml()), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const site = diff.fields.find((f: any) => f.label === 'meta name="twitter:site"');
      const creator = diff.fields.find((f: any) => f.label === 'meta name="twitter:creator"');
      expect(site?.ok).toBe(true);
      expect(creator?.ok).toBe(true);
      expect(site?.expected).toBe(null);
      expect(creator?.expected).toBe(null);
    });

    it("flags an unexpected twitter:creator tag as drift when no handle is configured", () => {
      const html = fixtureHtml().replace(
        "</head>",
        '<meta name="twitter:creator" content="@rogue_handle" /></head>',
      );
      const diff = diffRouteHead(extractHead(html), { path: "/pricing", metadata: FIXTURE_META });
      const creator = diff.mismatched.find((f: any) => f.label === 'meta name="twitter:creator"');
      expect(creator).toBeTruthy();
      expect(creator!.expected).toBe(null);
      expect(creator!.actual).toBe("@rogue_handle");
    });
  });

  describe("Schema.org JSON-LD invariants", () => {
    it("extractJsonLd parses every ld+json block on the page", () => {
      const blocks = extractJsonLd(fixtureHtml());
      expect(blocks).toHaveLength(1);
      expect(blocks[0].parseError).toBe(null);
      expect((blocks[0].parsed as any)["@type"]).toBe("SoftwareApplication");
    });

    it("extractJsonLd surfaces a parseError for malformed JSON without throwing", () => {
      const blocks = extractJsonLd(fixtureHtml({}, { jsonLd: "{not-json" }));
      expect(blocks).toHaveLength(1);
      expect(blocks[0].parsed).toBe(null);
      expect(typeof blocks[0].parseError).toBe("string");
    });

    it("flattenJsonLdNodes walks @graph containers", () => {
      const graph = {
        "@context": "https://schema.org",
        "@graph": [VALID_JSONLD, { "@type": "WebSite", url: "https://verdantgrowdiary.com" }],
      };
      const nodes = flattenJsonLdNodes(extractJsonLd(fixtureHtml({}, { jsonLd: graph })));
      expect(nodes.map((n: any) => n["@type"])).toEqual(["SoftwareApplication", "WebSite"]);
    });

    it("clean fixture passes every JSON-LD invariant", () => {
      const diff = diffRouteHead(extractHead(fixtureHtml()), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const jsonLdFields = diff.fields.filter((f: any) => f.label.startsWith("JSON-LD"));
      expect(jsonLdFields.length).toBeGreaterThan(0);
      expect(jsonLdFields.every((f: any) => f.ok)).toBe(true);
    });

    it("flags a route with no JSON-LD block at all", () => {
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: null })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const presence = diff.mismatched.find((f: any) => f.label.includes("present"));
      expect(presence).toBeTruthy();
      expect(presence!.ok).toBe(false);
      // The required SoftwareApplication node is also missing.
      expect(
        diff.mismatched.some((f: any) => f.label.includes('SoftwareApplication')),
      ).toBe(true);
    });

    it("flags a malformed JSON-LD block", () => {
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: "{oops" })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      expect(diff.mismatched.some((f: any) => f.label.includes("parses as JSON"))).toBe(true);
    });

    it("flags a missing @context on a JSON-LD root", () => {
      const { ["@context"]: _dropped, ...noContext } = VALID_JSONLD as any;
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: noContext })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      expect(
        diff.mismatched.some((f: any) => f.label.includes("@context includes schema.org")),
      ).toBe(true);
    });

    it("flags a drifted @id on the SoftwareApplication node", () => {
      const bad = { ...VALID_JSONLD, "@id": "https://verdantgrowdiary.com/#wrong" };
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: bad })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const field = diff.mismatched.find((f: any) =>
        f.label === "JSON-LD SoftwareApplication.@id",
      );
      expect(field).toBeTruthy();
      expect(field!.expected).toBe("https://verdantgrowdiary.com/#app");
      expect(field!.actual).toBe("https://verdantgrowdiary.com/#wrong");
    });

    it("flags a missing offer in the SoftwareApplication catalog", () => {
      const bad = {
        ...VALID_JSONLD,
        offers: VALID_JSONLD.offers.filter((o) => o.name !== "Founder Lifetime"),
      };
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: bad })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const field = diff.mismatched.find((f: any) =>
        f.label === "JSON-LD SoftwareApplication.offers[] names",
      );
      expect(field).toBeTruthy();
      expect(field!.actual).not.toContain("Founder Lifetime");
    });

    it("accepts a SoftwareApplication node nested under @graph", () => {
      const graph = {
        "@context": "https://schema.org",
        "@graph": [VALID_JSONLD],
      };
      const diff = diffRouteHead(extractHead(fixtureHtml({}, { jsonLd: graph })), {
        path: "/pricing",
        metadata: FIXTURE_META,
      });
      const jsonLdFields = diff.fields.filter((f: any) => f.label.startsWith("JSON-LD"));
      expect(jsonLdFields.every((f: any) => f.ok)).toBe(true);
    });
  });

  describe("attribute parser: mixed quotes and HTML entities", () => {
    it("parses single-quoted meta content when the value contains a double quote", () => {
      const html = `<!doctype html><html><head>
        <title>ok</title>
        <meta name='description' content='He said "hi" to growers' />
      </head></html>`;
      const head = extractHead(html);
      expect(head.metas.get("name:description")).toBe('He said "hi" to growers');
    });

    it("parses double-quoted meta content containing an apostrophe via entity", () => {
      const html = `<!doctype html><html><head>
        <title>ok</title>
        <meta name="description" content="Paddle&#39;s role as MoR" />
        <meta property="og:description" content="Paddle&apos;s role as MoR" />
        <meta name="twitter:description" content="Paddle&#x27;s role as MoR" />
      </head></html>`;
      const head = extractHead(html);
      expect(head.metas.get("name:description")).toBe("Paddle's role as MoR");
      expect(head.metas.get("property:og:description")).toBe("Paddle's role as MoR");
      expect(head.metas.get("name:twitter:description")).toBe("Paddle's role as MoR");
    });

    it("decodes &amp;, &quot;, &lt;, &gt;, &nbsp; in meta content", () => {
      const html = `<!doctype html><html><head><title>ok</title>
        <meta name="description" content="A &amp; B &quot;quoted&quot; &lt;tag&gt;&nbsp;end" />
      </head></html>`;
      const head = extractHead(html);
      expect(head.metas.get("name:description")).toBe('A & B "quoted" <tag>\u00a0end');
    });

    it("leaves unknown named entities intact so drift stays visible", () => {
      const html = `<!doctype html><html><head><title>ok</title>
        <meta name="description" content="unknown &fakeentity; here" />
      </head></html>`;
      const head = extractHead(html);
      expect(head.metas.get("name:description")).toBe("unknown &fakeentity; here");
    });

    it("handles unquoted attribute values", () => {
      const html = `<!doctype html><html><head><title>ok</title>
        <meta name=robots content=noindex,follow>
        <link rel=canonical href=https://verdantgrowdiary.com/x>
      </head></html>`;
      const head = extractHead(html);
      expect(head.metas.get("name:robots")).toBe("noindex,follow");
      expect(head.canonical).toBe("https://verdantgrowdiary.com/x");
    });

    it("tolerates whitespace and mixed quoting around attribute equals", () => {
      const html = `<!doctype html><html><head><title>ok</title>
        <meta  name = "og:title"   property = 'og:title'  content =  "Verdant &amp; Co" />
      </head></html>`;
      const head = extractHead(html);
      // name wins over property in our lookup order, but both should resolve.
      expect(head.metas.get("name:og:title")).toBe("Verdant & Co");
    });

    it("does not truncate content containing embedded apostrophes (Paddle regression)", () => {
      const html = fixtureHtml({
        description: "Paddle&#39;s role as Merchant of Record payment processor.",
      });
      const head = extractHead(html);
      expect(head.metas.get("name:twitter:description")).toBe(
        "Paddle's role as Merchant of Record payment processor.",
      );
      expect(head.metas.get("property:og:description")).toBe(
        "Paddle's role as Merchant of Record payment processor.",
      );
    });
  });
});
