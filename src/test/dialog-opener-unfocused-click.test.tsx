/**
 * Safari does not focus a button on click. Escape must still return to that button.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com" },
    loading: false,
    session: null,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => ({
    results: [],
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  }),
}));

import GlobalSearchDialog from "@/components/GlobalSearchDialog";

function UnfocusedSearchHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="open-search-unfocused"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
      >
        Search
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

afterEach(cleanup);

describe("dialog opener restore without button focus", () => {
  it("returns focus to the clicked button after Escape", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UnfocusedSearchHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const opener = screen.getByTestId("open-search-unfocused");
    fireEvent.mouseDown(opener);
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);
    expect(await screen.findByTestId("global-search-input")).toBeInTheDocument();
    const target =
      document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    fireEvent.keyDown(target, { key: "Escape", code: "Escape" });
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(opener);
  });
});
