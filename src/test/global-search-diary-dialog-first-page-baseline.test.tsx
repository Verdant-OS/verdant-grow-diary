/**
 * Global search diary spec — first-page visibility hazard (requirement 7).
 *
 * Today the dialog shows only the first INITIAL_VISIBLE (10) composed rows while
 * private and cultivar reads can each return up to 20. An eleventh entity match
 * is hidden until "Show more". Diary rows appended after composition would suffer
 * the same squeeze unless the implementing slice reserves per-group first-page slots.
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

function elevenPlants(): PrivateSearchRow[] {
  return Array.from({ length: 11 }, (_, i) => ({
    entity_type: "plant" as const,
    id: `plant-${i}`,
    label: `Plant ${i}`,
    sublabel: "",
    match_kind: "exact" as const,
    rank: 0,
    score: 1,
  }));
}

beforeEach(() => {
  rpcSpy.mockClear();
  rpcImpl = async () => ({ data: elevenPlants(), error: null });
  clearGlobalSearchPrivateState();
});
afterEach(cleanup);

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

describe("global search diary dialog first-page baseline", () => {
  it("shows only ten entity rows initially when eleven private matches return", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("global-search-input"), {
      target: { value: "Plant" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("global-search-result-count")).toHaveTextContent(/11/),
    );

    const visibleItems = screen.getAllByTestId(/^global-search-item-plant-/);
    expect(visibleItems).toHaveLength(10);
    expect(screen.getByTestId("global-search-show-more")).toBeInTheDocument();
  });
});
