/**
 * EcowittLatestSnapshotCard — presenter for the newest persisted EcoWitt
 * `sensor_readings` row for the selected tent (and optionally plant).
 *
 * This component is display-only. All grouping, filtering, label resolution,
 * freshness/suspicion logic, and Derived VPD math live in pure helpers
 * (`useEcowittLatestSnapshot`, `ecowittLatestSnapshotFilter`,
 * `ecowittReadingViewModel`, `ecowittPayloadRules`). JSX never duplicates
 * source-label, VPD-target, or stage tables.
 *
 * Hard constraints:
 *  - No writes, no alerts, no Action Queue, no automation, no device control.
 *  - Never renders fake/default live values. Empty input → calm empty state.
 *  - Never renders "Live VPD" or "VPD Live" — VPD label is always "Derived VPD".
 */
import {
  useEcowittLatestSnapshot,
  type UseEcowittLatestSnapshotInput,
} from "@/hooks/useEcowittLatestSnapshot";
import { ECOWITT_DERIVED_VPD_LABEL } from "@/lib/ecowittReadingViewModel";
import { Link } from "react-router-dom";


export interface EcowittLatestSnapshotCardProps
  extends UseEcowittLatestSnapshotInput {
  /** Card heading; defaults to "Latest EcoWitt reading". */
  title?: string;
}

function formatNumber(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function formatCapturedAt(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

export function EcowittLatestSnapshotCard(
  props: EcowittLatestSnapshotCardProps,
) {
  const { title = "Latest EcoWitt reading", ...input } = props;
  const { status, viewModel, errorMessage } = useEcowittLatestSnapshot(input);

  return (
    <section
      aria-label="Latest EcoWitt sensor snapshot"
      data-testid="ecowitt-latest-snapshot-card"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {viewModel?.sourceLabel ? (
          <span
            data-testid="ecowitt-source-badge"
            className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {viewModel.sourceLabel.label}
          </span>
        ) : null}
      </header>

      {status === "loading" ? (
        <p
          data-testid="ecowitt-snapshot-loading"
          className="text-sm text-muted-foreground"
          role="status"
        >
          Loading EcoWitt readings…
        </p>
      ) : null}

      {status === "error" ? (
        <p
          data-testid="ecowitt-snapshot-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {status === "ok" && viewModel && !viewModel.hasReading ? (
        <p
          data-testid="ecowitt-snapshot-empty"
          className="text-sm text-muted-foreground"
        >
          {viewModel.emptyStateMessage}
        </p>
      ) : null}

      {status === "ok" && viewModel?.hasReading ? (
        <div className="space-y-3">
          {viewModel.invalid && viewModel.unavailableReason ? (
            <p
              data-testid="ecowitt-snapshot-unavailable"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              Invalid / Unavailable — {viewModel.unavailableReason}
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Air temperature</dt>
              <dd data-testid="ecowitt-metric-temperature_c">
                {formatNumber(viewModel.metrics.temperature_c)} °C
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Humidity</dt>
              <dd data-testid="ecowitt-metric-humidity_pct">
                {formatNumber(viewModel.metrics.humidity_pct, 0)} %
              </dd>
            </div>
            {viewModel.metrics.soil_moisture_pct !== undefined ? (
              <div>
                <dt className="text-muted-foreground">Soil moisture</dt>
                <dd data-testid="ecowitt-metric-soil_moisture_pct">
                  {formatNumber(viewModel.metrics.soil_moisture_pct, 0)} %
                </dd>
              </div>
            ) : null}
            {viewModel.metrics.co2_ppm !== undefined ? (
              <div>
                <dt className="text-muted-foreground">CO₂</dt>
                <dd data-testid="ecowitt-metric-co2_ppm">
                  {formatNumber(viewModel.metrics.co2_ppm, 0)} ppm
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">
                {ECOWITT_DERIVED_VPD_LABEL}
              </dt>
              <dd data-testid="ecowitt-metric-derived-vpd">
                {viewModel.invalid || viewModel.derivedVpdKpa == null
                  ? "Unavailable"
                  : `${formatNumber(viewModel.derivedVpdKpa, 2)} kPa`}
              </dd>
            </div>
          </dl>

          <footer className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-testid="ecowitt-snapshot-captured-at">
              Captured {formatCapturedAt(viewModel.snapshot?.capturedAt ?? null)}
            </span>
            {viewModel.freshness ? (
              <span
                data-testid="ecowitt-snapshot-freshness"
                className="capitalize"
              >
                {viewModel.freshness}
              </span>
            ) : null}
          </footer>

          {viewModel.snapshot?.suspicion?.length ? (
            <ul
              data-testid="ecowitt-snapshot-warnings"
              className="space-y-1 text-xs text-muted-foreground"
            >
              {viewModel.snapshot.suspicion.map((flag, i) => (
                <li key={`${flag.code}-${i}`}>
                  <span className="font-medium">[{flag.severity}]</span>{" "}
                  {flag.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default EcowittLatestSnapshotCard;
