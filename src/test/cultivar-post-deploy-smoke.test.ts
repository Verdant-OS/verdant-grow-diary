import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import { buildCultivarSeo, buildCultivarsIndexSeo } from "@/lib/cultivarSeoRules";
import {
  inspectRawCultivarHtml,
  readCanonicals,
  readMeta,
} from "../../scripts/seo/cultivar-post-deploy-smoke";

const INDEX = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function staticHtmlFor(seo: ReturnType<typeof buildCultivarsIndexSeo>, robots = "index, follow") {
  return buildStaticSocialRouteHtml(INDEX, {
    title: seo.title,
    description: seo.description,
    url: `https://verdantgrowdiary.com${seo.path}`,
    image: seo.ogImage,
    imageAlt: seo.ogImageAlt,
    robots: robots as "index, follow" | "noindex, follow",
    ogType: seo.ogType,
    imageWidth: seo.ogImageWidth,
    imageHeight: seo.ogImageHeight,
    imageType: seo.ogImageType,
  });
}

describe("cultivar post-deploy raw HTML inspection", () => {
  it("accepts complete non-JS metadata for the hub and every slug", () => {
    const descriptors = [buildCultivarsIndexSeo(), ...VERDANT_CULTIVARS.map(buildCultivarSeo)];
    for (const seo of descriptors) {
      const html = staticHtmlFor(seo);
      expect(inspectRawCultivarHtml(html, seo)).toEqual([]);
      expect(readCanonicals(html)).toEqual([`https://verdantgrowdiary.com${seo.path}`]);
      expect(readMeta(html, "property", "og:image")).toBe(seo.ogImage);
    }
  });

  it("accepts the static hub canonical for hydrated noindex filter variants", () => {
    const filtered = buildCultivarsIndexSeo("?q=oreoz&difficulty=Intermediate");
    const html = staticHtmlFor(filtered, "index, follow");
    expect(inspectRawCultivarHtml(html, filtered, { queryVariant: true })).toEqual([]);
  });

  it("fails when a deployed document leaks a conflicting canonical or OG URL", () => {
    const seo = buildCultivarSeo(VERDANT_CULTIVARS[0]);
    const html = staticHtmlFor(seo)
      .replace(
        `rel="canonical" href="https://verdantgrowdiary.com${seo.path}"`,
        'rel="canonical" href="https://verdantgrowdiary.com/"',
      )
      .replace(
        `property="og:url" content="https://verdantgrowdiary.com${seo.path}"`,
        'property="og:url" content="https://verdantgrowdiary.com/"',
      );
    const problems = inspectRawCultivarHtml(html, seo);
    expect(problems.some((problem) => problem.includes("canonical mismatch"))).toBe(true);
    expect(problems.some((problem) => problem.includes("og:url mismatch"))).toBe(true);
  });
});
