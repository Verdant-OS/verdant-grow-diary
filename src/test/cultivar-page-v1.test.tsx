import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CultivarPage from "@/pages/CultivarPage";
import { CULTIVAR_GUIDE_SECTION_KEYS } from "@/constants/verdantCultivars";

function renderPage(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/cultivars/${slug}`]}>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
        <Route path="/cultivars" element={<div>Index fallback</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("Strain Reference Library V1 detail", () => {
  it("renders a complete sticky guide, source links, and sample boundary", () => {
    renderPage("sour-stomper");
    expect(screen.getByRole("heading", { level: 1, name: "Sour Stomper" })).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-reference-banner")).toHaveTextContent(
      /not plant-specific advice/i,
    );

    const nav = screen.getByTestId("cultivar-sticky-section-nav");
    for (const key of CULTIVAR_GUIDE_SECTION_KEYS) {
      expect(document.querySelector(`[data-guide-section="${key}"]`)).not.toBeNull();
    }
    expect(within(nav).getAllByRole("link").length).toBe(CULTIVAR_GUIDE_SECTION_KEYS.length + 1);
    expect(screen.getByText("Feminized")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sour Stomper product information" })).toHaveAttribute(
      "href",
      "https://eu.mephistogenetics.com/products/sour-stomper",
    );
  });

  it("states the no-alert/no-action boundary in the grow diary handoff", () => {
    renderPage("gg4");
    expect(screen.getByText(/reference pages never create alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/irrigation actions/i)).toBeInTheDocument();
    expect(screen.getByText(/equipment commands/i)).toBeInTheDocument();
  });

  it("redirects unknown slugs to the library", () => {
    renderPage("not-a-real-cultivar");
    expect(screen.getByText("Index fallback")).toBeInTheDocument();
  });
});
