import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CultivarPage from "@/pages/CultivarPage";
import CultivarsIndex from "@/pages/CultivarsIndex";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildMissingCultivarCoverageState,
  formatMissingCultivarName,
} from "@/lib/cultivarCoverageEmptyStateRules";

const ORIGIN = "https://verdantgrowdiary.com";

function renderMissing(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/cultivars/${slug}`]}>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
        <Route path="/cultivars" element={<div>Unexpected redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderIndex(entry = "/cultivars") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <CultivarsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function headContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

beforeEach(() => {
  document.head.querySelectorAll("script[data-page-ldjson]").forEach((script) => script.remove());
});

afterEach(cleanup);

describe("missing cultivar coverage", () => {
  it("defensively formats only safe cultivar-shaped slugs", () => {
    expect(formatMissingCultivarName("future-cultivar-22")).toBe("Future Cultivar 22");
    expect(formatMissingCultivarName("%2Faccount")).toBeNull();
    expect(formatMissingCultivarName("bad%ZZslug")).toBeNull();
    expect(formatMissingCultivarName(`a${"x".repeat(81)}`)).toBeNull();
    expect(formatMissingCultivarName(null)).toBeNull();
    expect(buildMissingCultivarCoverageState("%2Faccount").title).toBe(
      "This cultivar is not in Verdant’s published library yet",
    );
  });

  it("renders a branded useful gap with a clean canonical and no schema", () => {
    renderMissing("future-cultivar");

    expect(screen.getByTestId("cultivar-missing-page")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Future Cultivar is not in Verdant’s published library yet",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unexpected redirect")).not.toBeInTheDocument();
    expect(screen.getByTestId("cultivar-coverage-link-browse")).toHaveAttribute(
      "href",
      "/cultivars",
    );
    expect(screen.getByTestId("cultivar-coverage-link-guide")).toHaveAttribute(
      "href",
      "/guides/grow-stage-care-guide",
    );
    expect(screen.getByTestId("cultivar-coverage-link-diary")).toHaveAttribute("href", "/timeline");

    expect(headContent('meta[name="robots"]')).toBe("noindex, follow");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/cultivars`,
    );
    expect(headContent('meta[property="og:url"]')).toBe(`${ORIGIN}/cultivars`);
    expect(document.head.querySelector("script[data-page-ldjson]")).toBeNull();
  });
});

describe("cultivar index crawl paths and zero-result recovery", () => {
  it("links every published card to its canonical /cultivars path", () => {
    const { container } = renderIndex();
    const published = VERDANT_CULTIVARS.filter(
      (cultivar) => cultivar.publicationStatus === "published",
    );

    for (const cultivar of published) {
      expect(container.querySelector(`a[href="/cultivars/${cultivar.slug}"]`)).not.toBeNull();
    }
    expect(container.querySelector('a[href^="/strains/"]')).toBeNull();
  }, 15_000);

  it("offers clear, browse, guide, and diary actions when filters return zero", async () => {
    renderIndex("/cultivars?q=definitely-unpublished-cultivar");

    expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent(
      `Showing 0 of ${VERDANT_CULTIVARS.length} reference profiles`,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No published cultivar profiles match this view",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-coverage-clear-filters")).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-coverage-link-browse")).toHaveAttribute(
      "href",
      "/cultivars",
    );
    expect(screen.getByTestId("cultivar-coverage-link-guide")).toHaveAttribute(
      "href",
      "/guides/grow-stage-care-guide",
    );
    expect(screen.getByTestId("cultivar-coverage-link-diary")).toHaveAttribute("href", "/timeline");

    fireEvent.click(screen.getByTestId("cultivar-coverage-clear-filters"));
    await waitFor(() =>
      expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent(
        `Showing all ${VERDANT_CULTIVARS.length} reference profiles`,
      ),
    );
  }, 15_000);
});
