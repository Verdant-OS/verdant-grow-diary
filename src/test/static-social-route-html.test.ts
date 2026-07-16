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

  it("is deterministic and does not duplicate canonicals", () => {
    const first = buildStaticSocialRouteHtml(INDEX_HTML, FOUNDER_SOCIAL_META);
    const second = buildStaticSocialRouteHtml(first, FOUNDER_SOCIAL_META);
    expect(second).toBe(first);
    expect(second.match(/rel="canonical"/g)).toHaveLength(1);
  });
});
