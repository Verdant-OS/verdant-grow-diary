/**
 * Global search diary spec — first-page visibility baseline (requirement 7).
 *
 * The dialog shows only the first INITIAL_VISIBLE rows while the private RPC
 * can return up to MAX_RESULTS. Diary matches appended after entity rows would
 * be hidden behind "Show more" unless the implementing slice reserves slots.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import type { PrivateSearchRow } from "@/lib/globalSearchResults";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

let rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
const rpcSpy = vi.fn((name: string, args: unknown) => rpcImpl(name, args));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (name: string, args: unknown) => rpcSpy(name, args) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "owner-a" },
    session: { user: { id: "owner-a" } },
    signOut: vi.fn(),
  }),
}));

function manyGrowRows(count: number): PrivateSearchRow[] {
  return Array.from({ length: count }, (_, i) => ({
    entity_type: "grow" as const,
    id: `grow-${i}`,
    label: `Yellow grow ${i}`,
    sublabel: "",
    match_kind: "exact" as const,
    rank: 0,
    score: 1,
  }));
}

beforeEach(() => {
  rpcSpy.mockClear();
  window.sessionStorage.clear();
  rpcImpl = async () => ({ data: manyGrowRows(15), error: null });
});

afterEach(() => {
  cleanup();
  clearGlobalSearchPrivateState();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <GlobalSearchDialog open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("global search diary first-page baseline", () => {
  it("requests up to 20 private rows but renders only 10 before Show more", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("global-search-input"), {
      target: { value: "yellow" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-count")).toHaveTextContent("15 results");
    });

    expect(rpcSpy).toHaveBeenCalledWith(
      "verdant_search",
      expect.objectContaining({ q: "yellow", max_results: 20 }),
    );

    const visibleGrowItems = screen.getAllByTestId(/^global-search-item-grow-grow-/);
    expect(visibleGrowItems).toHaveLength(10);

    expect(screen.getByTestId("global-search-show-more")).toHaveTextContent("Show 5 more");
    expect(screen.getByTestId("global-search-show-more-wrapper")).toHaveTextContent(
      "5 more results available",
    );
  });
});
