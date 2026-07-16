import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import CultivarPage from "@/pages/CultivarPage";
import CultivarsIndex from "@/pages/CultivarsIndex";

const ORIGIN = "https://verdantgrowdiary.com";

function renderCultivarRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cultivars" element={<CultivarsIndex />} />
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function meta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

function expectSingleCanonical(href: string) {
  const canonicals = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')];
  expect(canonicals.map((canonical) => canonical.href)).toEqual([href]);
}

afterEach(cleanup);

describe("cultivar route metadata", () => {
  it("emits one indexable canonical for the unfiltered hub", () => {
    renderCultivarRoute("/cultivars");
    expectSingleCanonical(`${ORIGIN}/cultivars`);
    expect(meta('meta[name="robots"]')).toBe("index, follow");
    expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/cultivars`);
    expect(meta('meta[property="og:image"]')).toBe(`${ORIGIN}/og/cultivars/index.png`);
    expect(meta('meta[property="og:image:width"]')).toBe("1200");
    expect(meta('meta[property="og:image:height"]')).toBe("630");
    expect(meta('meta[property="og:image:type"]')).toBe("image/png");
  });

  for (const search of [
    "?q=oreoz",
    "?difficulty=Intermediate",
    "?q=cookies&difficulty=Beginner-friendly",
    "?difficulty=Advanced&q=gas",
  ]) {
    it(`${search} keeps one hub canonical and emits noindex/follow`, () => {
      renderCultivarRoute(`/cultivars${search}`);
      expectSingleCanonical(`${ORIGIN}/cultivars`);
      expect(meta('meta[name="robots"]')).toBe("noindex, follow");
      expect(meta('meta[property="og:url"]')).toBe(`${ORIGIN}/cultivars`);
      expect(meta('meta[property="og:title"]')).toContain("Cannabis Cultivar Guides");
    });
  }

  for (const cultivar of VERDANT_CULTIVARS) {
    it(`/${cultivar.slug} emits complete slug-specific metadata`, () => {
      renderCultivarRoute(`/cultivars/${cultivar.slug}`);
      const canonical = `${ORIGIN}/cultivars/${cultivar.slug}`;
      expectSingleCanonical(canonical);
      expect(document.title).toContain(cultivar.name);
      expect(meta('meta[name="robots"]')).toBe("index, follow");
      expect(meta('meta[property="og:url"]')).toBe(canonical);
      expect(meta('meta[property="og:type"]')).toBe("article");
      expect(meta('meta[property="og:image"]')).toBe(`${ORIGIN}/og/cultivars/${cultivar.slug}.png`);
      expect(meta('meta[property="og:image:alt"]')).toContain(cultivar.name);
      expect(meta('meta[name="twitter:image"]')).toBe(
        `${ORIGIN}/og/cultivars/${cultivar.slug}.png`,
      );
      expect(meta('meta[name="twitter:image:alt"]')).toContain(cultivar.name);
    });
  }
});
