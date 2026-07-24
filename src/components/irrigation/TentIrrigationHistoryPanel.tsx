/**
 * TentIrrigationHistoryPanel — one-tent watering + feeding ledger presenter.
 *
 * Presenter-only. Distinct states: loading, whole-query error (+retry), true
 * empty-success, populated, and a "could not load older" partial-error that
 * keeps the loaded rows and a retry so a truncated ledger never reads as
 * complete. Unknown stays visibly unknown ("—"); manual stays "Manual log";
 * nothing is shown as live/healthy. Overflow-safe, 44px controls.
 *
 * Not mounted in this branch. Seam: <TentIrrigationHistoryPanel tentId growId />
 */
import { Loader2, AlertTriangle, Droplets, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useTentIrrigationLedger,
  IRRIGATION_LEDGER_PAGE_SIZE,
} from "@/hooks/useTentIrrigationLedger";
import type { IrrigationLedgerRow } from "@/lib/irrigation/irrigationLedgerRules";

export interface TentIrrigationHistoryPanelProps {
  tentId: string;
  growId?: string | null;
  plantId?: string | null;
  pageSize?: number;
  className?: string;
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}

function occurredLabel(occurredAt: string | null): string {
  if (!occurredAt) return "Time unrecorded";
  const t = Date.parse(occurredAt);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "Time unrecorded";
}

function LedgerRow({ row }: { row: IrrigationLedgerRow }) {
  const metrics: Array<[string, string]> = [
    ["Volume (ml)", fmt(row.volumeMl)],
    ["Input pH", fmt(row.ph)],
    ["Input EC (mS/cm)", fmt(row.ecMsCm)],
    ...(row.kind === "feeding" ? ([["Output EC (mS/cm)", fmt(row.outputEcMsCm)]] as Array<[string, string]>) : []),
    ["Runoff (ml)", fmt(row.runoffMl)],
    ["Runoff pH", fmt(row.runoffPh)],
    ["Runoff EC (mS/cm)", fmt(row.runoffEcMsCm)],
    ["Water temp (°C)", fmt(row.waterTempC)],
  ];
  return (
    <li
      data-testid="irrigation-row"
      data-kind={row.kind}
      className="rounded-md border border-white/[0.06] bg-[#0f0f0f] p-3 space-y-2 min-w-0"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {row.kind === "watering" ? (
          <Droplets className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
        ) : (
          <FlaskConical className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
        )}
        <span className="text-sm font-medium text-white/85 capitalize">{row.kind}</span>
        <span className="min-w-0 truncate text-xs text-white/40">{occurredLabel(row.occurredAt)}</span>
        <span
          data-testid="irrigation-row-source"
          title="Log provenance — not live sensor data"
          className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60"
        >
          {row.sourceLabel}
        </span>
      </div>
      {row.unmeasured ? (
        <p className="text-xs text-white/45">Logged — no measurements recorded.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <li key={label} className="flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-white/45">{label}</span>
              <span className="shrink-0 font-medium text-white/80">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {row.products.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.products.map((p, i) => (
            <span key={i} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-white/60">
              {p.name ?? "Product"} {p.amount !== null ? `· ${p.amount}${p.unit ?? ""}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {row.note ? <p className="text-xs text-white/55 break-words">{row.note}</p> : null}
    </li>
  );
}

export function TentIrrigationHistoryPanel({
  tentId,
  growId = null,
  plantId = null,
  pageSize = IRRIGATION_LEDGER_PAGE_SIZE,
  className,
}: TentIrrigationHistoryPanelProps) {
  void growId;
  const { rows, isLoading, isError, isOlderError, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useTentIrrigationLedger({ tentId, plantId, pageSize });

  return (
    <section className={cn("space-y-3 min-w-0", className)} data-testid="tent-irrigation-history">
      <h2 className="text-sm font-semibold text-white/80">Irrigation history</h2>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading irrigation records…
        </div>
      ) : isError ? (
        <div
          data-testid="irrigation-unavailable"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-200 space-y-3"
        >
          <p className="inline-flex items-center justify-center gap-2 break-words">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Irrigation history could not be loaded. This is
            not the same as “none recorded.”
          </p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={refetch}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div
          data-testid="irrigation-empty"
          className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
        >
          No irrigation recorded for this tent yet.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((row) => (
              <LedgerRow key={`${row.kind}:${row.id}`} row={row} />
            ))}
          </ul>

          {isOlderError ? (
            <div
              data-testid="irrigation-older-error"
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2"
            >
              <span className="min-w-0 break-words">
                Could not load older entries — this ledger may be incomplete.
              </span>
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={fetchNextPage}>
                Retry
              </Button>
            </div>
          ) : hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isFetchingNextPage}
                onClick={fetchNextPage}
                data-testid="irrigation-load-more"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden /> Loading…
                  </>
                ) : (
                  "Load older entries"
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default TentIrrigationHistoryPanel;
