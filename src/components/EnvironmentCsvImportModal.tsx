/**
 * EnvironmentCsvImportModal — presenter for the CSV Drop import flow.
 *
 * Owns no business logic: parsing, normalization, coverage, and persistence
 * all live in src/lib/*. This component only renders the current phase and
 * forwards user intent to the view-model and the persistence adapter.
 *
 * Hard constraints:
 *  - No DB writes here. The Confirm CTA calls the supplied `onConfirm` prop.
 *  - Never renders a "Live" badge for CSV. Never derives Live VPD anywhere.
 *  - Cancel never inserts.
 */
import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  INITIAL_IMPORT_STATE,
  applyUnitChoice,
  buildCoveragePreview,
  cancelImport,
  reduceParseResult,
  rowsToPersist,
  startParsingState,
  type ImportState,
} from "@/lib/environmentCsvImportViewModel";
import { parseEnvironmentCSV, type ParsedEnvironmentRow } from "@/lib/csvParser";

export interface EnvironmentCsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rows: readonly ParsedEnvironmentRow[]) => Promise<{
    insertedCount: number;
    error: string | null;
  }>;
}

const ERROR_COPY: Record<string, string> = {
  wrong_file_type: "That’s not a CSV file.",
  empty_file: "This CSV looks empty or damaged.",
  damaged_file: "This CSV looks empty or damaged.",
  no_sensor_data: "We couldn’t read sensor data from this file.",
  file_too_large: "File is too large to import safely. Try a shorter date range.",
};

export function EnvironmentCsvImportModal(props: EnvironmentCsvImportModalProps) {
  const { open, onOpenChange, onConfirm } = props;
  const [state, setState] = useState<ImportState>(INITIAL_IMPORT_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => setState(cancelImport()), []);

  const handleClose = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const handleChoose = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setState(startParsingState());
      const result = await parseEnvironmentCSV(file);
      setState((prev) => reduceParseResult(prev, result));
    },
    [],
  );

  const handleUnit = useCallback((unit: "F" | "C") => {
    setState((prev) => applyUnitChoice(prev, unit));
  }, []);

  const handleConfirm = useCallback(async () => {
    const rows = rowsToPersist(state.parsed);
    if (rows.length === 0) return;
    setState((prev) => ({ ...prev, phase: "inserting" }));
    const res = await onConfirm(rows);
    if (res.error) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        errorCode: "insert_failed",
        errorMessage: res.error,
      }));
      return;
    }
    setState((prev) => ({
      ...prev,
      phase: "done",
      insertedCount: res.insertedCount,
    }));
  }, [state.parsed, onConfirm]);

  const coverage = buildCoveragePreview(state.parsed);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent data-testid="csv-import-modal">
        <DialogHeader>
          <DialogTitle>Import historical data</DialogTitle>
          <DialogDescription>
            Bring in your AC Infinity CSV and Verdant will source-tag it as
            historical CSV context.
          </DialogDescription>
        </DialogHeader>

        {state.phase === "idle" ? (
          <div data-testid="csv-import-entry" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Data is read-only and source-tagged.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              data-testid="csv-import-file-input"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button onClick={handleChoose} data-testid="csv-import-choose">
              Choose CSV
            </Button>
          </div>
        ) : null}

        {state.phase === "parsing" ? (
          <p data-testid="csv-import-parsing" className="text-sm">
            Reading your AC Infinity export…
          </p>
        ) : null}

        {state.phase === "unit_confirm" ? (
          <div data-testid="csv-import-unit-confirm" className="space-y-3">
            <p className="text-sm font-medium">Quick check on temperature units.</p>
            <div className="flex gap-2">
              <Button
                onClick={() => handleUnit("F")}
                data-testid="csv-import-unit-f"
              >
                This is °F
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleUnit("C")}
                data-testid="csv-import-unit-c"
              >
                This is °C
              </Button>
            </div>
          </div>
        ) : null}

        {state.phase === "preview" ? (
          <div data-testid="csv-import-preview" className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Sensor readings</dt>
                <dd data-testid="csv-import-valid-count">{coverage.validRows}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Days of coverage</dt>
                <dd data-testid="csv-import-days">{coverage.daysCovered}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rows skipped</dt>
                <dd data-testid="csv-import-skipped-count">{coverage.skippedRows}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date range</dt>
                <dd data-testid="csv-import-date-range">
                  {coverage.dateRange
                    ? `${new Date(coverage.dateRange.start).toLocaleDateString()} → ${new Date(coverage.dateRange.end).toLocaleDateString()}`
                    : "—"}
                </dd>
              </div>
            </dl>
            {coverage.partialSuccess && coverage.partialMessage ? (
              <div
                data-testid="csv-import-partial-banner"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
              >
                {coverage.partialMessage}
              </div>
            ) : null}
            <ul
              data-testid="csv-import-row-preview"
              className="max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground"
            >
              {(state.parsed?.validRows ?? []).slice(0, 5).map((r) => (
                <li key={r.rowNumber}>
                  {new Date(r.captured_at).toLocaleString()} ·{" "}
                  {r.temperature_c != null ? `${r.temperature_c.toFixed(1)}°C` : "—"} ·{" "}
                  {r.humidity_pct != null ? `${r.humidity_pct.toFixed(0)}%` : "—"}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} data-testid="csv-import-cancel">
                Cancel
              </Button>
              <Button onClick={handleConfirm} data-testid="csv-import-confirm">
                Confirm &amp; View on Timeline
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {state.phase === "inserting" ? (
          <p data-testid="csv-import-inserting" className="text-sm">
            Saving CSV context…
          </p>
        ) : null}

        {state.phase === "done" ? (
          <div data-testid="csv-import-done" className="space-y-2">
            <p className="text-sm">Imported {state.insertedCount} CSV reading(s).</p>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {state.phase === "error" ? (
          <div data-testid="csv-import-error" className="space-y-2">
            <p className="text-sm text-destructive">
              {(state.errorCode && ERROR_COPY[state.errorCode]) ||
                state.errorMessage ||
                "Something went wrong."}
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
