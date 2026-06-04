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

import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  persistCsvEnvironmentRows,
  type InsertClient,
  type SensorReadingInsert,
} from "@/lib/environmentCsvImportPersistence";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
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
      const { error } = await supabase
        .from("sensor_readings")
        .insert(rows as never);
      if (error) {
        return { error: { message: error.message }, insertedCount: 0 };
      }
      return { error: null, insertedCount: rows.length };
    },
  };
}

export function EnvironmentCsvImportLauncher(
  props: EnvironmentCsvImportLauncherProps,
) {
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

  const handleConfirm = useCallback(
    async (rows: readonly ParsedEnvironmentRow[]) => {
      if (!user?.id || !growId || !tentId) {
        return { insertedCount: 0, error: "Missing grow or tent context." };
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
        toast({
          title: "CSV history imported",
          description: `${res.insertedCount} reading(s) added as CSV context.`,
        });
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
        <Button
          onClick={() => setOpen(true)}
          data-testid={`${testIdPrefix}-button`}
        >
          {label}
        </Button>
      </div>
      <EnvironmentCsvImportModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
      />
    </section>
  );
}

export default EnvironmentCsvImportLauncher;
