/**
 * QA walk bug 5: search results must not show match_kind or rank·score,
 * including in aria-labels. Diagnostics stay on data attributes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GlobalSearchResultPreview from "@/components/GlobalSearchResultPreview";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import type { GlobalSearchResult } from "@/lib/globalSearchResults";

const row: GlobalSearchResult = {
  entity_type: "tent",
  id: "tent-1",
  label: "North Tent",
  sublabel: "Flower room",
  match_kind: "prefix",
  rank: 1,
  score: 0.42,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [row], error: null })),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "owner-a" },
    session: { user: { id: "owner-a" } },
    signOut: vi.fn(),
  }),
}));

afterEach(cleanup);

function visibleText(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, " ");
}

function assertNoDebugAria(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll<HTMLElement>("[aria-label]")];
  for (const node of nodes) {
    const label = node.getAttribute("aria-label") ?? "";
    expect(label).not.toMatch(/r\d+·\d/);
    expect(label).not.toMatch(/rank/i);
    expect(label).not.toMatch(/score/i);
    expect(label).not.toMatch(/prefix/i);
  }
}

describe("global search hides debug tags", () => {
  it("does not show match kind or rank·score on the result preview", () => {
    render(
      <GlobalSearchResultPreview
        row={row}
        routePath="/grows/g1/tents/tent-1"
        query="north"
        onOpen={() => {}}
      />,
    );

    const preview = screen.getByTestId("global-search-preview");
    const text = visibleText(preview);
    expect(text).not.toMatch(/prefix/i);
    expect(text).not.toContain("r1·");
    expect(text).toContain("North Tent");

    const meta = screen.getByTestId("global-search-preview-match-kind");
    expect(meta).not.toHaveAttribute("aria-label");
    expect(meta).toHaveAttribute("data-match-kind", "prefix");
    expect(meta).toHaveAttribute("data-rank", "1");
    expect(meta).toHaveAttribute("data-score", "0.42");
    assertNoDebugAria(preview);
    expect(preview.getAttribute("aria-label")).toBe("Preview of Tent North Tent");
  });

  it("does not show match kind or rank·score on a dialog result", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GlobalSearchDialog open onOpenChange={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const input = screen.getByTestId("global-search-input");
    fireEvent.change(input, { target: { value: "north" } });

    const item = await waitFor(() => screen.getByTestId("global-search-item-tent-tent-1"), {
      timeout: 2000,
    });
    const text = visibleText(item);
    expect(text).not.toMatch(/prefix/i);
    expect(text).not.toContain("r1·");
    expect(text).toContain("North Tent");

    const meta = screen.getByTestId("global-search-item-meta-tent-tent-1");
    expect(meta).not.toHaveAttribute("aria-label");
    assertNoDebugAria(item);
    expect(meta).toHaveAttribute("data-match-kind", "prefix");
    expect(meta).toHaveAttribute("data-rank", "1");
    expect(meta).toHaveAttribute("data-score", "0.42");
  });
});
