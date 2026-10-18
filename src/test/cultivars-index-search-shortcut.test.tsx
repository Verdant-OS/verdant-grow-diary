/**
 * /cultivars shows a Ctrl/Cmd K hint. The same chord must open the palette,
 * and must not fire while the grower is typing.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it } from "vitest";
import CultivarsIndex from "@/pages/CultivarsIndex";

function renderIndex() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/cultivars"]}>
        <CultivarsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("Cultivars index search shortcut", () => {
  it("opens global search on Ctrl+K from a non-typing target", () => {
    renderIndex();
    expect(screen.queryByTestId("global-search-input")).toBeNull();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("global-search-input")).toBeInTheDocument();
  });

  it("does not steal Ctrl+K while typing in an input", () => {
    renderIndex();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("global-search-input")).toBeNull();
    input.remove();
  });
});
