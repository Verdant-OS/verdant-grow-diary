import { describe, expect, it } from "vitest";
import {
  buildOgCardSvg,
  categoryForPath,
  ogImageSlugForPath,
  wrapText,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/lib/build/ogImageCard";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

describe("ogImageSlugForPath", () => {
  it("returns 'home' for root and rejects non-absolute paths", () => {
    expect(ogImageSlugForPath("/")).toBe("home");
    expect(() => ogImageSlugForPath("welcome")).toThrow();
  });

  it("flattens nested paths with double dashes", () => {
    expect(ogImageSlugForPath("/founder")).toBe("founder");
    expect(ogImageSlugForPath("/guides/grow-stage-care-guide")).toBe(
      "guides--grow-stage-care-guide",
    );
    expect(ogImageSlugForPath("/cultivars/oreoz")).toBe("cultivars--oreoz");
  });

  it("produces unique slugs across all static SEO documents", () => {
    const slugs = STATIC_PUBLIC_SEO_DOCUMENTS.map((doc) => ogImageSlugForPath(doc.path));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("categoryForPath", () => {
  it("maps route families to human labels", () => {
    expect(categoryForPath("/founder")).toBe("Founder Lifetime");
    expect(categoryForPath("/pricing")).toBe("Pricing");
    expect(categoryForPath("/guides/grow-stage-care-guide")).toBe("Grower Guide");
    expect(categoryForPath("/cultivars/oreoz")).toBe("Cultivar Guide");
    expect(categoryForPath("/tools/vpd-calculator")).toBe("Free Tool");
    expect(categoryForPath("/privacy")).toBe("Legal");
  });
});

describe("wrapText", () => {
  it("splits text on word boundaries within budget", () => {
    const lines = wrapText("one two three four five six", 200, 30, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ").replace(/…$/, "")).toContain("one two");
  });

  it("ellipsizes when text exceeds line budget", () => {
    const long = Array(60).fill("word").join(" ");
    const lines = wrapText(long, 400, 40, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("hard-breaks oversize single words", () => {
    const lines = wrapText("supercalifragilisticexpialidocious", 100, 30, 3);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.length <= 100)).toBe(true);
  });
});

describe("buildOgCardSvg", () => {
  it("produces a valid SVG with correct viewport and escaped content", () => {
    const svg = buildOgCardSvg({
      title: 'Grow "smarter" & safer',
      description: "Sensor truth <not> hype",
      path: "/guides/vpd",
    });
    expect(svg).toContain(`width="${OG_IMAGE_WIDTH}"`);
    expect(svg).toContain(`height="${OG_IMAGE_HEIGHT}"`);
    expect(svg).toContain("&quot;smarter&quot;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;not&gt;");
    expect(svg).toContain("Grower Guide");
    expect(svg).toContain("verdantgrowdiary.com");
  });

  it("is deterministic for the same input", () => {
    const input = {
      title: "Verdant",
      description: "Plant memory.",
      path: "/welcome",
    };
    expect(buildOgCardSvg(input)).toBe(buildOgCardSvg(input));
  });

  it("renders every static SEO document without throwing", () => {
    for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(() =>
        buildOgCardSvg({
          title: doc.metadata.title,
          description: doc.metadata.description,
          path: doc.path,
        }),
      ).not.toThrow();
    }
  });
});
