/**
 * CsvTimelineEnvironmentChip — read-only presenter for a single diary
 * timeline entry's matched CSV environment snapshot.
 *
 * Hard constraints:
 *  - Presenter only. No fetches, no writes.
 *  - Always labels source as "CSV". Never "Live".
 *  - Derived VPD label is always "Derived VPD". Never "Live VPD".
 *  - Renders nothing when no snapshot matched.
 */
import type { CsvTimelineSnapshot } from "@/lib/environmentCsvTimelineContextViewModel";

export interface CsvTimelineEnvironmentChipProps {
  diaryEntryId: string;
  snapshot: CsvTimelineSnapshot | null;
}

function fmt(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function CsvTimelineEnvironmentChip(
  props: CsvTimelineEnvironmentChipProps,
) {
  const { diaryEntryId, snapshot } = props;
  if (!snapshot) return null;

  let captured = "—";
  const t = Date.parse(snapshot.capturedAt);
  if (Number.isFinite(t)) {
    try {
      captured = new Date(t).toLocaleString();
    } catch {
      captured = snapshot.capturedAt;
    }
  }

  return (
    <aside
      aria-label={snapshot.title}
      data-testid={`csv-timeline-chip-${diaryEntryId}`}
      data-source={snapshot.sourceLabel}
      className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-medium">{snapshot.title}</span>
        <span
          data-testid={`csv-timeline-chip-source-${diaryEntryId}`}
          className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {snapshot.sourceLabel}
        </span>
      </header>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <div>
          <dt className="inline">Temp:</dt>{" "}
          <dd className="inline text-foreground">{fmt(snapshot.temperatureC)} °C</dd>
        </div>
        <div>
          <dt className="inline">RH:</dt>{" "}
          <dd className="inline text-foreground">{fmt(snapshot.humidityPct, 0)} %</dd>
        </div>
        {snapshot.derivedVpdKpa != null ? (
          <div className="col-span-2">
            <dt className="inline">{snapshot.derivedVpdLabel}:</dt>{" "}
            <dd className="inline text-foreground">
              {fmt(snapshot.derivedVpdKpa, 2)} kPa
            </dd>
          </div>
        ) : null}
        <div className="col-span-2 text-[10px]">Captured: {captured}</div>
      </dl>
    </aside>
  );
}
