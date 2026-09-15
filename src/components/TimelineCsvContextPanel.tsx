/**
 * TimelineCsvContextPanel — read-only presenter that renders CSV environment
 * snapshot chips for diary entries whose tent has matching CSV
 * sensor_readings inside the time-window.
 *
 * Hard constraints:
 *  - Read-only. Never inserts. Never updates. Never deletes.
 *  - Only reads sensor_readings with source = "csv".
 *  - Never relabels CSV as Live. Derived VPD label only.
 *  - Scoped strictly by grow_id + per-entry tent_id.
 *  - Renders nothing after a successful read with no matches.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CsvTimelineEnvironmentChip } from "@/components/CsvTimelineEnvironmentChip";
import { Button } from "@/components/ui/button";
import {
  buildCsvTimelineContext,
  type CsvSensorReadingRow,
  type CsvTimelineContextEntry,
} from "@/lib/environmentCsvTimelineContextViewModel";

export interface TimelineDiaryLike {
  id: string;
  tent_id: string | null;
  entry_at: string | null;
}

export interface TimelineCsvContextPanelProps {
  growId: string | null | undefined;
  entries: readonly TimelineDiaryLike[];
}

export function TimelineCsvContextPanel(props: TimelineCsvContextPanelProps) {
  const { growId, entries } = props;
  const [readState, setReadState] = useState<{
    scopeKey: string;
    rows: CsvSensorReadingRow[];
    status: "loading" | "success" | "error";
  } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const tentIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      if (e.tent_id) s.add(e.tent_id);
    }
    return [...s].sort();
  }, [entries]);

  const tentIdsKey = JSON.stringify(tentIds);
  const scopeKey = JSON.stringify([growId ?? null, tentIdsKey]);
  const activeRead = readState?.scopeKey === scopeKey ? readState : null;
  const rows = activeRead?.rows ?? [];
  const readStatus = activeRead?.status ?? "loading";

  useEffect(() => {
    const scopedTentIds = JSON.parse(tentIdsKey) as string[];
    if (!growId || scopedTentIds.length === 0) {
      setReadState(null);
      return;
    }

    let cancelled = false;
    let latestRequest = 0;

    async function load() {
      const request = ++latestRequest;
      setReadState((previous) => ({
        scopeKey,
        rows: previous?.scopeKey === scopeKey ? previous.rows : [],
        status: "loading",
      }));

      try {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select("id,tent_id,source,metric,value,captured_at,raw_payload")
          .eq("source", "csv")
          .in("tent_id", scopedTentIds)
          .order("captured_at", { ascending: false })
          .limit(2000);

        if (cancelled || request !== latestRequest) return;
        if (error) throw error;
        if (!Array.isArray(data))
          throw new Error("CSV environment context response is not a list.");
        setReadState({
          scopeKey,
          rows: data as CsvSensorReadingRow[],
          status: "success",
        });
      } catch {
        if (cancelled || request !== latestRequest) return;
        setReadState((previous) => ({
          scopeKey,
          rows: previous?.scopeKey === scopeKey ? previous.rows : [],
          status: "error",
        }));
      }
    }

    void load();
    const onImported = () => {
      void load();
    };
    window.addEventListener("verdant:csv-imported", onImported);
    return () => {
      cancelled = true;
      window.removeEventListener("verdant:csv-imported", onImported);
    };
  }, [growId, tentIdsKey, scopeKey, retryAttempt]);

  const matchedByEntry = useMemo(() => {
    const out = new Map<string, CsvTimelineContextEntry>();
    if (!growId || entries.length === 0) return out;
    // Run view-model per-tent (scope contract is per-tent).
    for (const tentId of tentIds) {
      const tentEntries = entries
        .filter((e) => e.tent_id === tentId)
        .map((e) => ({
          id: e.id,
          grow_id: growId,
          tent_id: e.tent_id,
          occurred_at: e.entry_at,
        }));
      const ctx = buildCsvTimelineContext({
        diaryEntries: tentEntries,
        sensorReadings: rows,
        growId,
        tentId,
      });
      for (const c of ctx) {
        if (c.snapshot) out.set(c.diaryEntryId, c);
      }
    }
    return out;
  }, [rows, entries, growId, tentIds]);

  if (!growId || tentIds.length === 0) return null;
  if (readStatus === "success" && matchedByEntry.size === 0) return null;

  const hasCachedMatches = matchedByEntry.size > 0;

  return (
    <section data-testid="timeline-csv-context-panel" className="mt-4 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CSV environment context
      </h3>
      <div
        role="note"
        data-testid="timeline-csv-context-readonly-banner"
        className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-200"
      >
        CSV context is read-only. Verdant shows this history only when the source is explicitly
        labeled csv. Live and manual sensor readings remain separate.
      </div>
      {readStatus === "loading" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {hasCachedMatches
            ? "Refreshing CSV environment context. Showing previously loaded CSV readings."
            : "Loading CSV environment context…"}
        </p>
      ) : null}
      {readStatus === "error" ? (
        <div role="alert" className="space-y-2 text-xs text-muted-foreground">
          <p>
            {hasCachedMatches
              ? "CSV environment context could not be refreshed. Showing previously loaded CSV readings."
              : "CSV environment context is unavailable."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetryAttempt((attempt) => attempt + 1)}
          >
            Retry CSV context
          </Button>
        </div>
      ) : null}
      {[...matchedByEntry.values()].map((c) => (
        <CsvTimelineEnvironmentChip
          key={c.diaryEntryId}
          diaryEntryId={c.diaryEntryId}
          snapshot={c.snapshot}
        />
      ))}
    </section>
  );
}

export default TimelineCsvContextPanel;
