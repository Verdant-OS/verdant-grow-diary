/**
 * HarvestEvidenceReportPanel — read-only presenter.
 *
 * Renders the view-model from `buildHarvestEvidenceReport`. No data
 * fetching, no event dispatch, no writes, no alerts, no Action Queue,
 * no AI. All logic lives in `src/lib/harvestEvidenceReportViewModel.ts`.
 */
import type {
  HarvestEvidenceReport,
  HarvestEvidenceCategorySummary,
  HarvestEvidenceReportWindow,
} from "@/lib/harvestEvidenceReportViewModel";

interface Props {
  report: HarvestEvidenceReport;
}

function statusLabel(s: HarvestEvidenceCategorySummary["status"]): string {
  if (s === "logged") return "Logged";
  if (s === "limited") return "Limited";
  return "Missing";
}

export default function HarvestEvidenceReportPanel({ report }: Props) {
  const t = report.totals;
  return (
    <section
      className="glass rounded-2xl p-4 flex flex-col gap-3"
      aria-label="Harvest evidence report"
      data-testid="harvest-evidence-report-panel"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Harvest Evidence Report</h2>
        <p className="text-[11px] text-muted-foreground" data-testid="harvest-evidence-report-caution">
          {report.caution}
        </p>
        <p className="text-[11px] text-muted-foreground" data-testid="harvest-evidence-report-no-actions">
          {report.noActionsCopy}
        </p>
      </header>

      <dl
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
        aria-label="Harvest evidence totals"
        data-testid="harvest-evidence-report-totals"
      >
        <Total label="Plants" value={t.plants} />
        <Total label="Inspection windows" value={t.inspectionWindows} />
        <Total label="Trichome inspections" value={t.trichomeInspections} />
        <Total label="Pistil / recession notes" value={t.pistilObservations} />
        <Total label="Bud maturity notes" value={t.budMaturityNotes} />
        <Total label="Close flower photos" value={t.closeFlowerPhotos} />
        <Total label="Missing evidence" value={t.missingEvidenceCount} />
      </dl>

      {report.isEmpty ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="harvest-evidence-report-empty"
        >
          {report.emptyCopy}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Plants with harvest evidence">
          {report.plants.map((p) => (
            <li
              key={p.plantId}
              className="rounded-xl border border-border/40 p-3 flex flex-col gap-2"
              data-testid={`harvest-evidence-report-plant-${p.plantId}`}
            >
              <header className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-medium">{p.plantName}</h3>
                {p.strain && (
                  <span className="text-[11px] text-muted-foreground">
                    {p.strain}
                  </span>
                )}
                {p.stage && (
                  <span className="text-[11px] text-muted-foreground">
                    · {p.stage}
                  </span>
                )}
              </header>
              <ul className="flex flex-col gap-2">
                {p.windows.map((w) => (
                  <WindowRow key={w.key} window={w} plantId={p.plantId} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function WindowRow({
  window: w,
  plantId,
}: {
  window: HarvestEvidenceReportWindow;
  plantId: string;
}) {
  return (
    <li
      className="rounded-lg bg-background/30 p-2 flex flex-col gap-1.5"
      data-testid={`harvest-evidence-report-window-${plantId}-${w.key}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{w.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {w.totalCount} entr{w.totalCount === 1 ? "y" : "ies"}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {w.categories.map((c) => (
          <li
            key={c.key}
            className="flex flex-col text-[11px]"
            data-testid={`harvest-evidence-report-category-${plantId}-${w.key}-${c.key}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{c.label}</span>
              <span
                className="text-[10px] text-muted-foreground"
                data-testid={`harvest-evidence-report-status-${plantId}-${w.key}-${c.key}`}
              >
                {statusLabel(c.status)} · {c.count}
              </span>
            </span>
            {c.latestOccurredAtLabel && (
              <span className="text-[10px] text-muted-foreground">
                Latest: {c.latestOccurredAtLabel}
              </span>
            )}
            {c.summary && (
              <span className="text-[10px] text-muted-foreground">
                {c.summary}
              </span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
