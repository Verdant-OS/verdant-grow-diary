/**
 * Global search diary spec — first-page visibility hazard (requirement 7).
 *
 * Entity and cultivar reads can return up to 20 rows each while the dialog
 * shows only INITIAL_VISIBLE (10) until "Show more". Diary matches appended
 * after merge would sit off the first page unless the implementing slice
 * reserves slots per group.
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

function makePlants(count: number): PrivateSearchRow[] {
  return Array.from({ length: count }, (_, index) => ({
    entity_type: "plant",
    id: `plant-${index}`,
    label: `Plant ${index}`,
    sublabel: "",
    match_kind: "fuzzy" as const,
    rank: 2,
    score: 0.5,
  }));
}

beforeEach(() => {
  rpcSpy.mockClear();
  rpcImpl = async () => ({ data: makePlants(12), error: null });
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
  it("shows only ten entity rows initially when verdant_search returns twelve", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("global-search-input"), {
      target: { value: "plant" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("global-search-item-plant-plant-0")).toBeTruthy(),
    );

    const visibleItems = screen.getAllByTestId(/^global-search-item-plant-plant-/);
    expect(visibleItems).toHaveLength(10);
    expect(screen.getByTestId("global-search-show-more-wrapper")).toBeTruthy();
    expect(rpcSpy).toHaveBeenCalledWith(
      "verdant_search",
      expect.objectContaining({ max_results: 20 }),
    );
  });
});
