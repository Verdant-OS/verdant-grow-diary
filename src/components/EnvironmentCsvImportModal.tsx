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
import { Link, useInRouterContext } from "@/lib/react-router-compat";
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
  buildCsvImportDoneMessage,
  cancelImport,
  reduceParseResult,
  rowsToPersist,
  startParsingState,
  type ImportState,
} from "@/lib/environmentCsvImportViewModel";
import { parseEnvironmentCSV, type ParsedEnvironmentRow } from "@/lib/csvParser";
import {
  UNKNOWN_CSV_HISTORY_WINDOW,
  buildCsvHistoryWindowPreview,
  csvHistoryWindowNotice,
  type CsvHistoryWindow,
} from "@/lib/csvHistoryWindowRules";
import {
  CSV_IMPORT_DESCRIPTION,
  CSV_IMPORT_ADD_CURRENT_READING_LABEL,
  CSV_IMPORT_CONFIRM_LABEL,
  CSV_IMPORT_HISTORICAL_CONTEXT_NOTE,
  CSV_IMPORT_READING_COPY,
  CSV_IMPORT_VIEW_HISTORY_LABEL,
  buildCsvImportFailureMessage,
  mergeCsvImportFailureReceipts,
  type CsvImportFailureReceipt,
  formatCsvPreviewRow,
} from "@/lib/environmentCsvPreviewCopyRules";

export interface EnvironmentCsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rows: readonly ParsedEnvironmentRow[]) => Promise<{
    insertedCount: number;
    /** Rows skipped as duplicates (same file or already imported). Optional
     *  for callers that predate duplicate-aware import. */
    duplicateCount?: number;
    /** Earlier atomic batches committed before a later batch failed. */
    partialWrite?: boolean;
    /** The dispatched batch may have committed without a usable response. */
    unconfirmedWrite?: boolean;
    error: string | null;
  }>;
  /**
   * Optional post-import handoff destination supplied by the launcher
   * from its own trusted context (assigned plant, else selected tent).
   * Pure navigation — the CTA never runs AI Doctor, never creates
   * alerts or Action Queue items, and is omitted entirely when the
   * launcher has no trustworthy target.
   */
  viewHistoryHref?: string | null;
  /**
   * Optional trusted route to Verdant's existing manual sensor form.
   * Navigation only: it does not save a reading or invoke AI Doctor.
   */
  addCurrentReadingHref?: string | null;
  historyWindow?: CsvHistoryWindow;
  onRetryHistoryWindow?: () => void;
}

const ERROR_COPY: Record<string, string> = {
  wrong_file_type: "That’s not a CSV file.",
  empty_file: "This CSV looks empty or damaged.",
  damaged_file: "This CSV looks empty or damaged.",
  no_sensor_data: "We couldn’t read sensor data from this file.",
  file_too_large: "File is too large to import safely. Try a shorter date range.",
};

export function EnvironmentCsvImportModal(props: EnvironmentCsvImportModalProps) {
  const {
    open,
    onOpenChange,
    onConfirm,
    viewHistoryHref = null,
    addCurrentReadingHref = null,
    historyWindow = UNKNOWN_CSV_HISTORY_WINDOW,
    onRetryHistoryWindow,
  } = props;
  // The handoff CTA is a router Link; render it only when a Router is
  // actually mounted so bare mounts (tests, storybook-style harnesses)
  // degrade to the Close-only footer instead of crashing.
  const inRouter = useInRouterContext();
  const [state, setState] = useState<ImportState>(INITIAL_IMPORT_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const inFlightRef = useRef(false);
  const failureReceiptRef = useRef<CsvImportFailureReceipt | null>(null);
  const reset = useCallback(() => {
    failureReceiptRef.current = null;
    setState(cancelImport());
  }, []);

  const handleClose = useCallback(() => {
    if (inFlightRef.current) return;
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const handleChoose = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setState(startParsingState());
    const result = await parseEnvironmentCSV(file);
    setState((prev) => reduceParseResult(prev, result));
  }, []);

  const handleUnit = useCallback((unit: "F" | "C") => {
    setState((prev) => applyUnitChoice(prev, unit));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (inFlightRef.current) return;
    const rows = rowsToPersist(state.parsed);
    if (rows.length === 0) return;
    inFlightRef.current = true;
    setState((prev) => ({ ...prev, phase: "inserting" }));
    try {
      let res: Awaited<ReturnType<EnvironmentCsvImportModalProps["onConfirm"]>>;
      try {
        res = await onConfirm(rows);
      } catch {
        res = { insertedCount: 0, error: "Import response unavailable", unconfirmedWrite: true };
      }
      if (res.error) {
        const receipt = mergeCsvImportFailureReceipts(failureReceiptRef.current, res);
        failureReceiptRef.current = receipt;
        setState((prev) => ({
          ...prev,
          phase: "error",
          errorCode: "insert_failed",
          errorMessage: buildCsvImportFailureMessage(
            receipt.insertedCount,
            receipt.partialWrite === true,
            receipt.unconfirmedWrite === true,
          ),
          insertedCount: receipt.insertedCount,
          duplicateCount: res.duplicateCount ?? 0,
          partialWrite: receipt.partialWrite === true,
        }));
        return;
      }
      // A successful full retry has resolved this file through inserts or dedupe.
      failureReceiptRef.current = null;
      setState((prev) => ({
        ...prev,
        phase: "done",
        errorCode: null,
        errorMessage: null,
        insertedCount: res.insertedCount,
        duplicateCount: res.duplicateCount ?? 0,
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, [state.parsed, onConfirm]);

  const coverage = buildCoveragePreview(state.parsed);
  const windowPreview = buildCsvHistoryWindowPreview(
    state.parsed?.validRows ?? [],
    historyWindow,
    new Date(),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent data-testid="csv-import-modal">
        <DialogHeader>
          <DialogTitle>Import historical data</DialogTitle>
          <DialogDescription>{CSV_IMPORT_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <div
          className="space-y-1 text-xs text-muted-foreground"
          data-testid="csv-import-history-window"
          role="status"
        >
          <p>{csvHistoryWindowNotice(historyWindow)}</p>
          {onRetryHistoryWindow &&
          (historyWindow.status === "error" || historyWindow.status === "unknown") ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetryHistoryWindow}>
              Retry history access
            </Button>
          ) : null}
        </div>

        {state.phase === "idle" ? (
          <div data-testid="csv-import-entry" className="space-y-3">
            <p className="text-xs text-muted-foreground">Data is read-only and source-tagged.</p>
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
            {CSV_IMPORT_READING_COPY}
          </p>
        ) : null}

        {state.phase === "unit_confirm" ? (
          <div data-testid="csv-import-unit-confirm" className="space-y-3">
            <p className="text-sm font-medium">Quick check on temperature units.</p>
            <div className="flex gap-2">
              <Button onClick={() => handleUnit("F")} data-testid="csv-import-unit-f">
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
                <dt className="text-muted-foreground">Sensor rows</dt>
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
            {windowPreview && windowPreview.outsideCount > 0 ? (
              <p data-testid="csv-import-outside-window" className="text-sm" role="note">
                {windowPreview.outsideCount} of {windowPreview.observationCount} observations fall
                outside this history window. Import keeps their original timestamps; they can be
                saved without appearing in the current history view.
              </p>
            ) : null}
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
                <li key={r.rowNumber}>{formatCsvPreviewRow(r)}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} data-testid="csv-import-cancel">
                Cancel
              </Button>
              <Button onClick={handleConfirm} data-testid="csv-import-confirm">
                {CSV_IMPORT_CONFIRM_LABEL}
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
            <p className="text-sm">
              {buildCsvImportDoneMessage(state.insertedCount, state.duplicateCount)}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="csv-import-historical-note">
              {CSV_IMPORT_HISTORICAL_CONTEXT_NOTE}
            </p>
            <DialogFooter>
              {addCurrentReadingHref && inRouter ? (
                <Button asChild data-testid="csv-import-add-current-reading">
                  <Link to={addCurrentReadingHref} onClick={handleClose}>
                    {CSV_IMPORT_ADD_CURRENT_READING_LABEL}
                  </Link>
                </Button>
              ) : null}
              {viewHistoryHref && inRouter ? (
                <Button asChild variant="secondary" data-testid="csv-import-view-history">
                  <Link to={viewHistoryHref} onClick={handleClose}>
                    {CSV_IMPORT_VIEW_HISTORY_LABEL}
                  </Link>
                </Button>
              ) : null}
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {state.phase === "error" ? (
          <div data-testid="csv-import-error" className="space-y-2">
            <p className="text-sm text-destructive">
              {(state.errorCode && ERROR_COPY[state.errorCode]) ||
                (state.errorCode === "insert_failed"
                  ? (state.errorMessage ??
                    buildCsvImportFailureMessage(state.insertedCount, state.partialWrite))
                  : state.errorMessage) ||
                "Something went wrong."}
            </p>
            <DialogFooter>
              {state.errorCode === "insert_failed" ? (
                <>
                  {viewHistoryHref && inRouter ? (
                    <Button asChild variant="secondary">
                      <Link to={viewHistoryHref} onClick={handleClose}>
                        {CSV_IMPORT_VIEW_HISTORY_LABEL}
                      </Link>
                    </Button>
                  ) : null}
                  <Button onClick={handleConfirm} data-testid="csv-import-retry">
                    Retry import
                  </Button>
                </>
              ) : null}
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
