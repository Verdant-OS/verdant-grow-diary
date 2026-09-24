/**
 * EnvironmentCsvImportLauncher — UI wiring for the CSV Drop import flow.
 *
 * Presenter shell that:
 *  - Renders a calm CTA on Sensors / Timeline surfaces.
 *  - Requires a selected grow + tent before allowing import.
 *  - Opens the existing EnvironmentCsvImportModal.
 *  - On Confirm, delegates to the existing persistCsvEnvironmentRows
 *    adapter and forces source = "csv" on every row.
 *  - After any committed rows (including a partial multi-batch import),
 *    invalidates timeline/sensor caches and fires `verdant:csv-imported`
 *    so persisted history is never hidden behind stale client caches.
 *
 * Hard constraints:
 *  - No alert creation. No queued device actions. No scheduler/automation.
 *  - No device control paths.
 *  - Never labels CSV as Live.
 *  - Cancel/close must NOT insert.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { FileUp } from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  persistCsvEnvironmentRows,
  type InsertClient,
  type CsvInsertScope,
  type SensorReadingInsert,
} from "@/lib/environmentCsvImportPersistence";
import {
  SENSOR_READINGS_DEDUPE_SELECT_CLAUSE,
  type DedupeKeyParts,
  type ExistingKeysQueryScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";
import { collectCandidateCsvSensorPresenceKeys } from "@/lib/csvSensorPresenceService";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { tentDetailPath } from "@/lib/routes";
import { buildSensorsTentRouteHref, SENSORS_TENT_ROUTE } from "@/lib/sensorRouteTentIntentRules";
import { IMPORTED_SENSOR_HISTORY_ANCHOR_ID } from "@/lib/importedSensorHistoryViewModel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useCsvHistoryWindow } from "@/hooks/useCsvHistoryWindow";

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

function makeInsertClient(
  canContinue: () => boolean,
  rows: readonly ParsedEnvironmentRow[],
): InsertClient {
  const capturedAts = rows.map((row) => row.captured_at);
  return {
    async insertSensorReadings(rows: SensorReadingInsert[]) {
      if (!canContinue()) {
        return { error: { message: "Import session changed." }, insertedCount: 0 };
      }
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
      if (!canContinue()) return new Set<string>();
      try {
        return await collectCandidateCsvSensorPresenceKeys(
          capturedAts,
          async (timestamps, from, to) => {
            const { data, error } = await supabase
              .from("sensor_readings")
              .select(SENSOR_READINGS_DEDUPE_SELECT_CLAUSE)
              .in("tent_id", scope.tentIds)
              .in("source", scope.sources)
              .in("metric", scope.metrics)
              .in("captured_at", timestamps)
              .gte("captured_at", scope.minCapturedAt)
              .lte("captured_at", scope.maxCapturedAt)
              .order("tent_id")
              .order("source")
              .order("metric")
              .order("captured_at")
              .range(from, to);
            if (error || !data) throw new Error("CSV presence lookup unavailable");
            return data as unknown as DedupeKeyParts[];
          },
          canContinue,
        );
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
  const historyAccess = useCsvHistoryWindow(open);
  const [importSession, setImportSession] = useState<{
    scope: CsvInsertScope;
    generation: number;
  } | null>(null);
  const currentUserId = useRef(user?.id);
  const generation = useRef(0);
  if (currentUserId.current !== user?.id) {
    currentUserId.current = user?.id;
    generation.current += 1;
  }
  const unconfirmedWrite = useRef(false);

  useEffect(() => {
    setOpen(false);
    setImportSession(null);
    unconfirmedWrite.current = false;
  }, [user?.id]);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const ready = !!user?.id && !!growId && !!tentId;
  const importScope = importSession?.scope;
  const ownsImport =
    !!importSession &&
    importSession.generation === generation.current &&
    importScope?.user_id === user?.id;

  const handleOpen = useCallback(() => {
    if (!user?.id || !growId || !tentId) return;
    generation.current += 1;
    setImportSession({
      scope: { user_id: user.id, grow_id: growId, tent_id: tentId, plant_id: plantId },
      generation: generation.current,
    });
    unconfirmedWrite.current = false;
    trackFunnelEvent("csv_import_started");
    setOpen(true);
  }, [user?.id, growId, tentId, plantId]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      generation.current += 1;
      setImportSession(null);
    }
  }, []);
  const modalKey = importSession ? String(importSession.generation) : "closed-import";
  const importTentId = importScope?.tent_id ?? tentId;
  const importGrowId = importScope?.grow_id ?? growId;

  // Imported history is rendered on Tent Detail, so the completion link
  // targets that exact anchored section. Plant context is chosen explicitly
  // after the grower sees the history; Verdant never infers a plant from the
  // file or auto-runs AI Doctor.
  const viewHistoryHref = importTentId
    ? `${tentDetailPath(importTentId)}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`
    : null;
  // Current-condition handoff stays on the existing manual sensor form.
  // The grower still enters, reviews, and confirms every value; this link
  // performs no write and never invokes AI Doctor by itself.
  const currentReadingRoute = buildSensorsTentRouteHref(importTentId, { requireExactMatch: true });
  const addCurrentReadingHref =
    importGrowId && currentReadingRoute !== SENSORS_TENT_ROUTE
      ? `${currentReadingRoute}#manual-reading`
      : null;

  const handleConfirm = useCallback(
    async (rows: readonly ParsedEnvironmentRow[]) => {
      const canContinue = () =>
        !!importSession &&
        generation.current === importSession.generation &&
        currentUserId.current === importSession.scope.user_id;
      if (!importSession || !canContinue()) {
        return {
          insertedCount: 0,
          duplicateCount: 0,
          error: "Missing grow or tent context.",
        };
      }
      const client = makeInsertClient(canContinue, rows);
      const res = await persistCsvEnvironmentRows(rows, importSession.scope, client);
      // An account switch ends the operation's UI ownership even if its request settles later.
      if (!canContinue()) {
        return { ...res, error: "Import session changed." };
      }
      const needsReconciliation = unconfirmedWrite.current || res.unconfirmedWrite === true;
      unconfirmedWrite.current = !!res.error && needsReconciliation;
      // A later batch can fail after earlier atomic batches committed.
      // Refresh read surfaces whenever any rows were persisted, while
      // keeping completion analytics/toasts exclusive to full success.
      if (res.insertedCount > 0 || res.duplicateCount > 0 || needsReconciliation) {
        qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
        qc.invalidateQueries({ queryKey: ["sensor_readings"] });
        qc.invalidateQueries({ queryKey: ["csv-timeline-context"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("verdant:csv-imported"));
        }
      }
      if (!res.error) {
        const description =
          res.duplicateCount > 0
            ? `${res.insertedCount} reading(s) added as CSV context. Skipped ${res.duplicateCount} duplicate reading(s) already in Verdant.`
            : `${res.insertedCount} reading(s) added as CSV context.`;
        toast({ title: "CSV history imported", description });
        trackFunnelEvent("csv_import_completed", { rows: res.insertedCount });
      }
      return unconfirmedWrite.current ? { ...res, unconfirmedWrite: true } : res;
    },
    [importSession, qc],
  );

  if (!ready && !(open && ownsImport)) {
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
          onClick={handleOpen}
          data-testid={`${testIdPrefix}-button`}
          className="gap-1.5"
        >
          <FileUp className="h-3.5 w-3.5" /> Import CSV
        </Button>
        <EnvironmentCsvImportModal
          key={modalKey}
          open={open && ownsImport}
          onOpenChange={handleOpenChange}
          onConfirm={handleConfirm}
          viewHistoryHref={viewHistoryHref}
          addCurrentReadingHref={addCurrentReadingHref}
          historyWindow={historyAccess.window}
          onRetryHistoryWindow={() => {
            void historyAccess.refetch();
          }}
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
        <Button onClick={handleOpen} data-testid={`${testIdPrefix}-button`}>
          {label}
        </Button>
      </div>
      <EnvironmentCsvImportModal
        key={modalKey}
        open={open && ownsImport}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
        viewHistoryHref={viewHistoryHref}
        addCurrentReadingHref={addCurrentReadingHref}
        historyWindow={historyAccess.window}
        onRetryHistoryWindow={() => {
          void historyAccess.refetch();
        }}
      />
    </section>
  );
}

export default EnvironmentCsvImportLauncher;
