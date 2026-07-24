/**
 * PhenoStabilityDashboard — read-only cross-keeper roll-up of the stability
 * ledger, shown on the Pheno Hunt index. Each keeper is described only against
 * its OWN first run; the list is ordered neutrally and the stat chips are
 * aggregate counts — never a ranking of keepers against each other.
 *
 * All evaluation lives in phenoStabilityDashboardRules / phenoStabilityRunRules;
 * this component only renders the model and an optional grower-chosen verdict
 * filter (a view choice, not a sort by quality). It never persists anything.
 */
import { useMemo, useState } from "react";
import {
  STABILITY_DASHBOARD_CAVEAT,
  STABILITY_DASHBOARD_VERDICT_ORDER,
  type StabilityDashboardModel,
} from "@/lib/phenoStabilityDashboardRules";
import {
  STABILITY_VERDICT_LABELS,
  type StabilityVerdict,
} from "@/lib/phenoStabilityRunRules";

export interface PhenoStabilityDashboardProps {
  model: StabilityDashboardModel;
}

/** Verdict → a muted/positive/warning tone. A visual cue, never a rank order. */
const VERDICT_TONE: Record<StabilityVerdict, string> = {
  no_runs: "bg-secondary text-muted-foreground",
  unconfirmed: "bg-secondary text-muted-foreground",
  holding: "bg-emerald-500/15 text-emerald-700",
  drifting: "bg-amber-500/15 text-amber-700",
};

type Filter = StabilityVerdict | "all";

export default function PhenoStabilityDashboard({ model }: PhenoStabilityDashboardProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "all" ? model.entries : model.entries.filter((e) => e.verdict === filter)),
    [filter, model.entries],
  );

  if (model.totalKeepers === 0) return null;

  return (
    <section
      className="glass rounded-2xl p-4 space-y-3"
      data-testid="pheno-stability-dashboard"
      aria-label="Keeper stability across your hunts"
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold">Keeper stability</h2>
        <p className="text-xs text-muted-foreground">
          Across {model.totalKeepers} {model.totalKeepers === 1 ? "keeper" : "keepers"}:{" "}
          {model.keepersWithRuns} with grow-outs recorded. Each is measured only against its own
          first run.
        </p>
      </div>

      {/* Aggregate stat chips — double as a filter. A view choice, not a sort. */}
      <div
        className="flex flex-wrap gap-1.5"
        data-testid="pheno-stability-dashboard-counts"
        role="group"
        aria-label="Filter keepers by stability status"
      >
        <button
          type="button"
          onClick={() => setFilter("all")}
          data-testid="pheno-stability-dashboard-filter-all"
          aria-pressed={filter === "all"}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          All {model.totalKeepers}
        </button>
        {STABILITY_DASHBOARD_VERDICT_ORDER.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter((prev) => (prev === v ? "all" : v))}
            disabled={model.counts[v] === 0}
            data-testid={`pheno-stability-dashboard-filter-${v}`}
            aria-pressed={filter === v}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
              filter === v ? "ring-1 ring-primary " : ""
            }${VERDICT_TONE[v]}`}
          >
            {STABILITY_VERDICT_LABELS[v]} {model.counts[v]}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5" data-testid="pheno-stability-dashboard-list">
        {visible.map((e) => (
          <li
            key={e.keeperId}
            data-testid={`pheno-stability-dashboard-entry-${e.keeperId}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{e.keeperName}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {e.huntName} · {e.detail}
              </p>
            </div>
            <span
              data-testid={`pheno-stability-dashboard-badge-${e.keeperId}`}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${VERDICT_TONE[e.verdict]}`}
            >
              {e.statusLabel}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground">{STABILITY_DASHBOARD_CAVEAT}</p>
    </section>
  );
}
