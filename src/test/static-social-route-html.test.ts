import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FOUNDER_SOCIAL_META } from "@/constants/founderSocialMeta";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";

const INDEX_HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const pattern = new RegExp(
    `<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+content="([^"]+)"\\s*/?>`,
    "i",
  );
  return html.match(pattern)?.[1] ?? null;
}

describe("static social route HTML", () => {
  it("builds a complete Founder document for non-JavaScript link crawlers", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML, FOUNDER_SOCIAL_META);

    expect(html).toContain(`<title>${FOUNDER_SOCIAL_META.title}</title>`);
    expect(meta(html, "name", "description")).toBe(FOUNDER_SOCIAL_META.description);
    expect(meta(html, "property", "og:title")).toBe(FOUNDER_SOCIAL_META.title);
    expect(meta(html, "property", "og:description")).toBe(FOUNDER_SOCIAL_META.description);
    expect(meta(html, "property", "og:url")).toBe(FOUNDER_SOCIAL_META.url);
    expect(meta(html, "property", "og:image")).toBe(FOUNDER_SOCIAL_META.image);
    expect(meta(html, "property", "og:image:alt")).toBe(FOUNDER_SOCIAL_META.imageAlt);
    expect(meta(html, "name", "twitter:title")).toBe(FOUNDER_SOCIAL_META.title);
    expect(meta(html, "name", "twitter:description")).toBe(FOUNDER_SOCIAL_META.description);
    expect(meta(html, "name", "twitter:image")).toBe(FOUNDER_SOCIAL_META.image);
    expect(meta(html, "name", "robots")).toBe("index, follow");
    expect(html).toContain(`<link rel="canonical" href="${FOUNDER_SOCIAL_META.url}" />`);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/src/main.tsx"');
  });

  it("escapes metadata and fails closed when required tags are absent", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML, {
      ...FOUNDER_SOCIAL_META,
      title: 'Founder <safe> "title"',
    });
    expect(html).toContain("Founder &lt;safe&gt; &quot;title&quot;");
    expect(() => buildStaticSocialRouteHtml("<html></html>", FOUNDER_SOCIAL_META)).toThrow(
      /missing <\/head>/i,
    );
  });

  it("injects route JSON-LD without allowing HTML/script breakout", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML, {
      ...FOUNDER_SOCIAL_META,
      jsonLd: [{ "@type": "WebPage", name: "</script><script>alert(1)</script>" }],
    });

    expect(html).toContain('data-static-route-ldjson="true"');
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });

  it("strips prior static JSON-LD blocks to a fixed point (no reconstructed blocks)", () => {
    // Removing one marker block must never splice the surrounding text into a
    // NEW executable marker block that a single-pass replace would leave
    // behind (CodeQL js/incomplete-multi-character-sanitization): here the
    // outer block's closing tag is split around a complete inner block, so
    // deleting the inner block RECONSTRUCTS the outer one.
    const block = (body: string) =>
      `<script type="application/ld+json" data-static-route-ldjson="true">${body}</script>`;
    const spliced =
      `<script type="application/ld+json" data-static-route-ldjson="true">` +
      `{"outer":1}</scr${block('{"mid":2}')}ipt>`;
    const nested = INDEX_HTML.replace("</head>", `${spliced}\n  </head>`);

    const metadata = {
      ...FOUNDER_SOCIAL_META,
      jsonLd: [{ "@type": "WebPage", name: "fresh" }],
    };
    const html = buildStaticSocialRouteHtml(nested, metadata);

    // Neither stale payload survives, and exactly the one freshly injected
    // full block remains.
    expect(html).not.toContain('{"outer":1}');
    expect(html).not.toContain('{"mid":2}');
    const fullBlocks =
      html.match(
        /<script\s+type=["']application\/ld\+json["']\s+data-static-route-ldjson[^>]*>[\s\S]*?<\/script>/gi,
      ) ?? [];
    expect(fullBlocks.length).toBe(1);
    // And re-running stays deterministic.
    expect(buildStaticSocialRouteHtml(html, metadata)).toBe(html);
  });

  it("is deterministic and does not duplicate canonicals", () => {
    const first = buildStaticSocialRouteHtml(INDEX_HTML, FOUNDER_SOCIAL_META);
    const second = buildStaticSocialRouteHtml(first, FOUNDER_SOCIAL_META);
    expect(second).toBe(first);
    expect(second.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("can preserve a noindex redirect document without conflicting canonical signals", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML, {
      ...FOUNDER_SOCIAL_META,
      url: "https://verdantgrowdiary.com/cultivars",
      robots: "noindex, follow",
    });
    expect(meta(html, "name", "robots")).toBe("noindex, follow");
    expect(html).toContain('rel="canonical" href="https://verdantgrowdiary.com/cultivars"');
  });
});
