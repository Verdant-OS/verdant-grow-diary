/**
 * SensorHistoryImportAuditLedger — read-only presenter for the local
 * imported-history audit ledger.
 *
 * Hard contract:
 *  - Presentation only. No Supabase, no fetch, no alerts, no Action Queue
 *    writes, no AI calls, no device control.
 *  - Reads from the local audit helper. Never renders raw_payload,
 *    device serials, bridge tokens, or internal IDs.
 *  - CSV/XLSX history is never live telemetry — copy must say so.
 */
import { useEffect, useMemo, useState } from "react";
import {
  getRecentSensorHistoryImportAuditEvents,
  type SensorHistoryImportAuditEvent,
  type SensorHistoryImportAuditOptions,
} from "@/lib/sensorHistoryImportAuditLog";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

export const SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_TITLE =
  "Imported history audit" as const;

export const SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_DISCLAIMER =
  "These records summarize local import activity and are not live telemetry." as const;

export const SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_EMPTY =
  "No sensor history imports recorded yet." as const;

export interface SensorHistoryImportAuditLedgerProps {
  /** Max events to display. Defaults to 10. */
  limit?: number;
  /** Test/seam hooks. */
  options?: SensorHistoryImportAuditOptions;
  /** Optional refresh nonce so callers can force a re-read after a save. */
  refreshKey?: number | string;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function SensorHistoryImportAuditLedger(
  props: SensorHistoryImportAuditLedgerProps,
) {
  const { limit = 10, options, refreshKey } = props;
  const [events, setEvents] = useState<SensorHistoryImportAuditEvent[]>(() =>
    getRecentSensorHistoryImportAuditEvents(limit, options),
  );

  useEffect(() => {
    setEvents(getRecentSensorHistoryImportAuditEvents(limit, options));
  }, [limit, options, refreshKey]);

  const rows = useMemo(() => events, [events]);

  return (
    <section
      data-testid="sensor-history-import-audit-ledger"
      aria-label={SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_TITLE}
      className="rounded-2xl border border-border bg-card/40 p-4"
    >
      <header className="mb-2">
        <h3 className="font-display text-sm font-semibold">
          {SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_TITLE}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_DISCLAIMER}
        </p>
      </header>

      {rows.length === 0 ? (
        <p
          data-testid="sensor-history-import-audit-ledger-empty"
          className="text-xs text-muted-foreground"
        >
          {SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_EMPTY}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((evt) => (
            <li
              key={evt.id}
              data-testid="sensor-history-import-audit-ledger-row"
              data-source-app={evt.sourceAppId}
              className="rounded-md border border-border/60 bg-background/40 p-3 text-xs"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{evt.sourceAppLabel}</span>
                <span className="text-muted-foreground">
                  {formatSnapshotTimestamp(evt.occurredAt)}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">
                <span data-testid="ledger-canonical-source">
                  {evt.canonicalSourceLabel}
                </span>
                <span> · </span>
                <span data-testid="ledger-file-type">
                  {evt.fileType.toUpperCase()}
                </span>
              </div>
              <div className="mt-1">
                <span data-testid="ledger-accepted-count">
                  Accepted: {evt.acceptedRowCount}
                </span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span data-testid="ledger-rejected-count">
                  Rejected: {evt.rejectedRowCount}
                </span>
              </div>
              {evt.dateRange ? (
                <div
                  data-testid="ledger-date-range"
                  className="mt-1 text-muted-foreground"
                >
                  Range: {fmtDate(evt.dateRange.start)} →{" "}
                  {fmtDate(evt.dateRange.end)}
                </div>
              ) : null}
              {evt.mappedTentLabels.length > 0 ? (
                <div
                  data-testid="ledger-mapped-tents"
                  className="mt-1 text-muted-foreground"
                >
                  Tents: {evt.mappedTentLabels.join(", ")}
                </div>
              ) : null}
              {evt.mappedSensorGroups.length > 0 ? (
                <div
                  data-testid="ledger-mapped-groups"
                  className="mt-1 text-muted-foreground"
                >
                  Sensor groups: {evt.mappedSensorGroups.join(", ")}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default SensorHistoryImportAuditLedger;
