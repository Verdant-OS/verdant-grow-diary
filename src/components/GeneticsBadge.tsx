/**
 * GeneticsBadge — presenter-only badge for optional strain / genetics /
 * lineage context.
 *
 * Hard constraints:
 *   - No Supabase / client / network imports.
 *   - No data fetching, no writes, no AI calls.
 *   - Renders nothing when no genetics-shaped data is present.
 */
import { useMemo } from "react";
import { Dna } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildPlantGeneticsViewModel,
  type BuildPlantGeneticsOptions,
  type PlantGeneticsViewModel,
} from "@/lib/plantGeneticsViewModel";

interface GeneticsBadgeProps {
  /** Plant or strain-shaped input. Treated as untrusted. */
  source?: unknown;
  /** Pre-built view model. If provided, `source` is ignored. */
  viewModel?: PlantGeneticsViewModel;
  /** Override max lineage chips. */
  maxLineage?: BuildPlantGeneticsOptions["maxLineage"];
  className?: string;
  /** When true, hides the leading strain name (useful where the surface already shows it). */
  hideStrainName?: boolean;
  /** Compact = no card chrome, inline layout. */
  compact?: boolean;
}

export function GeneticsBadge({
  source,
  viewModel,
  maxLineage,
  className,
  hideStrainName = false,
  compact = false,
}: GeneticsBadgeProps) {
  const vm = useMemo(
    () => viewModel ?? buildPlantGeneticsViewModel(source, { maxLineage }),
    [source, viewModel, maxLineage],
  );

  if (!vm.shouldRender) return null;

  const hasDetail =
    Boolean(vm.genetics) ||
    Boolean(vm.breeder) ||
    Boolean(vm.generation) ||
    vm.lineagePreview.length > 0;

  return (
    <div
      data-testid="genetics-badge"
      className={cn(
        compact
          ? "flex flex-wrap items-center gap-1.5"
          : "rounded-lg border border-white/[0.06] bg-[#0f0f0f] px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-white/50">
        <Dna className="h-3 w-3" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.18em]">Genetics</span>
      </div>

      {!hideStrainName && vm.strainName ? (
        <div
          data-testid="genetics-badge-strain"
          className="mt-1 text-sm font-semibold text-white/90"
        >
          {vm.strainName}
          {vm.breeder ? (
            <span className="ml-1.5 text-[11px] font-normal text-white/40">
              · {vm.breeder}
            </span>
          ) : null}
        </div>
      ) : null}

      {vm.genetics ? (
        <p
          data-testid="genetics-badge-genetics"
          className="mt-1 text-[11px] text-white/55 font-mono"
        >
          {vm.genetics}
        </p>
      ) : null}

      {vm.lineagePreview.length > 0 ? (
        <div
          data-testid="genetics-badge-lineage"
          className="mt-1.5 flex flex-wrap items-center gap-1"
        >
          {vm.lineagePreview.map((name) => (
            <span
              key={name}
              className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/70"
            >
              {name}
            </span>
          ))}
          {vm.hiddenLineageCount > 0 ? (
            <span
              data-testid="genetics-badge-hidden-count"
              className="text-[10px] text-white/40"
            >
              +{vm.hiddenLineageCount} more
            </span>
          ) : null}
        </div>
      ) : null}

      {vm.generation ? (
        <span
          data-testid="genetics-badge-generation"
          className="mt-1.5 inline-block rounded-sm border border-white/[0.10] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/55"
        >
          Gen {vm.generation}
        </span>
      ) : null}

      {!hasDetail && hideStrainName ? null : null}
    </div>
  );
}

export default GeneticsBadge;
