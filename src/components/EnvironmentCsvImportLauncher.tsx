/**
 * EnvironmentCsvImportLauncher — UI wiring for the CSV Drop import flow.
 *
 * Presenter shell that:
 *  - Renders a calm CTA on Sensors / Timeline surfaces.
 *  - Requires a selected grow + tent before allowing import.
 *  - Opens the existing EnvironmentCsvImportModal.
 *  - On Confirm, delegates to the existing persistCsvEnvironmentRows
 *    adapter and forces source = "csv" on every row.
 *  - After success, invalidates timeline/sensor caches and fires
 *    `verdant:csv-imported` so timeline context refreshes in place.
 *
 * Hard constraints:
 *  - No alert creation. No queued device actions. No scheduler/automation.
 *  - No device control paths.
 *  - Never labels CSV as Live.
 *  - Cancel/close must NOT insert.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { FileUp } from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  persistCsvEnvironmentRows,
  type InsertClient,
  type SensorReadingInsert,
} from "@/lib/environmentCsvImportPersistence";
import {
  dedupeKeyOf,
  SENSOR_READINGS_DEDUPE_SELECT_CLAUSE,
  type ExistingKeysQueryScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { plantDetailPath, sensorsPath, tentDetailPath } from "@/lib/routes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";

export interface EnvironmentCsvImportLauncherProps {
  growId: string | null | undefined;
  tentId: string | null | undefined;
  plantId?: string | null;
  variant?: "card" | "compact";
  /** Label override. */
  label?: string;
  /** Optional test id prefix so the same launcher can mount in two places. */
  testIdPrefix?: string;
}

const DEFAULT_LABEL = "Import historical data";

function makeInsertClient(): InsertClient {
  return {
    async insertSensorReadings(rows: SensorReadingInsert[]) {
      const { error } = await supabase.from("sensor_readings").insert(rows as never);
      if (error) {
        return {
          error: { message: error.message, code: error.code, details: error.details },
          insertedCount: 0,
        };
      }
      return { error: null, insertedCount: rows.length };
    },
    // Pre-insert duplicate lookup so re-imports and duplicate CSV rows are
    // skipped instead of crashing on sensor_readings_dedupe_uidx. Selects
    // only the presence columns the dedupe key needs — never raw_payload,
    // user_id, value, or device_id. Fails open (empty set) on any lookup
    // error; the insert-time 23505 catch is the safety net.
    async fetchExistingSensorReadingKeys(scope: ExistingKeysQueryScope) {
      try {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select(SENSOR_READINGS_DEDUPE_SELECT_CLAUSE)
          .in("tent_id", scope.tentIds)
          .in("source", scope.sources)
          .in("metric", scope.metrics)
          .gte("captured_at", scope.minCapturedAt)
          .lte("captured_at", scope.maxCapturedAt);
        if (error || !data) return new Set<string>();
        const keys = new Set<string>();
        for (const row of data as unknown as Array<{
          tent_id: string;
          source: string;
          metric: string;
          captured_at: string;
        }>) {
          const key = dedupeKeyOf(row);
          if (key) keys.add(key);
        }
        return keys;
      } catch {
        return new Set<string>();
      }
    },
  };
}

export function EnvironmentCsvImportLauncher(props: EnvironmentCsvImportLauncherProps) {
  const {
    growId,
    tentId,
    plantId = null,
    variant = "card",
    label = DEFAULT_LABEL,
    testIdPrefix = "csv-launcher",
  } = props;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const ready = !!user?.id && !!growId && !!tentId;

  // Post-import handoff target. Most specific TRUSTED destination only:
  // the explicit plant this launcher was mounted with, else the selected
  // tent's timeline surface. Never inferred from CSV contents. Pure
  // navigation — never auto-navigates, never runs AI Doctor, never
  // creates alerts or Action Queue items.
  const viewHistoryHref = plantId
    ? plantDetailPath(plantId, { tentId: tentId ?? null })
    : tentId
      ? tentDetailPath(tentId)
      : null;
  // Current-condition handoff stays on the existing manual sensor form.
  // The grower still enters, reviews, and confirms every value; this link
  // performs no write and never invokes AI Doctor by itself.
  const addCurrentReadingHref = growId ? `${sensorsPath(growId)}#manual-reading` : null;

  const handleConfirm = useCallback(
    async (rows: readonly ParsedEnvironmentRow[]) => {
      if (!user?.id || !growId || !tentId) {
        return {
          insertedCount: 0,
          duplicateCount: 0,
          error: "Missing grow or tent context.",
        };
      }
      const client = makeInsertClient();
      const res = await persistCsvEnvironmentRows(
        rows,
        {
          user_id: user.id,
          grow_id: growId,
          tent_id: tentId,
          plant_id: plantId,
        },
        client,
      );
      if (!res.error) {
        const description =
          res.duplicateCount > 0
            ? `${res.insertedCount} reading(s) added as CSV context. Skipped ${res.duplicateCount} duplicate reading(s) already in Verdant.`
            : `${res.insertedCount} reading(s) added as CSV context.`;
        toast({ title: "CSV history imported", description });
        trackFunnelEvent("csv_import_completed", { rows: res.insertedCount });
        qc.invalidateQueries({ queryKey: ["sensor_readings"] });
        qc.invalidateQueries({ queryKey: ["csv-timeline-context"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("verdant:csv-imported"));
        }
      }
      return res;
    },
    [user?.id, growId, tentId, plantId, qc],
  );

  if (!ready) {
    return (
      <div
        data-testid={`${testIdPrefix}-needs-context`}
        className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Select a grow and tent before importing CSV data.
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid={`${testIdPrefix}-button`}
          className="gap-1.5"
        >
          <FileUp className="h-3.5 w-3.5" /> Import CSV
        </Button>
        <EnvironmentCsvImportModal
          open={open}
          onOpenChange={setOpen}
          onConfirm={handleConfirm}
          viewHistoryHref={viewHistoryHref}
          addCurrentReadingHref={addCurrentReadingHref}
        />
      </>
    );
  }

  return (
    <section
      data-testid={`${testIdPrefix}-card`}
      className="rounded-2xl border border-border bg-card/40 p-4"
    >
      <header className="mb-2 flex items-center gap-2">
        <FileUp className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-display text-sm font-semibold">{label}</h3>
      </header>
      <p className="text-xs text-muted-foreground">
        Bring in an AC Infinity CSV or other environment export.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Data is read-only and source-tagged as CSV.
      </p>
      <div className="mt-3">
        <Button onClick={() => setOpen(true)} data-testid={`${testIdPrefix}-button`}>
          {label}
        </Button>
      </div>
      <EnvironmentCsvImportModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        viewHistoryHref={viewHistoryHref}
        addCurrentReadingHref={addCurrentReadingHref}
      />
    </section>
  );
}

export default EnvironmentCsvImportLauncher;
