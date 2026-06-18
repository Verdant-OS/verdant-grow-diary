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
 *  - Test payloads are clearly disclosed and never labeled as live hardware data.
 */
import {
  useEcowittLatestSnapshot,
  type UseEcowittLatestSnapshotInput,
} from "@/hooks/useEcowittLatestSnapshot";
import { ECOWITT_DERIVED_VPD_LABEL } from "@/lib/ecowittReadingViewModel";
import SensorSourceProvenanceBadge from "@/components/SensorSourceProvenanceBadge";
import { buildEcowittAuditHref } from "@/lib/ecowittAuditTentSelectionRules";
import { Link } from "react-router-dom";

export interface EcowittLatestSnapshotCardProps
  extends UseEcowittLatestSnapshotInput {
  /** Card heading; defaults to "Latest EcoWitt Reading". */
  title?: string;
  /** Tent name to display in the card header. */
  tentName?: string | null;
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

function readPayloadMetadata(rawPayload: unknown): {
  testSender: boolean;
  transport: string | null;
} {
  if (!rawPayload || typeof rawPayload !== "object") {
    return { testSender: false, transport: null };
  }
  const obj = rawPayload as Record<string, unknown>;
  return {
    testSender: obj.test_sender === true,
    transport:
      typeof obj.transport === "string" && obj.transport.length > 0
        ? obj.transport
        : null,
  };
}

export function EcowittLatestSnapshotCard(
  props: EcowittLatestSnapshotCardProps,
) {
  const { title = "Latest EcoWitt Reading", tentName, ...input } = props;
  const { status, viewModel, errorMessage } = useEcowittLatestSnapshot(input);

  const meta = readPayloadMetadata(viewModel?.snapshot?.rawPayload ?? null);

  return (
    <section
      aria-label="Latest EcoWitt sensor snapshot"
      data-testid="ecowitt-latest-snapshot-card"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {tentName ? (
            <p
              data-testid="ecowitt-tent-name"
              className="text-xs text-muted-foreground"
            >
              {tentName}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {meta.testSender ? (
            <span
              data-testid="ecowitt-test-sender-badge"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
            >
              Local Test Payload
            </span>
          ) : null}
          {viewModel?.source ? (
            <SensorSourceProvenanceBadge
              source={viewModel.source}
              vendor="ecowitt"
              testId="snapshot-sensor-source-badge"
            />
          ) : null}
          {viewModel?.sourceLabel ? (
            <span
              data-testid="ecowitt-source-badge"
              className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {viewModel.sourceLabel.label}
            </span>
          ) : null}
        </div>
      </header>

      {meta.transport ? (
        <p
          data-testid="ecowitt-transport"
          className="mb-2 text-[11px] text-muted-foreground"
        >
          Transport: {meta.transport}
        </p>
      ) : null}

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
        <div data-testid="ecowitt-snapshot-empty">
          <p className="text-sm text-muted-foreground">
            {viewModel.emptyStateMessage}
          </p>
        </div>
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
              <dd data-testid="ecowitt-metric-temp_f">
                {formatNumber(viewModel.metrics.temp_f)} °F
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
              <dd data-testid="ecowitt-metric-vpd_kpa">
                {viewModel.invalid ||
                (viewModel.metrics.vpd_kpa == null &&
                  viewModel.derivedVpdKpa == null)
                  ? "Unavailable"
                  : `${formatNumber(
                      viewModel.metrics.vpd_kpa ?? viewModel.derivedVpdKpa,
                      2,
                    )} kPa`}
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

      <div className="mt-2 text-xs">
        <Link
          to="/sensors/ecowitt-audit"
          data-testid="ecowitt-audit-link"
          className="text-primary hover:underline"
        >
          View EcoWitt ingest audit
        </Link>
      </div>
    </section>
  );
}

export default EcowittLatestSnapshotCard;
