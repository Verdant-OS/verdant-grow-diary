/**
 * ONE shared global-search surface — cultivar integration.
 *
 * Verifies that public bundled cultivar references join the private
 * owner-scoped RPC results in a single deterministic dialog without a second
 * command palette, without fetching private data client-side, and without ever
 * auto-linking plants.strain to a cultivar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  mergeGlobalSearchResults,
  searchCultivarReferences,
  type GlobalSearchResult,
  type PrivateSearchRow,
} from "@/lib/globalSearchResults";
import { growDetailPath, plantDetailPath, tentDetailPath } from "@/lib/routes";

// ---- supabase RPC mock (private owner-scoped verdant_search) ----------------
let rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
const rpcSpy = vi.fn((name: string, args: unknown) => rpcImpl(name, args));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (name: string, args: unknown) => rpcSpy(name, args) },
}));

function privateOk(rows: PrivateSearchRow[]) {
  rpcImpl = async () => ({ data: rows, error: null });
}
function privateFails() {
  rpcImpl = async () => ({ data: null, error: { message: "boom" } });
}

beforeEach(() => {
  rpcSpy.mockClear();
  privateOk([]);
});
afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <GlobalSearchDialog open onOpenChange={() => {}} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function type(value: string) {
  fireEvent.change(screen.getByTestId("global-search-input"), {
    target: { value },
  });
}

// ============================================================================
// Pure cultivar search over the bundled V1 constants
// ============================================================================
describe("searchCultivarReferences (public bundled cultivars)", () => {
  it("returns an exact cultivar result by name", () => {
    const rows = searchCultivarReferences(VERDANT_CULTIVARS, "Sour Diesel");
    expect(rows[0]).toMatchObject({
      entity_type: "cultivar",
      id: "sour-diesel",
      match_kind: "exact",
    });
  });

  it("resolves both GG4 and GG-4 to Original Glue", () => {
    for (const q of ["GG4", "GG-4"]) {
      const rows = searchCultivarReferences(VERDANT_CULTIVARS, q);
      expect(rows[0]?.id).toBe("gg4");
      expect(rows[0]?.label).toMatch(/Original Glue/i);
      expect(rows[0]?.match_kind).toBe("exact");
    }
  });

  it("matches on a distinct alias", () => {
    const rows = searchCultivarReferences(VERDANT_CULTIVARS, "Dosidos");
    expect(rows.some((r) => r.id === "do-si-dos")).toBe(true);
  });

  it("matches on breeder (not name/alias)", () => {
    const rows = searchCultivarReferences(VERDANT_CULTIVARS, "Sensi");
    expect(rows.some((r) => r.id === "jack-herer")).toBe(true);
  });

  it("never returns a duplicate cultivar (single row per slug)", () => {
    const rows = searchCultivarReferences(VERDANT_CULTIVARS, "gg4");
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic and rank-ordered", () => {
    const a = searchCultivarReferences(VERDANT_CULTIVARS, "o");
    const b = searchCultivarReferences(VERDANT_CULTIVARS, "o");
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].rank).toBeGreaterThanOrEqual(a[i - 1].rank);
    }
  });

  it("only ever emits cultivar-typed rows (never plant/strain linkage)", () => {
    const rows = searchCultivarReferences(VERDANT_CULTIVARS, "diesel");
    expect(rows.every((r) => r.entity_type === "cultivar")).toBe(true);
    // id is the public slug, never a private plant uuid.
    expect(rows.every((r) => VERDANT_CULTIVARS.some((c) => c.slug === r.id))).toBe(
      true,
    );
  });

  it("returns nothing for an empty query", () => {
    expect(searchCultivarReferences(VERDANT_CULTIVARS, "   ")).toEqual([]);
  });
});

// ============================================================================
// Pure deterministic merge of private + cultivar
// ============================================================================
describe("mergeGlobalSearchResults", () => {
  const priv: PrivateSearchRow[] = [
    { entity_type: "grow", id: "g1", label: "Alpha Grow", sublabel: "flower", match_kind: "exact", rank: 0, score: 1 },
    { entity_type: "plant", id: "p1", label: "Beta Plant", sublabel: "OG", match_kind: "exact", rank: 0, score: 0.9 },
    { entity_type: "grow", id: "g2", label: "Zeta Grow", sublabel: "veg", match_kind: "prefix", rank: 1, score: 0.8 },
  ];
  const cult: GlobalSearchResult[] = [
    { entity_type: "cultivar", id: "gg4", label: "Original Glue (GG4)", sublabel: "GG Strains LLC", match_kind: "exact", rank: 0, score: 1 },
  ];

  it("preserves private RPC ordering within each entity group", () => {
    const merged = mergeGlobalSearchResults(priv, cult);
    const grows = merged.filter((r) => r.entity_type === "grow").map((r) => r.id);
    expect(grows).toEqual(["g1", "g2"]);
  });

  it("is deterministic across calls", () => {
    expect(mergeGlobalSearchResults(priv, cult)).toEqual(
      mergeGlobalSearchResults(priv, cult),
    );
  });

  it("dedupes by entity_type + id", () => {
    const merged = mergeGlobalSearchResults([...priv, priv[0]], cult);
    expect(merged.filter((r) => r.id === "g1")).toHaveLength(1);
  });

  it("breaks equal-rank ties by entity group (grow→tent→plant→cultivar)", () => {
    const merged = mergeGlobalSearchResults(priv, cult);
    // Primary sort is match rank; within the same rank, group order is stable.
    const rank0 = merged.filter((r) => r.rank === 0).map((r) => r.entity_type);
    expect(rank0).toEqual(["grow", "plant", "cultivar"]);
  });
});

// ============================================================================
// Dialog integration — one palette, private via RPC, public cultivars merged
// ============================================================================
describe("GlobalSearchDialog integration", () => {
  it("shows an exact grow from the RPC and navigates to its detail route", async () => {
    privateOk([
      { entity_type: "grow", id: "grow-123", label: "Tent A Summer", sublabel: "flower", match_kind: "exact", rank: 0, score: 1 },
    ]);
    renderDialog();
    type("Tent A Summer");
    const item = await screen.findByTestId("global-search-item-grow-grow-123");
    fireEvent.click(item);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        growDetailPath("grow-123"),
      ),
    );
  });

  it("shows an exact tent and navigates to its detail route", async () => {
    privateOk([
      { entity_type: "tent", id: "tent-9", label: "4x4 Flower", sublabel: "AC Infinity", match_kind: "exact", rank: 0, score: 1 },
    ]);
    renderDialog();
    type("4x4 Flower");
    fireEvent.click(await screen.findByTestId("global-search-item-tent-tent-9"));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        tentDetailPath("tent-9"),
      ),
    );
  });

  it("shows a plant matched by strain (owner-scoped via RPC) and navigates", async () => {
    privateOk([
      { entity_type: "plant", id: "plant-7", label: "Plant 7", sublabel: "Blue Dream", match_kind: "fuzzy", rank: 2, score: 0.3 },
    ]);
    renderDialog();
    type("Blue Dream");
    fireEvent.click(await screen.findByTestId("global-search-item-plant-plant-7"));
    // Private plant results come from the owner-scoped RPC only.
    expect(rpcSpy).toHaveBeenCalledWith("verdant_search", expect.objectContaining({ q: "Blue Dream" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        plantDetailPath("plant-7"),
      ),
    );
  });

  it("shows an exact cultivar (from bundled constants) and navigates to /cultivars/:slug", async () => {
    privateOk([]);
    renderDialog();
    type("OG Kush");
    const item = await screen.findByTestId("global-search-item-cultivar-og-kush");
    fireEvent.click(item);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/cultivars/og-kush"),
    );
  });

  it("resolves GG-4 to the Original Glue cultivar in the dialog", async () => {
    privateOk([]);
    renderDialog();
    type("GG-4");
    expect(await screen.findByTestId("global-search-item-cultivar-gg4")).toHaveTextContent(
      /Original Glue/i,
    );
  });

  it("never renders a private plant item from a cultivar match (no auto strain linking)", async () => {
    privateOk([]);
    renderDialog();
    type("Sour Diesel");
    await screen.findByTestId("global-search-item-cultivar-sour-diesel");
    expect(
      screen.queryByTestId("global-search-item-plant-sour-diesel"),
    ).toBeNull();
  });

  it("renders a distinct Cultivars group after the private groups", async () => {
    privateOk([
      { entity_type: "grow", id: "grow-x", label: "OG Room", sublabel: "flower", match_kind: "fuzzy", rank: 2, score: 0.3 },
    ]);
    renderDialog();
    type("OG");
    await screen.findByTestId("global-search-item-cultivar-og-kush");
    const grows = screen.getByText("Grows");
    const cultivars = screen.getByText("Cultivars");
    // Distinct group headings, cultivars after private groups in the DOM.
    expect(grows).toBeInTheDocument();
    expect(
      grows.compareDocumentPosition(cultivars) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not present a private search failure as a verified empty result", async () => {
    privateFails();
    renderDialog();
    type("Blue Dream");
    // Public cultivar still resolves; the error notice shows; no false 'no matches'.
    await screen.findByTestId("global-search-item-cultivar-blue-dream");
    expect(screen.getByTestId("global-search-error")).toBeInTheDocument();
    expect(screen.queryByText(/no matches/i)).toBeNull();
  });

  it("shows a genuine empty state only when the query truly matches nothing", async () => {
    privateOk([]);
    renderDialog();
    type("zzzzznotarealthing");
    await waitFor(() =>
      expect(screen.getByText(/no matches/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("global-search-error")).toBeNull();
  });
});
