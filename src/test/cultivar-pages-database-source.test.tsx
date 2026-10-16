import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import {
  CULTIVAR_GUIDE_SECTION_KEYS,
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
} from "@/constants/strainReferenceLibrary";
import { CULTIVAR_REFERENCE_SOURCE_COPY } from "@/constants/cultivarReferenceSourceCopy";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";

const flags = vi.hoisted(() => ({ cultivarDatabaseReadsEnabled: true }));
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  failTable: null as string | null,
  calls: [] as string[],
}));

vi.mock("@/lib/featureFlags", () => ({ featureFlags: flags }));
vi.mock("@/integrations/supabase/client", () => {
  const respond = (table: string, rows: unknown[]) =>
    db.failTable === table
      ? { data: null, error: { message: "permission denied" } }
      : { data: rows, error: null };
  return {
    supabase: {
      from(table: string) {
        db.calls.push(`from:${table}`);
        const rows = db.tables[table] ?? [];
        return {
          select(columns: string) {
            db.calls.push(`select:${table}:${columns.length > 0}`);
            const result = respond(table, rows);
            return Object.assign(Promise.resolve(result), {
              eq(column: string, value: string) {
                db.calls.push(`eq:${table}:${column}`);
                return Promise.resolve(
                  respond(
                    table,
                    rows.filter((row) => (row as Record<string, unknown>)[column] === value),
                  ),
                );
              },
            });
          },
        };
      },
    },
  };
});

import CultivarPage from "@/pages/CultivarPage";
import CultivarsIndex from "@/pages/CultivarsIndex";
import { resetPublishedCultivarSnapshotCache } from "@/hooks/usePublishedCultivars";

function seedDatabase(mutate?: (tables: Record<string, Record<string, unknown>[]>) => void) {
  const snapshot = structuredClone(
    cultivarSeedPayloadToSnapshot(
      buildCultivarDatabaseSeedPayload({
        profiles: VERDANT_CULTIVARS,
        sources: CULTIVAR_SOURCES,
        sectionsFor: getCultivarGuideSections,
      }),
    ),
  ) as unknown as Record<string, Record<string, unknown>[]>;
  mutate?.(snapshot);
  db.tables = snapshot;
}

function renderDetail(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/cultivars/${slug}`]}>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
        <Route path="/cultivars" element={<div>Index fallback</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderIndex(entry = "/cultivars") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/cultivars" element={<CultivarsIndex />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sourceState = (testId: string) =>
  screen.getByTestId(testId).getAttribute("data-cultivar-source-state");

beforeEach(() => {
  flags.cultivarDatabaseReadsEnabled = true;
  db.failTable = null;
  db.calls = [];
  resetPublishedCultivarSnapshotCache();
  seedDatabase();
});
afterEach(cleanup);

describe("cultivar pages — database source", () => {
  it("renders the detail page from the database with every section, source, and the sample banner", async () => {
    // Mark the database copy so the test proves the page reads it.
    seedDatabase((tables) => {
      const row = tables.cultivars.find((item) => item.slug === "sour-stomper");
      if (row) row.description = "Database-served Sour Stomper intro.";
    });
    renderDetail("sour-stomper");
    expect(sourceState("cultivar-page")).toBe("loading");
    await waitFor(() => expect(sourceState("cultivar-page")).toBe("database"));

    expect(screen.getByText("Database-served Sour Stomper intro.")).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-reference-source-notice")).toHaveTextContent(
      CULTIVAR_REFERENCE_SOURCE_COPY.database,
    );
    expect(screen.getByTestId("cultivar-reference-banner")).toHaveTextContent(
      /sample reference data — not plant-specific advice/i,
    );
    for (const key of CULTIVAR_GUIDE_SECTION_KEYS) {
      expect(document.querySelector(`[data-guide-section="${key}"]`)).not.toBeNull();
    }
    const nav = screen.getByTestId("cultivar-sticky-section-nav");
    expect(within(nav).getAllByRole("link")).toHaveLength(CULTIVAR_GUIDE_SECTION_KEYS.length + 1);
    expect(screen.getByRole("link", { name: "Sour Stomper product information" })).toHaveAttribute(
      "href",
      "https://eu.mephistogenetics.com/products/sour-stomper",
    );
    expect(screen.getAllByText(/confidence/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Information limited").length).toBeGreaterThan(0);
  });

  it("issues SELECT-only reads with published filters", async () => {
    renderDetail("gg4");
    await waitFor(() => expect(sourceState("cultivar-page")).toBe("database"));
    expect(db.calls.every((call) => /^(from|select|eq):/.test(call))).toBe(true);
    expect(db.calls).toContain("eq:cultivars:publication_status");
    expect(db.calls).toContain("eq:cultivar_guides:publication_status");
  });

  it("falls back visibly to the bundled library when the database read fails", async () => {
    db.failTable = "cultivar_claims";
    renderDetail("gg4");
    await waitFor(() => expect(sourceState("cultivar-page")).toBe("error"));
    expect(screen.getByTestId("cultivar-reference-source-notice")).toHaveTextContent(
      CULTIVAR_REFERENCE_SOURCE_COPY.database_error,
    );
    // Bundled content, still labelled as sample reference data.
    expect(
      screen.getByRole("heading", { level: 1, name: "Original Glue (GG4)" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-reference-banner")).toHaveTextContent(
      /sample reference data/i,
    );
  });

  it("refuses malformed database rows and shows the bundled library instead", async () => {
    seedDatabase((tables) => {
      const row = tables.cultivars.find((item) => item.slug === "gg4");
      if (row) {
        row.verification_status = "verified";
        row.data_origin = "ai_draft";
      }
    });
    renderDetail("gg4");
    await waitFor(() => expect(sourceState("cultivar-page")).toBe("bundled_fallback"));
    expect(screen.getByTestId("cultivar-reference-source-notice")).toHaveTextContent(
      CULTIVAR_REFERENCE_SOURCE_COPY.database_invalid,
    );
    expect(screen.queryByText(/source-backed — not plant-specific advice/i)).toBeNull();
    expect(
      screen.getByText(/sample reference data — not plant-specific advice/i),
    ).toBeInTheDocument();
  });

  it("redirects an unknown slug deterministically in database mode", async () => {
    renderDetail("not-a-real-cultivar");
    await waitFor(() => expect(screen.getByText("Index fallback")).toBeInTheDocument());
  });

  it("keeps index filtering, alias search, and punctuation normalization on database rows", async () => {
    renderIndex("/cultivars?q=gorilla-glue%234");
    await waitFor(() => expect(sourceState("cultivars-index-page")).toBe("database"));
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent(
      "Showing 1 of 10 reference profiles",
    );
    expect(screen.getByRole("link", { name: /Original Glue \(GG4\)/ })).toBeInTheDocument();
    expect(screen.getByTestId("cultivar-reference-source-notice")).toHaveTextContent(
      CULTIVAR_REFERENCE_SOURCE_COPY.database,
    );
  });

  it("filters database rows by life cycle", async () => {
    renderIndex("/cultivars?lifeCycle=autoflower");
    await waitFor(() => expect(sourceState("cultivars-index-page")).toBe("database"));
    expect(screen.getByTestId("cultivars-index-result-count")).toHaveTextContent(
      "Showing 1 of 10 reference profiles",
    );
    expect(screen.getByRole("link", { name: /Sour Stomper/ })).toBeInTheDocument();
  });
});

describe("cultivar pages — release flag off (default)", () => {
  it("renders the bundled library, shows no notice, and makes no database request", async () => {
    flags.cultivarDatabaseReadsEnabled = false;
    renderIndex();
    renderDetail("blue-dream");
    expect(sourceState("cultivars-index-page")).toBe("bundled_fallback");
    expect(sourceState("cultivar-page")).toBe("bundled_fallback");
    expect(screen.queryByTestId("cultivar-reference-source-notice")).toBeNull();
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    expect(db.calls).toEqual([]);
  });
});
