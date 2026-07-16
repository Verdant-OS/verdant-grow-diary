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
  usePageSeo({
    title: "Cannabis Cultivar Guides — Oreoz, Do-Si-Dos, Blue Cookies Strain Info | Verdant",
    description:
      "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.",
    path: "/cultivars",
  });

  const [searchParams, setSearchParams] = useSearchParams();
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
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
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

      <section className="px-6 pt-8 pb-6 max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          Cultivar guides
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tight">
          Cannabis cultivar guides for serious home growers
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Practical, evergreen profiles for popular cannabis cultivars — often
          called strains. Each page covers lineage, flower window, environment
          ranges by stage, common issues home growers report, and the
          evidence points that matter when running a Pheno Hunt. No cherry-picked
          diary photos, no guaranteed-yield claims, no AI picking winners for you.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Verdant is a grow diary and Pheno Hunt tool. It records what you did
          and what changed; it does not control your equipment.
        </p>
      </section>

      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl font-semibold mb-4">Featured cultivars</h2>

        <form
          role="search"
          aria-label="Filter cultivar guides"
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="flex-1">
            <label
              htmlFor="cultivar-search"
              className="block text-xs uppercase tracking-wide text-muted-foreground mb-1"
            >
              Search
            </label>
            <input
              id="cultivar-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Try “Oreoz”, “cookies”, “blueberry”…"
              value={rawQuery}
              onChange={(e) => updateParam("q", e.target.value)}
              className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
          <div className="sm:w-56">
            <label
              htmlFor="cultivar-difficulty"
              className="block text-xs uppercase tracking-wide text-muted-foreground mb-1"
            >
              Difficulty
            </label>
            <select
              id="cultivar-difficulty"
              value={difficulty}
              onChange={(e) => updateParam("difficulty", e.target.value)}
              className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {DIFFICULTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="min-h-[44px] rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40"
            >
              Clear
            </button>
          ) : null}
        </form>

        <p
          className="mb-3 text-xs text-muted-foreground"
          aria-live="polite"
          data-testid="cultivars-index-result-count"
        >
          {filtered.length === VERDANT_CULTIVARS.length
            ? `Showing all ${VERDANT_CULTIVARS.length} cultivars`
            : `Showing ${filtered.length} of ${VERDANT_CULTIVARS.length} cultivars`}
        </p>

        {filtered.length === 0 ? (
          <div
            data-testid="cultivars-index-empty"
            className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground"
          >
            No cultivar guides match those filters yet. Try clearing the search
            or picking a different difficulty — the library is small and
            curated on purpose.
          </div>
        ) : (
          <ul className="space-y-4">
            {filtered.map((c) => (
              <li
                key={c.slug}
                className="rounded-lg border border-border/60 p-4 hover:border-primary/40 transition-colors"
              >
                <Link to={`/cultivars/${c.slug}`} className="block">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-semibold text-lg">{c.name}</h3>
                    <span className="text-xs text-muted-foreground">{c.flowerWeeks}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lineage: {c.lineage} · {c.difficulty}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{c.intro}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          Looking for stage-by-stage checklists? See the{" "}
          <Link to="/guides/grow-stage-care-guide" className="underline hover:text-foreground">
            grow-stage care guide
          </Link>
          . Comparing keepers across a run? See{" "}
          <Link to="/pheno-comparison" className="underline hover:text-foreground">
            Pheno comparison
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
