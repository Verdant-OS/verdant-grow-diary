import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import CultivarsIndex from "@/pages/CultivarsIndex";

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

afterEach(cleanup);

describe("Strain Reference Library V1 index", () => {
  it("shows the sample-data boundary and all ten profiles", () => {
    const { container } = renderIndex();
    expect(
      screen.getByRole("heading", { name: /source-backed cultivar profiles/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-sample-banner")).toHaveTextContent(
      /sample reference data/i,
    );
    expect(screen.getByText("Sample reference data — not a universal grow recipe")).toHaveClass(
      "text-amber-200",
    );
    expect(container.querySelectorAll("span.text-amber-200")).toHaveLength(10);
    expect(container.querySelector(".text-amber-800")).toBeNull();
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent(
      "Showing all 10 reference profiles",
    );
    expect(screen.getByRole("link", { name: /Sour Diesel/i })).toHaveAttribute(
      "href",
      "/cultivars/sour-diesel",
    );
  }, 15_000);

  it("finds GG4 by legacy alias through the shared pure search rules", () => {
    renderIndex("/cultivars?q=Gorilla%20Glue%20%234");
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent("Showing 1 of 10");
    expect(screen.getByRole("link", { name: /Original Glue \(GG4\)/i })).toBeInTheDocument();
  });

  it("filters lifecycle without hiding the clear state", () => {
    renderIndex();
    fireEvent.change(screen.getByLabelText("Life cycle"), { target: { value: "autoflower" } });
    expect(screen.getByRole("link", { name: /Sour Stomper/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Blue Dream/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});
