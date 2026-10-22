/**
 * Global search — spec baseline before diary-entry search.
 *
 * Spec: docs/specs/global-search-diary-entries.md (proposed, PR #2351).
 * Locks documented pre-implementation behaviour so the implementing slice cannot
 * regress navigation keywords, the private RPC-only path, or merge entity groups
 * without an explicit test update.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { GLOBAL_SEARCH_ITEMS } from "@/lib/globalSearchItems";
import {
  mergeGlobalSearchResults,
  type GlobalSearchEntityType,
  type GlobalSearchResult,
  type PrivateSearchRow,
} from "@/lib/globalSearchResults";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

const KNOWN_ENTITY_TYPES: GlobalSearchEntityType[] = ["grow", "tent", "plant", "cultivar"];

let rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
const rpcSpy = vi.fn((name: string, args: unknown) => rpcImpl(name, args));
const fromSpy = vi.fn((_table: string) => {
  throw new Error("diary_entries client read is not implemented in this baseline");
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcSpy(name, args),
    from: fromSpy,
  },
}));

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  rpcSpy.mockClear();
  fromSpy.mockClear();
  rpcImpl = async () => ({ data: [], error: null });
});

afterEach(() => {
  clearGlobalSearchPrivateState();
});

describe("global search diary spec baseline — navigation keywords", () => {
  it('matches "diary" only on the Quick Log navigation item, not as entry search', () => {
    const withDiaryKeyword = GLOBAL_SEARCH_ITEMS.filter((item) =>
      (item.keywords ?? []).some((k) => k.toLowerCase() === "diary"),
    );
    expect(withDiaryKeyword).toHaveLength(1);
    expect(withDiaryKeyword[0]).toMatchObject({
      label: "Quick Log",
      to: "/daily-check",
    });
  });
});

describe("global search diary spec baseline — merge entity groups", () => {
  it("merges only grow, tent, plant, and cultivar rows (no diary entity yet)", () => {
    const priv: PrivateSearchRow[] = [
      {
        entity_type: "grow",
        id: "g1",
        label: "Alpha",
        sublabel: "",
        match_kind: "exact",
        rank: 0,
        score: 1,
      },
    ];
    const cult: GlobalSearchResult[] = [
      {
        entity_type: "cultivar",
        id: "og-kush",
        label: "OG Kush",
        sublabel: "",
        match_kind: "exact",
        rank: 0,
        score: 1,
      },
    ];
    const merged = mergeGlobalSearchResults(priv, cult);
    const allowed = new Set<string>(KNOWN_ENTITY_TYPES);
    for (const row of merged) {
      expect(allowed.has(row.entity_type)).toBe(true);
    }
    expect(merged.some((row) => row.entity_type === ("diary" as GlobalSearchEntityType))).toBe(
      false,
    );
  });
});

describe("global search diary spec baseline — useGlobalSearch private path", () => {
  it("queries verdant_search via RPC only and never reads diary_entries", async () => {
    rpcImpl = async () => ({
      data: [
        {
          entity_type: "plant",
          id: "p1",
          label: "Yellow leaves",
          sublabel: "",
          match_kind: "fuzzy",
          rank: 2,
          score: 0.5,
        },
      ] satisfies PrivateSearchRow[],
      error: null,
    });

    const { result } = renderHook(() => useGlobalSearch("yellow"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcSpy).toHaveBeenCalledWith(
      "verdant_search",
      expect.objectContaining({ q: "yellow", max_results: 20 }),
    );
    expect(fromSpy).not.toHaveBeenCalled();
    expect(result.current.results.some((r) => r.entity_type === "plant")).toBe(true);
  });

  it("does not retain private results after the private-state epoch clears", async () => {
    rpcImpl = async () => ({
      data: [
        {
          entity_type: "tent",
          id: "t1",
          label: "Flower tent",
          sublabel: "",
          match_kind: "exact",
          rank: 0,
          score: 1,
        },
      ] satisfies PrivateSearchRow[],
      error: null,
    });

    const { result, rerender } = renderHook(({ q }) => useGlobalSearch(q), {
      wrapper: createWrapper(),
      initialProps: { q: "flower" },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0));

    act(() => {
      clearGlobalSearchPrivateState();
    });
    rerender({ q: "" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(result.current.results).toEqual([]);
  });
});
