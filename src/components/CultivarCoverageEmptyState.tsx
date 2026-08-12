/**
 * Presenter-only cultivar coverage gap.
 *
 * All copy and destinations come from cultivarCoverageEmptyStateRules. The
 * component performs no reads or writes and never implies that a missing
 * cultivar profile exists.
 */
import { Link } from "react-router-dom";
import type { CultivarCoverageEmptyStateView } from "@/lib/cultivarCoverageEmptyStateRules";
import { cn } from "@/lib/utils";

interface Props {
  view: CultivarCoverageEmptyStateView;
  headingLevel: 1 | 2;
  onClearFilters?: () => void;
}

export default function CultivarCoverageEmptyState({ view, headingLevel, onClearFilters }: Props) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section
      data-testid="cultivar-coverage-empty-state"
      data-empty-kind={view.kind}
      className="rounded-2xl border border-dashed border-border/70 bg-card/30 p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
        {view.eyebrow}
      </p>
      <Heading className="mt-3 max-w-3xl font-display text-2xl font-bold tracking-tight sm:text-3xl">
        {view.title}
      </Heading>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{view.description}</p>

      <div
        data-testid="cultivar-coverage-empty-actions"
        className="mt-6 flex flex-wrap items-center gap-3"
      >
        {view.offersClearFilters && onClearFilters ? (
          <button
            type="button"
            data-testid="cultivar-coverage-clear-filters"
            onClick={onClearFilters}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Clear search and filters
          </button>
        ) : null}

        {view.links.map((link) => (
          <Link
            key={link.id}
            to={link.to}
            data-testid={`cultivar-coverage-link-${link.id}`}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              link.emphasis === "primary" && !view.offersClearFilters
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "border border-border hover:border-primary/40",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
