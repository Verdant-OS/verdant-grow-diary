import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CultivarsIndex from "@/pages/CultivarsIndex";
import {
  buildCultivarsIndexSeo,
  CULTIVARS_INDEX_PATH,
  hasCultivarIndexQueryVariant,
} from "@/lib/cultivarIndexSeoRules";

const ORIGIN = "https://verdantgrowdiary.com";

afterEach(cleanup);

function renderCultivars(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CultivarsIndex />
    </MemoryRouter>,
  );
}

function headContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

describe("cultivarIndexSeoRules", () => {
  it("keeps the clean hub indexable", () => {
    expect(hasCultivarIndexQueryVariant("")).toBe(false);
    expect(hasCultivarIndexQueryVariant(null)).toBe(false);
    expect(hasCultivarIndexQueryVariant(undefined)).toBe(false);
    expect(hasCultivarIndexQueryVariant(new URLSearchParams())).toBe(false);
    expect(buildCultivarsIndexSeo()).toMatchObject({
      path: CULTIVARS_INDEX_PATH,
      noindex: false,
    });
  });

  it.each([
    "?q=oreoz",
    "?q=",
    "?difficulty=Advanced",
    "?difficulty=all",
    "?q=oreoz&difficulty=Advanced",
    "?difficulty=not-a-real-filter",
    "?utm_source=discord",
    "?q=%20oreoz%20",
    "q=oreoz",
    new URLSearchParams("q=&difficulty="),
  ])("marks %s as a non-indexable filter variant with a clean path", (search) => {
    expect(hasCultivarIndexQueryVariant(search)).toBe(true);

    const seo = buildCultivarsIndexSeo(search);
    expect(seo).toMatchObject({ path: CULTIVARS_INDEX_PATH, noindex: true });
    expect(seo.path).not.toMatch(/[?=&#]/);
  });
});

describe("CultivarsIndex crawl-safety wiring", () => {
  it("keeps the original accessible hub UI and indexable metadata for /cultivars", () => {
    renderCultivars("/cultivars");

    expect(screen.getByRole("search", { name: "Filter cultivar guides" })).toBeInTheDocument();
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByRole("link", { name: "grow-stage care guide" })).toHaveAttribute(
      "href",
      "/guides/grow-stage-care-guide",
    );
    expect(screen.getByRole("link", { name: "Pheno comparison" })).toHaveAttribute(
      "href",
      "/pheno-comparison",
    );

    expect(headContent('meta[name="robots"]')).toBe("index, follow");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/cultivars`,
    );
    expect(headContent('meta[property="og:url"]')).toBe(`${ORIGIN}/cultivars`);
  });

  it("sets noindex while canonical and og:url remain the clean hub for query variants", () => {
    renderCultivars("/cultivars?q=oreoz&difficulty=Advanced");

    expect(screen.getByRole("search", { name: "Filter cultivar guides" })).toBeInTheDocument();
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(headContent('meta[name="robots"]')).toBe("noindex, follow");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/cultivars`,
    );
    expect(headContent('meta[property="og:url"]')).toBe(`${ORIGIN}/cultivars`);
  });
});
