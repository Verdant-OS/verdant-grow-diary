import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useImportedSensorHistoryPage } from "@/hooks/useImportedSensorHistoryPage";
import { buildImportedSensorHistoryViewModel } from "@/lib/importedSensorHistoryViewModel";
import {
  IMPORTED_SENSOR_HISTORY_PAGE_SIZE,
  buildImportedSensorHistoryPageSummary,
  formatImportedSensorHistoryObservation,
  normalizeImportedSensorHistorySelection,
  prepareImportedSensorHistoryObservationRows,
  type ImportedSensorHistorySelection,
} from "@/lib/importedSensorHistoryPageRules";

const INITIAL_SELECTION: ImportedSensorHistorySelection = { fromDate: "", throughDate: "", page: 0 };

function HistoryPages({ tentId }: { tentId: string }) {
  const [selection, setSelection] = useState(INITIAL_SELECTION);
  const [fromDate, setFromDate] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const query = useImportedSensorHistoryPage(tentId, selection);
  const dateId = useId();
  const vm = useMemo(
    () => buildImportedSensorHistoryViewModel({ readings: prepareImportedSensorHistoryObservationRows(query.data?.rows), limit: IMPORTED_SENSOR_HISTORY_PAGE_SIZE }),
    [query.data],
  );
  // A failed/paused refresh must not present a retained count as verified history.
  const ready = query.isSuccess && !query.isFetching && !query.isPaused;
  const summary = ready && query.data
    ? buildImportedSensorHistoryPageSummary(query.data.total, selection.page)
    : null;

  function applyDates(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeImportedSensorHistorySelection({ fromDate, throughDate, page: 0 });
    setFormError(normalized.error);
    if (!normalized.error) setSelection(normalized.selection);
  }

  function allDates() {
    setFromDate("");
    setThroughDate("");
    setFormError(null);
    setSelection(INITIAL_SELECTION);
  }

  function goToPage(page: number) {
    setSelection((current) => ({ ...current, page }));
  }

  return (
    <div className="space-y-3 rounded-md border p-3" aria-label="CSV history browser">
      <p className="text-sm font-medium">Browse imported history · Source: CSV · Not live data</p>
      <p className="text-xs text-muted-foreground">
        Browse {IMPORTED_SENSOR_HISTORY_PAGE_SIZE} metric readings at a time. Several metric readings can share one observation time.
        Dates use UTC. Account history limits still apply; counts include only readings available to your account.
      </p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={applyDates}>
        <label htmlFor={`${dateId}-from`} className="text-sm">
          From date (UTC)
          <input id={`${dateId}-from`} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="block rounded border bg-background p-2" />
        </label>
        <label htmlFor={`${dateId}-through`} className="text-sm">
          Through date (UTC)
          <input id={`${dateId}-through`} type="date" value={throughDate} onChange={(event) => setThroughDate(event.target.value)} className="block rounded border bg-background p-2" />
        </label>
        <Button type="submit" size="sm" variant="outline">Show dates</Button>
        <Button type="button" size="sm" variant="outline" onClick={allDates}>All available dates</Button>
      </form>
      {formError ? <p role="alert" className="text-sm">{formError}</p> : null}
      <p className="text-xs text-muted-foreground">
        Selected window: {selection.fromDate || "earliest available"} through {selection.throughDate || "latest available"} (UTC).
      </p>
      {query.isPaused ? (
        <p role="status">Waiting for a connection to browse CSV history…</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2">
          <p>Couldn't load this CSV history page. No complete-history count is available.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>Retry page</Button>
        </div>
      ) : !ready ? (
        <p role="status">Loading CSV history page…</p>
      ) : summary && query.data ? (
        <>
          <p role="status" aria-live="polite">
            {query.data.total === 0
              ? "No available CSV readings in this selected window. Older saved readings may be outside your account's history limit."
              : `Metric readings ${summary.firstRow}–${summary.lastRow} of ${query.data.total} available in this selection. Page ${selection.page + 1} of ${summary.pageCount}.`}
            {summary.hasOlder ? " More older readings are available." : query.data.total > 0 ? " No older readings in this selection." : ""}
          </p>
          {query.data.rows.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                Displayed observation window: {formatImportedSensorHistoryObservation(vm.earliestCapturedAt)} to {formatImportedSensorHistoryObservation(vm.latestCapturedAt)}.
              </p>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm" aria-label="Selected CSV history page">
                  <thead><tr className="text-left"><th scope="col">Observed at (UTC)</th><th scope="col">Metric</th><th scope="col">Value</th></tr></thead>
                  <tbody>{vm.recentRows.map((row, index) => (
                    <tr key={`${row.capturedAt}-${row.metric}-${index}`} className="border-t">
                      <td>{formatImportedSensorHistoryObservation(row.capturedAt)}</td>
                      <td>{row.metric}</td>
                      <td>{row.displayValue}{row.outOfRangeNote ? <span className="ml-2 text-amber-300">{row.outOfRangeNote}</span> : null}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {vm.recentRows.length < query.data.rows.length ? <p role="note">{query.data.rows.length - vm.recentRows.length} readings have no usable observation time or metric and cannot be displayed in this table.</p> : null}
            </>
          ) : query.data.total > 0 ? <p role="note">This page is now empty. Return to Newest or choose a date range to refresh the selection.</p> : null}
          <nav className="flex flex-wrap gap-2" aria-label="CSV history pages">
            <Button type="button" size="sm" variant="outline" disabled={!summary.hasNewer} onClick={() => goToPage(0)}>Newest</Button>
            <Button type="button" size="sm" variant="outline" disabled={!summary.hasNewer} onClick={() => goToPage(Math.max(0, selection.page - 1))}>Newer</Button>
            <Button type="button" size="sm" variant="outline" disabled={!summary.hasOlder} onClick={() => goToPage(selection.page + 1)}>Older</Button>
            <Button type="button" size="sm" variant="outline" disabled={!summary.hasOlder} onClick={() => goToPage(summary.lastPage)}>Oldest</Button>
          </nav>
        </>
      ) : null}
    </div>
  );
}

function AuthenticatedHistoryPages({ tentId }: { tentId: string }) {
  const { user } = useAuth();
  return user?.id
    ? <HistoryPages key={`${user.id}:${tentId}`} tentId={tentId} />
    : <p role="status">Sign in to browse available CSV history.</p>;
}

/** Mounted on demand: the existing newest preview never starts a second read. */
export default function ImportedSensorHistoryBrowser({ tentId }: { tentId: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}>
        {open ? "Close history browser" : "Browse older CSV readings"}
      </Button>
      <div id={id}>{open ? <AuthenticatedHistoryPages key={tentId} tentId={tentId} /> : null}</div>
    </div>
  );
}
