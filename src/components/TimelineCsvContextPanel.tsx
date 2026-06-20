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
 *  - Renders nothing when no matches exist.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CsvTimelineEnvironmentChip } from "@/components/CsvTimelineEnvironmentChip";
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
  const [rows, setRows] = useState<CsvSensorReadingRow[]>([]);

  const tentIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      if (e.tent_id) s.add(e.tent_id);
    }
    return [...s];
  }, [entries]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!growId || tentIds.length === 0) {
        setRows([]);
        return;
      }
      const { data } = await supabase
        .from("sensor_readings")
        .select("id,tent_id,source,metric,value,captured_at,raw_payload")
        .eq("source", "csv")
        .in("tent_id", tentIds)
        .order("captured_at", { ascending: false })
        .limit(2000);
      if (!cancelled) setRows((data as CsvSensorReadingRow[]) ?? []);
    }
    load();
    const onImported = () => load();
    window.addEventListener("verdant:csv-imported", onImported);
    return () => {
      cancelled = true;
      window.removeEventListener("verdant:csv-imported", onImported);
    };
  }, [growId, tentIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (matchedByEntry.size === 0) return null;

  return (
    <section
      data-testid="timeline-csv-context-panel"
      className="mt-4 space-y-2"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CSV environment context
      </h3>
      <div
        role="note"
        data-testid="timeline-csv-context-readonly-banner"
        className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-200"
      >
        CSV context is read-only. Verdant shows this history only when the
        source is explicitly labeled csv. Live and manual sensor readings
        remain separate.
      </div>
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
