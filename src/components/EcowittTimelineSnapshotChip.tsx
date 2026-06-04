/**
 * EcowittTimelineSnapshotChip — read-only presenter for a single diary
 * timeline entry's matched EcoWitt snapshot.
 *
 * Hard constraints:
 *  - Presenter only. No business logic. No fetches. No writes.
 *  - Derived VPD is always labelled via `ECOWITT_DERIVED_VPD_LABEL`.
 *    Never renders "Live VPD" or "VPD Live".
 *  - Renders nothing when no snapshot was matched — callers should not
 *    wrap in a container that implies a value when there isn't one.
 */
import {
  ECOWITT_DERIVED_VPD_LABEL,
  type EcowittSnapshotViewModel,
} from "@/lib/ecowittReadingViewModel";

export interface EcowittTimelineSnapshotChipProps {
  diaryEntryId: string;
  snapshot: EcowittSnapshotViewModel | null;
}

function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function freshnessLabel(vm: EcowittSnapshotViewModel): string {
  if (vm.invalid) return "Invalid";
  if (vm.freshness === "missing") return "Unavailable";
  if (vm.freshness === "stale") return "Stale";
  return "Fresh";
}

function capturedLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

export function EcowittTimelineSnapshotChip(
  props: EcowittTimelineSnapshotChipProps,
) {
  const { diaryEntryId, snapshot } = props;
  if (!snapshot || !snapshot.hasReading) return null;

  const freshness = freshnessLabel(snapshot);
  const temp = snapshot.metrics.temperature_c;
  const rh = snapshot.metrics.humidity_pct;
  const soil = snapshot.metrics.soil_moisture_pct;
  const co2 = snapshot.metrics.co2_ppm;
  const derivedVpd = snapshot.invalid ? null : snapshot.derivedVpdKpa;

  return (
    <aside
      aria-label="EcoWitt snapshot"
      data-testid={`ecowitt-timeline-chip-${diaryEntryId}`}
      data-freshness={freshness.toLowerCase()}
      className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-medium">EcoWitt snapshot</span>
        <span
          data-testid={`ecowitt-timeline-chip-freshness-${diaryEntryId}`}
          className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {freshness}
        </span>
      </header>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        {temp !== undefined ? (
          <div>
            <dt className="inline">Temp:</dt>{" "}
            <dd className="inline text-foreground">{fmt(temp)} °C</dd>
          </div>
        ) : null}
        {rh !== undefined ? (
          <div>
            <dt className="inline">RH:</dt>{" "}
            <dd className="inline text-foreground">{fmt(rh, 0)} %</dd>
          </div>
        ) : null}
        {soil !== undefined ? (
          <div>
            <dt className="inline">Soil:</dt>{" "}
            <dd className="inline text-foreground">{fmt(soil, 0)} %</dd>
          </div>
        ) : null}
        {co2 !== undefined ? (
          <div>
            <dt className="inline">CO₂:</dt>{" "}
            <dd className="inline text-foreground">{fmt(co2, 0)} ppm</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="inline">{ECOWITT_DERIVED_VPD_LABEL}:</dt>{" "}
          <dd className="inline text-foreground">
            {derivedVpd == null ? "Unavailable" : `${fmt(derivedVpd, 2)} kPa`}
          </dd>
        </div>
      </dl>
      <footer className="mt-1 text-[10px] text-muted-foreground">
        Captured {capturedLabel(snapshot.snapshot?.capturedAt ?? null)}
      </footer>
    </aside>
  );
}

export default EcowittTimelineSnapshotChip;
