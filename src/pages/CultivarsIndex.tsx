/**
 * Public Strain Reference Library V1 at the canonical /cultivars route.
 *
 * Mobile-first presenter. Search/filter rules are pure and shared; cards render
 * labeled sample/reference data only. No private grow reads or writes.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  VERDANT_CULTIVARS,
  formatVerificationStatus,
  type CultivarDifficulty,
  type CultivarLifeCycle,
  type CultivarVerificationStatus,
} from "@/constants/verdantCultivars";
import { buildCultivarsIndexSeo } from "@/lib/cultivarIndexSeoRules";
import { filterCultivarReferenceProfiles } from "@/lib/cultivarReferenceSearchRules";

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: "all" | CultivarDifficulty; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "Beginner-friendly", label: "Beginner-friendly" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
];

const LIFE_CYCLE_OPTIONS: ReadonlyArray<{ value: "all" | CultivarLifeCycle; label: string }> = [
  { value: "all", label: "All life cycles" },
  { value: "photoperiod", label: "Photoperiod" },
  { value: "autoflower", label: "Autoflower" },
];

const VERIFICATION_OPTIONS: ReadonlyArray<{
  value: "all" | CultivarVerificationStatus;
  label: string;
}> = [
  { value: "all", label: "All evidence states" },
  { value: "sample", label: "Sample reference data" },
  { value: "community", label: "Community-supported" },
  { value: "reviewed", label: "Verdant reviewed" },
  { value: "verified", label: "Source-backed" },
];

function validOption<T extends string>(
  value: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  fallback: T,
): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

export default function CultivarsIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  usePageSeo(buildCultivarsIndexSeo(searchParams));

  const query = searchParams.get("q") ?? "";
  const difficulty = validOption(
    searchParams.get("difficulty") ?? "all",
    DIFFICULTY_OPTIONS,
    "all",
  );
  const lifeCycle = validOption(
    searchParams.get("lifeCycle") ?? "all",
    LIFE_CYCLE_OPTIONS,
    "all",
  );
  const verificationStatus = validOption(
    searchParams.get("verification") ?? "all",
    VERIFICATION_OPTIONS,
    "all",
  );

  const updateParam = (key: string, value: string, emptyValue = "all") => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === emptyValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const filtered = useMemo(
    () =>
      filterCultivarReferenceProfiles(VERDANT_CULTIVARS, {
        query,
        difficulty,
        lifeCycle,
        verificationStatus,
      }),
    [difficulty, lifeCycle, query, verificationStatus],
  );

  const hasFilters =
    query.trim().length > 0 ||
    difficulty !== "all" ||
    lifeCycle !== "all" ||
    verificationStatus !== "all";

  return (
    <main data-testid="cultivars-index-page" className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-6">
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

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/80">
          Strain Reference Library
        </p>
        <h1 className="mt-3 max-w-4xl font-display text-3xl font-bold tracking-tight md:text-5xl">
          Source-backed cultivar profiles and reported grow tendencies
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
          The library supplies a hypothesis. Your plant&apos;s logs, source-labeled sensors, medium,
          stage, and observed response supply the truth.
        </p>

        <div
          data-testid="cultivar-sample-banner"
          className="mt-6 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-semibold text-amber-800 dark:text-amber-200">
            Sample reference data — not a universal grow recipe
          </p>
          <p className="mt-1 text-muted-foreground">
            Every profile shows sources, confidence, and missing information. No profile controls
            equipment, creates alerts, or overrides the grower&apos;s plant history.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <form
          role="search"
          aria-label="Filter cultivar guides"
          className="grid gap-3 rounded-xl border border-border/60 bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="cultivar-search" className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <input
              id="cultivar-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Name, alias, breeder, or lineage…"
              value={query}
              onChange={(event) => updateParam("q", event.target.value, "")}
              className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>

          <div>
            <label htmlFor="cultivar-difficulty" className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Difficulty
            </label>
            <select
              id="cultivar-difficulty"
              value={difficulty}
              onChange={(event) => updateParam("difficulty", event.target.value)}
              className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cultivar-life-cycle" className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Life cycle
            </label>
            <select
              id="cultivar-life-cycle"
              value={lifeCycle}
              onChange={(event) => updateParam("lifeCycle", event.target.value)}
              className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {LIFE_CYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cultivar-verification" className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Evidence state
            </label>
            <select
              id="cultivar-verification"
              value={verificationStatus}
              onChange={(event) => updateParam("verification", event.target.value)}
              className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {VERIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
              className="min-h-[44px] rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground sm:col-span-2 lg:col-span-4 lg:justify-self-start"
            >
              Clear filters
            </button>
          ) : null}
        </form>

        <p
          className="mb-4 mt-5 text-sm text-muted-foreground"
          aria-live="polite"
          data-testid="cultivars-index-result-count"
        >
          {filtered.length === VERDANT_CULTIVARS.length
            ? `Showing all ${VERDANT_CULTIVARS.length} reference profiles`
            : `Showing ${filtered.length} of ${VERDANT_CULTIVARS.length} reference profiles`}
        </p>

        {filtered.length === 0 ? (
          <div
            data-testid="cultivars-index-empty"
            className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground"
          >
            No reference profiles match those filters. Try an alias such as “GG4,” clear a filter,
            or search by lineage.
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((cultivar) => (
              <li key={cultivar.slug} className="h-full">
                <Link
                  to={`/cultivars/${cultivar.slug}`}
                  className="flex h-full flex-col rounded-xl border border-border/60 bg-card/30 p-5 transition-colors hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="rounded-full border border-border/70 px-2 py-0.5">
                      {cultivar.lifeCycle}
                    </span>
                    <span className="rounded-full border border-border/70 px-2 py-0.5">
                      {cultivar.difficulty}
                    </span>
                    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                      {formatVerificationStatus(cultivar.verificationStatus)}
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-xl font-semibold">{cultivar.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cultivar.breeder ? `${cultivar.breeder} · ` : "Breeder/source varies · "}
                    {cultivar.flowerWeeks}
                  </p>
                  <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{cultivar.intro}</p>
                  <p className="mt-auto pt-5 text-xs text-primary/90">Open source and guide evidence →</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Looking for stage fundamentals? See the{" "}
          <Link to="/guides/grow-stage-care-guide" className="underline hover:text-foreground">
            grow-stage care guide
          </Link>
          . Comparing candidate expressions? See{" "}
          <Link to="/pheno-comparison" className="underline hover:text-foreground">
            Pheno comparison
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
