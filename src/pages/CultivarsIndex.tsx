/**
 * CultivarsIndex — public /cultivars hub.
 *
 * Presenter only. Evergreen, curated cultivator-focused profiles. No live
 * grow diaries, no fake sensor data, no AI-picks-winners claims. Content
 * comes from `verdantCultivars` constants so copy cannot drift.
 *
 * Search + difficulty filter are URL-synced (?q=, ?difficulty=) so a
 * filtered view is directly deep-linkable and shareable.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  VERDANT_CULTIVARS,
  type VerdantCultivarProfile,
} from "@/constants/verdantCultivars";
import { buildCultivarsIndexSeo } from "@/lib/cultivarIndexSeoRules";

type DifficultyFilter = "all" | VerdantCultivarProfile["difficulty"];

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: DifficultyFilter; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "Beginner-friendly", label: "Beginner-friendly" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
];

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function matchesQuery(c: VerdantCultivarProfile, q: string): boolean {
  if (!q) return true;
  const needle = normalize(q);
  return (
    normalize(c.name).includes(needle) ||
    normalize(c.searchAlias).includes(needle) ||
    normalize(c.lineage).includes(needle) ||
    normalize(c.slug).includes(needle)
  );
}

export default function CultivarsIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Faceted filter URLs stay deep-linkable in the UI but must not create
  // indexable thin documents. Canonical + og:url always stay the clean hub.
  usePageSeo(buildCultivarsIndexSeo(searchParams));

  const rawQuery = searchParams.get("q") ?? "";
  const rawDifficulty = (searchParams.get("difficulty") ?? "all") as DifficultyFilter;
  const difficulty: DifficultyFilter = DIFFICULTY_OPTIONS.some((o) => o.value === rawDifficulty)
    ? rawDifficulty
    : "all";

  const updateParam = (key: "q" | "difficulty", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || (key === "difficulty" && value === "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const filtered = useMemo(
    () =>
      VERDANT_CULTIVARS.filter(
        (c) =>
          matchesQuery(c, rawQuery) &&
          (difficulty === "all" ? true : c.difficulty === difficulty),
      ),
    [rawQuery, difficulty],
  );

  const clearAll = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = rawQuery.trim().length > 0 || difficulty !== "all";

  return (
    <main
      data-testid="cultivars-index-page"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex w-full items-center justify-between gap-4 text-sm sm:w-auto sm:justify-start">
          <Link to="/welcome" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Cultivar Guides</h1>
          <p className="text-muted-foreground max-w-2xl">
            Evergreen profiles for serious home growers: environment ranges, flower windows,
            common issues, and what to compare when pheno-hunting. No live diaries, no rankings.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <label className="flex-1">
            <span className="sr-only">Search cultivars</span>
            <input
              type="search"
              value={rawQuery}
              onChange={(e) => updateParam("q", e.target.value)}
              placeholder="Search by name, alias, lineage…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="cultivar-search-input"
            />
          </label>
          <label>
            <span className="sr-only">Difficulty</span>
            <select
              value={difficulty}
              onChange={(e) => updateParam("difficulty", e.target.value)}
              className="w-full sm:w-auto rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="cultivar-difficulty-select"
            >
              {DIFFICULTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              data-testid="cultivar-clear-filters"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground" data-testid="cultivar-empty-state">
            No cultivars match those filters.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="cultivar-grid">
            {filtered.map((c) => (
              <li key={c.slug}>
                <Link
                  to={`/cultivars/${c.slug}`}
                  className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors h-full"
                >
                  <h2 className="font-medium text-lg mb-1">{c.name}</h2>
                  <p className="text-sm text-muted-foreground mb-2">{c.searchAlias}</p>
                  <p className="text-xs text-muted-foreground">{c.lineage}</p>
                  <p className="text-xs mt-2">
                    <span className="inline-block rounded bg-muted px-1.5 py-0.5">{c.difficulty}</span>
                    <span className="ml-2 text-muted-foreground">{c.flowerWeeks} flower</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
