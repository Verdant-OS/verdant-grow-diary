/**
 * PhenoContendersBoard — presenter for the pure phenoContendersViewModel.
 *
 * The hunt's shortlist, compared on the James Loud axes at a glance. Each trait
 * has its own colour so a grower can scan a column (who's the loudest? the
 * frostiest?) across every contender. A "▲ leads" marker flags the strongest in
 * each trait — ties included.
 *
 * Ethos: this SORTS to compare; it does not crown a winner. Culls are excluded
 * (they're out already) and the composite is labelled a shortlist, never the
 * verdict. Presentational only: no I/O, no writes.
 */
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type {
  ContendersBoard,
  ContenderAxis,
  ContenderVerdict,
  AxisKey,
} from "@/lib/phenoContendersViewModel";

export interface PhenoContendersBoardProps {
  readonly board: ContendersBoard;
  readonly className?: string;
}

const AXIS_HUE: Record<AxisKey, { dot: string; fill: string; ring: string; text: string }> = {
  nose: {
    dot: "bg-sky-500",
    fill: "bg-sky-500/70",
    ring: "ring-sky-400/70",
    text: "text-sky-700 dark:text-sky-300",
  },
  resin: {
    dot: "bg-violet-500",
    fill: "bg-violet-500/70",
    ring: "ring-violet-400/70",
    text: "text-violet-700 dark:text-violet-300",
  },
  structure: {
    dot: "bg-amber-500",
    fill: "bg-amber-500/70",
    ring: "ring-amber-400/70",
    text: "text-amber-700 dark:text-amber-300",
  },
  yield: {
    dot: "bg-lime-500",
    fill: "bg-lime-500/70",
    ring: "ring-lime-400/70",
    text: "text-lime-700 dark:text-lime-300",
  },
  breeding: {
    dot: "bg-rose-500",
    fill: "bg-rose-500/70",
    ring: "ring-rose-400/70",
    text: "text-rose-700 dark:text-rose-300",
  },
};

const VERDICT_BADGE: Record<ContenderVerdict, string> = {
  keep: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  maybe: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cull: "border-border bg-secondary text-muted-foreground",
};

function AxisCell({ axis, id }: { axis: ContenderAxis; id: string }) {
  const hue = AXIS_HUE[axis.key];
  return (
    <td
      className="px-2 py-1.5 align-middle"
      data-testid={`pheno-contenders-axis-${id}-${axis.key}`}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "relative h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-secondary",
            axis.leader && cn("ring-1", hue.ring),
          )}
        >
          <div
            className={cn("h-full rounded-full", hue.fill)}
            style={{ width: `${axis.value * 10}%` }}
          />
        </div>
        <span
          className={cn(
            "w-4 shrink-0 tabular-nums text-[11px]",
            axis.leader ? cn("font-semibold", hue.text) : "text-muted-foreground",
          )}
        >
          {axis.value}
        </span>
        {axis.leader && (
          <span
            data-testid={`pheno-contenders-leader-${id}-${axis.key}`}
            className={cn("text-[9px] leading-none", hue.text)}
            aria-label="leads this trait"
            title="leads this trait"
          >
            ▲
          </span>
        )}
      </div>
    </td>
  );
}

export default function PhenoContendersBoard({ board, className }: PhenoContendersBoardProps) {
  const { axes, contenders, culledCount } = board;

  return (
    <section
      data-testid="pheno-contenders"
      aria-label="Contenders board"
      className={cn("rounded-lg border border-border bg-card p-4", className)}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="max-w-prose text-xs text-muted-foreground">
          The shortlist, compared on the merits. Each trait has its own colour — scan a column to
          see who leads it.
        </p>
        {culledCount > 0 && (
          <span data-testid="pheno-contenders-culled" className="text-[11px] text-muted-foreground">
            {culledCount} culled, not shown
          </span>
        )}
      </header>

      {contenders.length === 0 ? (
        <p data-testid="pheno-contenders-empty" className="text-xs text-muted-foreground">
          No contenders yet — everything's still in triage or culled.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 pb-2 font-medium">Contender</th>
                {axes.map((a) => (
                  <th key={a.key} className="px-2 pb-2 font-medium">
                    <span className="flex items-center gap-1">
                      <span
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", AXIS_HUE[a.key].dot)}
                        aria-hidden
                      />
                      {a.label}
                      <span className="opacity-60">{a.weightPct}%</span>
                    </span>
                  </th>
                ))}
                <th className="px-2 pb-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {contenders.map((r) => {
                const isKeeper = r.verdict === "keep";
                return (
                  <tr
                    key={r.id}
                    data-testid={`pheno-contenders-row-${r.id}`}
                    className={cn("border-t border-border/60", isKeeper && "bg-emerald-500/[0.05]")}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                          {r.rank}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {r.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-[9px] uppercase", VERDICT_BADGE[r.verdict])}
                        >
                          {r.verdict}
                        </Badge>
                        {r.aroma.slice(0, 2).map((a) => (
                          <span
                            key={a}
                            className="hidden shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground sm:inline"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </td>
                    {r.axes.map((axis) => (
                      <AxisCell key={axis.key} axis={axis} id={r.id} />
                    ))}
                    <td className="px-2 py-1.5 text-right align-middle">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-secondary sm:block">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400"
                            style={{ width: `${r.score}%` }}
                          />
                        </div>
                        <span className="w-8 tabular-nums text-sm font-semibold text-foreground">
                          {r.score}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p
        data-testid="pheno-contenders-caveat"
        className="mt-3 rounded-md border-l-2 border-sky-500/50 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground"
      >
        The board sorts to compare — it doesn't decide. ▲ marks the strongest in each trait; the
        keeper call is still earned at the cure, not won on points.
      </p>
    </section>
  );
}
