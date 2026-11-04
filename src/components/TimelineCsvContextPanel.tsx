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
  keepOneCsvChipPerSnapshot,
  type CsvSensorReadingRow,
  type CsvTimelineContextEntry,
} from "@/lib/environmentCsvTimelineContextViewModel";
import { TimelineBoundedRead } from "@/lib/timelineBoundedRead";

export interface TimelineDiaryLike {
  id: string;
  tent_id: string | null;
  entry_at: string | null;
}

export interface TimelineCsvContextPanelProps {
  growId: string | null | undefined;
  entries: readonly TimelineDiaryLike[];
  /** Banner and older-page controls. Chips still render when this is false. */
  showChrome?: boolean;
}

export function TimelineCsvContextPanel(props: TimelineCsvContextPanelProps) {
  const { growId, entries, showChrome = true } = props;
  const [readState, setReadState] = useState<{
    scopeKey: string;
    rows: CsvSensorReadingRow[];
    status: "loading" | "success" | "error";
  } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [csvHasOlder, setCsvHasOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);

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
          .select(TimelineBoundedRead.csvSelect)
          .eq("source", "csv")
          .in("tent_id", scopedTentIds)
          .order("captured_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(TimelineBoundedRead.csvPageSize);

        if (cancelled || request !== latestRequest) return;
        if (error) throw error;
        if (!Array.isArray(data))
          throw new Error("CSV environment context response is not a list.");
        const page = (data as Record<string, unknown>[]).map((row) =>
          TimelineBoundedRead.shapeCsvRow(row),
        );
        let hasOlder = false;
        if (page.length === TimelineBoundedRead.csvPageSize) {
          const cursor = page[page.length - 1];
          const captured = cursor?.captured_at;
          const id = cursor?.id;
          if (typeof captured === "string" && captured.length > 0 && typeof id === "string" && id) {
            const probe = await supabase
              .from("sensor_readings")
              .select(TimelineBoundedRead.csvSelect)
              .eq("source", "csv")
              .in("tent_id", scopedTentIds)
              .or(TimelineBoundedRead.csvOlderKeyset(captured, id))
              .order("captured_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(1);
            if (cancelled || request !== latestRequest) return;
            if (probe.error) throw probe.error;
            hasOlder = Array.isArray(probe.data) && probe.data.length > 0;
          }
        }
        setCsvHasOlder(hasOlder);
        setReadState({
          scopeKey,
          rows: page,
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

  const cursor = rows.length > 0 ? rows[rows.length - 1] : null;
  const cursorCapturedAt =
    cursor && typeof cursor.captured_at === "string" && cursor.captured_at.length > 0
      ? cursor.captured_at
      : null;
  const cursorId =
    cursor && typeof cursor.id === "string" && cursor.id.length > 0 ? cursor.id : null;

  async function loadOlderCsv() {
    if (!growId || !cursorCapturedAt || !cursorId || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const scopedTentIds = JSON.parse(tentIdsKey) as string[];
      const { data, error } = await supabase
        .from("sensor_readings")
        .select(TimelineBoundedRead.csvSelect)
        .eq("source", "csv")
        .in("tent_id", scopedTentIds)
        .or(TimelineBoundedRead.csvOlderKeyset(cursorCapturedAt, cursorId))
        .order("captured_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(TimelineBoundedRead.csvOlderFetchLimit);
      if (error || !Array.isArray(data)) throw error ?? new Error("CSV page unavailable");
      const fetched = (data as Record<string, unknown>[]).map((row) =>
        TimelineBoundedRead.shapeCsvRow(row),
      );
      const hasAnother = fetched.length > TimelineBoundedRead.csvPageSize;
      const page = hasAnother ? fetched.slice(0, TimelineBoundedRead.csvPageSize) : fetched;
      setCsvHasOlder(hasAnother);
      setReadState((previous) => {
        const current = previous?.scopeKey === scopeKey ? previous.rows : rows;
        const seen = new Set(current.map((row) => row.id).filter(Boolean));
        const extra = page.filter((row) => !row.id || !seen.has(row.id));
        return { scopeKey, rows: [...current, ...extra], status: "success" };
      });
    } catch {
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
    }
  }

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
      const entryAtById = new Map(tentEntries.map((e) => [e.id, e.occurred_at]));
      for (const c of keepOneCsvChipPerSnapshot(ctx, entryAtById)) {
        out.set(c.diaryEntryId, c);
      }
    }
    return out;
  }, [rows, entries, growId, tentIds]);

  if (!growId || tentIds.length === 0) return null;
  if (readStatus === "success" && matchedByEntry.size === 0 && !csvHasOlder) return null;

  const hasCachedMatches = matchedByEntry.size > 0;
  const chips = [...matchedByEntry.values()].map((c) => (
    <CsvTimelineEnvironmentChip
      key={c.diaryEntryId}
      diaryEntryId={c.diaryEntryId}
      snapshot={c.snapshot}
    />
  ));
  if (!showChrome) return <>{chips}</>;

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
      {olderError ? (
        <div role="alert" className="space-y-2 text-xs text-muted-foreground">
          <p>Older CSV context could not be loaded.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="timeline-csv-load-older-retry"
            onClick={() => void loadOlderCsv()}
          >
            Retry older CSV context
          </Button>
        </div>
      ) : null}
      {csvHasOlder ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="timeline-csv-load-older"
          disabled={loadingOlder}
          onClick={() => void loadOlderCsv()}
        >
          {loadingOlder ? "Loading older CSV context…" : "Load older CSV context"}
        </Button>
      ) : null}
      {chips}
    </section>
  );
}

export default TimelineCsvContextPanel;
