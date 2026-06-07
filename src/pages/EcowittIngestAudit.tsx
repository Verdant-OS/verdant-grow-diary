/**
 * EcowittIngestAudit — read-only operator view of recent EcoWitt
 * `sensor_readings` rows for the selected tent.
 *
 * Hard constraints (stop-ship if violated):
 *  - Read-only. No retry / resend / delete buttons. No actuator UI.
 *  - No elevated DB role and no bridge credentials in the client; reads go
 *    straight through Supabase + RLS.
 *  - Sensitive fields are redacted via `redactRawPayload` before render.
 *  - Empty / loading / error states are explicit.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import {
  buildEcowittAuditPageViewModel,
  ECOWITT_AUDIT_EMPTY_MESSAGE,
} from "@/lib/ecowittRawPayloadAuditViewModel";
import type { EcowittSensorReadingRow } from "@/lib/ecowittLatestSnapshotFilter";
import { EcowittIngestValidationPanel } from "@/components/EcowittIngestValidationPanel";

interface AuditRow extends EcowittSensorReadingRow {
  metric?: string | null;
  value?: number | null;
  quality?: string | null;
}

export function useEcowittAuditRows(tentId: string | null | undefined) {
  return useQuery<AuditRow[]>({
    queryKey: ["ecowitt-ingest-audit", tentId ?? "none"],
    enabled: !!tentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select(
          "id,tent_id,source,metric,value,quality,captured_at,ts,raw_payload",
        )
        .eq("tent_id", tentId!)
        .eq("source", "ecowitt")
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
}

export default function EcowittIngestAudit() {
  const { data: tents = [] } = useTents();
  const [tentId, setTentId] = useState<string | null>(null);
  const effectiveTentId =
    tentId ?? (tents.length > 0 ? (tents[0] as { id: string }).id : null);

  const query = useEcowittAuditRows(effectiveTentId);

  const vm = useMemo(
    () =>
      buildEcowittAuditPageViewModel({
        rows: query.data ?? [],
        tentId: effectiveTentId,
      }),
    [query.data, effectiveTentId],
  );

  return (
    <main
      className="mx-auto max-w-4xl space-y-4 p-4"
      aria-labelledby="ecowitt-audit-title"
      data-testid="ecowitt-audit-page"
    >
      <header>
        <h1 id="ecowitt-audit-title" className="text-xl font-semibold">
          EcoWitt ingest audit
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only record of recent EcoWitt sensor ingest for the selected tent.
        </p>
      </header>

      <section aria-label="Tent selector" className="flex items-center gap-2">
        <label htmlFor="ecowitt-audit-tent" className="text-sm font-medium">
          Tent
        </label>
        <select
          id="ecowitt-audit-tent"
          data-testid="ecowitt-audit-tent-select"
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={effectiveTentId ?? ""}
          onChange={(e) => setTentId(e.target.value || null)}
        >
          {tents.length === 0 ? (
            <option value="">No tents</option>
          ) : null}
          {(tents as Array<{ id: string; name?: string | null }>).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name ?? t.id}
            </option>
          ))}
        </select>
      </section>

      <EcowittIngestValidationPanel
        input={{
          rows: query.data ?? [],
          tentId: effectiveTentId,
        }}
      />

      {query.isLoading ? (
        <p
          data-testid="ecowitt-audit-loading"
          role="status"
          className="text-sm text-muted-foreground"
        >
          Loading EcoWitt ingest records…
        </p>
      ) : null}

      {query.isError ? (
        <p
          data-testid="ecowitt-audit-error"
          role="alert"
          className="text-sm text-destructive"
        >
          Couldn’t load EcoWitt ingest records. Check your connection and try again.
        </p>
      ) : null}

      {!query.isLoading && !query.isError && !vm.hasRows ? (
        <p
          data-testid="ecowitt-audit-empty"
          className="text-sm text-muted-foreground"
        >
          {vm.emptyStateMessage ?? ECOWITT_AUDIT_EMPTY_MESSAGE}
        </p>
      ) : null}

      {vm.hasRows ? (
        <ul
          data-testid="ecowitt-audit-list"
          className="space-y-2"
        >
          {vm.rows.map((row) => (
            <li
              key={row.id}
              data-testid={`ecowitt-audit-row-${row.id}`}
              className="rounded-md border border-border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {row.metric ?? "—"}
                  {row.value != null ? `: ${row.value}` : ""}
                </span>
                <span
                  data-testid={`ecowitt-audit-row-freshness-${row.id}`}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {row.freshness ?? "—"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span>Source: {row.source ?? "—"}</span>
                <span className="mx-2">·</span>
                <span>Quality: {row.quality ?? "—"}</span>
                <span className="mx-2">·</span>
                <span>Captured: {row.capturedAt ?? "—"}</span>
              </div>
              {row.adapterWarnings.length > 0 ? (
                <ul
                  data-testid={`ecowitt-audit-row-warnings-${row.id}`}
                  className="mt-2 list-disc pl-4 text-xs text-muted-foreground"
                >
                  {row.adapterWarnings.map((w, i) => (
                    <li key={`${w}-${i}`}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <pre
                data-testid={`ecowitt-audit-row-payload-${row.id}`}
                className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-[11px]"
              >
                {JSON.stringify(row.redactedRawPayload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
