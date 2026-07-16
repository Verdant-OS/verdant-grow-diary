import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildCultivarOpenGraphCard,
  buildCultivarOpenGraphSvg,
  CULTIVARS_INDEX_OPEN_GRAPH_CARD,
} from "@/lib/build/cultivarOpenGraphImage";

describe("cultivar OpenGraph image template", () => {
  it("renders the index card at the social-preview dimensions", () => {
    const svg = buildCultivarOpenGraphSvg(CULTIVARS_INDEX_OPEN_GRAPH_CARD);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("Cultivar Guides");
    expect(svg).toContain("Plant memory");
  });

  it("renders unique slug-specific text from every curated profile", () => {
    const svgs = VERDANT_CULTIVARS.map((cultivar) => {
      const card = buildCultivarOpenGraphCard(cultivar);
      const svg = buildCultivarOpenGraphSvg(card);
      expect(svg).toContain(cultivar.name);
      expect(svg).toContain(cultivar.flowerWeeks);
      expect(svg).toContain(cultivar.difficulty);
      expect(svg).not.toMatch(/<script|javascript:/i);
      return svg;
    });
    expect(new Set(svgs).size).toBe(VERDANT_CULTIVARS.length);
  });

  it("escapes text before placing it in SVG", () => {
    const svg = buildCultivarOpenGraphSvg({
      eyebrow: "A&B",
      name: "<unsafe>",
      lineage: 'Lineage: "quoted"',
      detail: "safe",
    });
    expect(svg).toContain("A&amp;B");
    expect(svg).toContain("&lt;unsafe&gt;");
    expect(svg).toContain("&quot;quoted&quot;");
    expect(svg).not.toContain("<unsafe>");
  });

  it("wraps long lineage text before the card artwork boundary", () => {
    const cultivar = VERDANT_CULTIVARS.find(({ slug }) => slug === "do-si-dos");
    expect(cultivar).toBeDefined();

    const svg = buildCultivarOpenGraphSvg(buildCultivarOpenGraphCard(cultivar!));
    expect(svg).toContain(
      '<tspan x="108" dy="0">Lineage: OGKB (Girl Scout Cookies phenotype) ×</tspan>',
    );
    expect(svg).toContain('<tspan x="108" dy="36">Face Off OG</tspan>');
  });
});
