import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import CanonicalSourceBadge from "@/components/CanonicalSourceBadge";
import CanonicalSourceLegend from "@/components/CanonicalSourceLegend";
import {
  buildSensorIngestAuditReportViewModel,
  AUDIT_REPORT_EMPTY_NO_READINGS,
  AUDIT_REPORT_EMPTY_HINT,
  AUDIT_REPORT_EMPTY_FILTERS,
} from "@/lib/sensorIngestAuditReportViewModel";
import {
  AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  AUDIT_REPORT_PAGE_SIZES,
  REJECTED_NOT_PERSISTED_NOTE,
  CANONICAL_SOURCES,
  buildSafeRawPayloadPreview,
  type AuditReportInput,
  type AuditReportPageSize,
  type AuditReportFilters,
} from "@/lib/sensorIngestAuditReportRules";
import {
  buildSensorIngestAuditCsv,
  buildSensorIngestAuditCsvFilename,
} from "@/lib/sensorIngestAuditReportCsvExport";
import {
  applyAuditUrlState,
  buildOperatorAuditLink,
  hasAuditUrlState,
  isSafeDeviceQuery,
  parseAuditUrlState,
  type AuditUrlState,
} from "@/lib/sensorIngestAuditReportQueryParams";

export interface SensorIngestAuditReportProps {
  input: Omit<AuditReportInput, "pageSize" | "filters">;
  initialPageSize?: AuditReportPageSize;
  onPageSizeChange?: (n: AuditReportPageSize) => void;
  operatorMode?: boolean;
  className?: string;
  urlBinding?: {
    searchParams: URLSearchParams;
    onSearchParamsChange: (next: URLSearchParams) => void;
  };
}

const AUDIT_LOCAL_STORAGE_KEY = "verdant.operator.sensor-ingest-audit.v1";

function isPageSize(n: number): n is AuditReportPageSize {
  return (AUDIT_REPORT_PAGE_SIZES as ReadonlyArray<number>).includes(n);
}

function parseStoredAuditState(raw: string | null): AuditUrlState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuditUrlState>;
    return parseAuditUrlState({
      audit_provider: typeof parsed.provider === "string" ? parsed.provider : "",
      audit_from: typeof parsed.fromDateInput === "string" ? parsed.fromDateInput : "",
      audit_to: typeof parsed.toDateInput === "string" ? parsed.toDateInput : "",
      audit_q: typeof parsed.deviceQuery === "string" ? parsed.deviceQuery : "",
      audit_n: parsed.pageSize ? String(parsed.pageSize) : "",
    });
  } catch {
    return null;
  }
}

function readStoredAuditState(): AuditUrlState | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredAuditState(window.localStorage.getItem(AUDIT_LOCAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredAuditState(state: AuditUrlState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIT_LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable; URL state still works.
  }
}

export default function SensorIngestAuditReport({
  input,
  initialPageSize = AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  onPageSizeChange,
  operatorMode = false,
  className,
  urlBinding,
}: SensorIngestAuditReportProps) {
  const urlEnabled = operatorMode && !!urlBinding;
  const initialFromUrl: AuditUrlState | null = urlEnabled
    ? parseAuditUrlState(urlBinding!.searchParams)
    : null;
  const hasInitialStateRef = useRef(false);
  const initialStateRef = useRef<AuditUrlState | null>(null);
  if (!hasInitialStateRef.current) {
    const shouldPreferUrl = urlEnabled && hasAuditUrlState(urlBinding!.searchParams);
    initialStateRef.current = shouldPreferUrl
      ? initialFromUrl
      : operatorMode
        ? readStoredAuditState() ?? initialFromUrl
        : initialFromUrl;
    hasInitialStateRef.current = true;
  }
  const initialState = initialStateRef.current;

  const [pageSize, setPageSize] = useState<AuditReportPageSize>(
    initialState?.pageSize ?? initialPageSize,
  );
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>(
    initialState?.provider ?? "all",
  );
  const [capturedFrom, setCapturedFrom] = useState<string>(
    initialState?.fromDateInput ?? "",
  );
  const [capturedTo, setCapturedTo] = useState<string>(
    initialState?.toDateInput ?? "",
  );
  const [deviceQuery, setDeviceQuery] = useState<string>(
    initialState?.deviceQuery ?? "",
  );

  const filters: AuditReportFilters = {
    provider: providerFilter,
    capturedFromIso: capturedFrom ? new Date(capturedFrom).toISOString() : null,
    capturedToIso: capturedTo ? new Date(capturedTo).toISOString() : null,
    deviceStationQuery: deviceQuery || null,
  };

  const auditState: AuditUrlState = {
    provider: providerFilter,
    fromDateInput: capturedFrom,
    toDateInput: capturedTo,
    deviceQuery,
    pageSize,
  };

  const vm = useMemo(
    () => buildSensorIngestAuditReportViewModel({ ...input, pageSize, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, pageSize, providerFilter, capturedFrom, capturedTo, deviceQuery],
  );

  const firstSyncRef = useRef<boolean>(true);
  useEffect(() => {
    if (!urlEnabled || !urlBinding) return;
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    const next = applyAuditUrlState(urlBinding.searchParams, auditState);
    urlBinding.onSearchParamsChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEnabled, providerFilter, capturedFrom, capturedTo, deviceQuery, pageSize]);

  useEffect(() => {
    if (!operatorMode) return;
    writeStoredAuditState(auditState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorMode, providerFilter, capturedFrom, capturedTo, deviceQuery, pageSize]);

  const rawById = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const r of input.rows) {
      const id = r.id ?? null;
      if (id) m.set(id, r.raw_payload);
    }
    return m;
  }, [input.rows]);

  function handleCsvExport() {
    const filename = buildSensorIngestAuditCsvFilename({
      provider: providerFilter,
      capturedFromIso: filters.capturedFromIso,
      capturedToIso: filters.capturedToIso,
    });
    const { csv } = buildSensorIngestAuditCsv(vm.report.rows, { filename });
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Operator surfaces have no fallback I/O; quietly no-op.
    }
  }

  function handleCopyOperatorLink() {
    if (!operatorMode || typeof window === "undefined") return;
    const current = urlBinding?.searchParams ?? new URLSearchParams(window.location.search);
    const href = buildOperatorAuditLink({
      origin: window.location.origin,
      pathname: window.location.pathname,
      currentSearchParams: current,
      state: auditState,
    });
    try {
      void window.navigator.clipboard?.writeText(href);
    } catch {
      // Clipboard can be unavailable in tests or non-secure contexts.
    }
  }

  function handleDeviceQueryChange(value: string) {
    if (!isSafeDeviceQuery(value)) return;
    setDeviceQuery(value);
  }

  return (
    <section
      data-testid="sensor-ingest-audit-report"
      data-page-size={pageSize}
      data-operator-mode={operatorMode ? "true" : "false"}
      data-filtered-total={vm.filteredTotal}
      className={["flex flex-col gap-2 p-3 border rounded-md bg-card", className]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Sensor ingest audit</h3>
          <CanonicalSourceLegend testId="audit-source-legend" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="audit-provider-filter" className="text-muted-foreground">
            Provider
          </label>
          <select
            id="audit-provider-filter"
            data-testid="audit-provider-filter"
            className="bg-background border rounded px-1 py-0.5"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">all</option>
            {vm.availableProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label htmlFor="audit-from" className="text-muted-foreground">
            From
          </label>
          <input
            id="audit-from"
            data-testid="audit-captured-from"
            type="datetime-local"
            className="bg-background border rounded px-1 py-0.5"
            value={capturedFrom}
            onChange={(e) => setCapturedFrom(e.target.value)}
          />
          <label htmlFor="audit-to" className="text-muted-foreground">
            To
          </label>
          <input
            id="audit-to"
            data-testid="audit-captured-to"
            type="datetime-local"
            className="bg-background border rounded px-1 py-0.5"
            value={capturedTo}
            onChange={(e) => setCapturedTo(e.target.value)}
          />
          <label htmlFor="audit-device" className="text-muted-foreground">
            Device
          </label>
          <input
            id="audit-device"
            data-testid="audit-device-query"
            type="search"
            placeholder="safe display id"
            className="bg-background border rounded px-1 py-0.5"
            value={deviceQuery}
            onChange={(e) => handleDeviceQueryChange(e.target.value)}
            maxLength={64}
          />
          <label htmlFor="audit-page-size" className="text-muted-foreground">
            Show last
          </label>
          <select
            id="audit-page-size"
            data-testid="audit-page-size"
            className="bg-background border rounded px-1 py-0.5"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (isPageSize(n)) {
                setPageSize(n);
                onPageSizeChange?.(n);
              }
            }}
          >
            {vm.availablePageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {operatorMode && (
            <>
              <button
                type="button"
                data-testid="audit-copy-operator-link"
                onClick={handleCopyOperatorLink}
                className="border rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
              >
                Copy operator link
              </button>
              <button
                type="button"
                data-testid="audit-csv-export"
                onClick={handleCsvExport}
                className="border rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
              >
                Export CSV
              </button>
            </>
          )}
        </div>
      </header>
      <p data-testid="audit-rejected-note" className="text-[11px] text-muted-foreground">
        {REJECTED_NOT_PERSISTED_NOTE}
      </p>
      {operatorMode && (
        <div
          data-testid="audit-operator-summary"
          className="rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground"
        >
          <p className="font-medium text-foreground">Operator summary</p>
          <p>
            Current window: {vm.operatorSummary.shownRows} shown / {vm.operatorSummary.filteredRows} filtered.
          </p>
          <p>
            Accepted persisted: {vm.operatorSummary.acceptedPersistedRows}; rejected visible: {vm.operatorSummary.rejectedVisibleRows}; rejected omitted: {vm.operatorSummary.rejectedAttemptsOmitted ? "yes" : "no"}; raw payloads omitted from CSV: {vm.operatorSummary.rawPayloadsOmittedFromCsv}.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {[...CANONICAL_SOURCES, "unknown"].map((source) => (
              <span
                key={source}
                data-testid={`audit-summary-source-${source}`}
                className="rounded border border-border/60 px-1.5 py-0.5"
              >
                {source}: {vm.operatorSummary.bySource[source] ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}
      {vm.isEmptyInput && (
        <div
          data-testid="audit-empty-no-readings"
          className="rounded border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1"
        >
          <p className="font-medium text-foreground">{AUDIT_REPORT_EMPTY_NO_READINGS}</p>
          <p>{AUDIT_REPORT_EMPTY_HINT}</p>
          <p>Unknown state needs verification before being treated as healthy.</p>
        </div>
      )}
      {vm.isEmptyAfterFilters && (
        <p
          data-testid="audit-empty-after-filters"
          className="text-xs text-muted-foreground"
        >
          {AUDIT_REPORT_EMPTY_FILTERS}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-1">captured_at</th>
              <th className="text-left p-1">accepted</th>
              <th className="text-left p-1">reason</th>
              <th className="text-left p-1">source</th>
              <th className="text-left p-1">transport</th>
              <th className="text-left p-1">tent</th>
              <th className="text-left p-1">plant</th>
              <th className="text-left p-1">metric</th>
              <th className="text-left p-1">vpd</th>
              <th className="text-left p-1">soil%</th>
              <th className="text-left p-1">humidity%</th>
              <th className="text-left p-1">temp°C</th>
              <th className="text-left p-1">freshness</th>
              <th className="text-left p-1">device</th>
              <th className="text-left p-1">raw</th>
            </tr>
          </thead>
          <tbody>
            {vm.report.rows.map((r) => {
              const isOpen = openRowId === r.id;
              const preview = isOpen ? buildSafeRawPayloadPreview(rawById.get(r.id)) : null;
              return (
                <Fragment key={r.id}>
                  <tr
                    data-testid={`audit-row-${r.id}`}
                    data-source={r.source}
                    data-provider={r.provider ?? ""}
                    data-freshness={r.freshness}
                    className="border-t border-border/50"
                  >
                    <td className="p-1">{r.capturedAt ?? "—"}</td>
                    <td className="p-1">{r.accepted ? "yes" : "no"}</td>
                    <td className="p-1">{r.reason}</td>
                    <td className="p-1">
                      <CanonicalSourceBadge
                        testId={`audit-row-${r.id}-source-badge`}
                        source={r.source}
                        provider={r.provider}
                      />
                    </td>
                    <td className="p-1">{r.transport ?? "—"}</td>
                    <td className="p-1">{r.tentId ?? "—"}</td>
                    <td className="p-1">{r.plantId ?? "—"}</td>
                    <td className="p-1">{r.metricSummary}</td>
                    <td className="p-1" data-testid={`audit-row-${r.id}-vpd`}>
                      {r.vpdKpa === null ? "" : formatVpdKpa(r.vpdKpa)}
                    </td>
                    <td className="p-1">{r.soilMoisturePct ?? ""}</td>
                    <td className="p-1">{r.humidityPct ?? ""}</td>
                    <td className="p-1">{r.airTemperatureC ?? ""}</td>
                    <td className="p-1">{r.freshness}</td>
                    <td className="p-1" data-testid={`audit-row-${r.id}-device`}>
                      {r.deviceStationDisplayId ?? "Not available"}
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        data-testid={`audit-row-${r.id}-toggle-raw`}
                        className="underline text-muted-foreground hover:text-foreground"
                        onClick={() => setOpenRowId(isOpen ? null : r.id)}
                      >
                        {isOpen ? "hide" : "preview"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && preview && (
                    <tr data-testid={`audit-row-${r.id}-raw`}>
                      <td colSpan={15} className="p-2 bg-muted/30">
                        {preview.safe ? (
                          <>
                            <p className="text-[10px] text-muted-foreground mb-1">
                              {preview.reason}
                            </p>
                            <pre
                              data-testid={`audit-row-${r.id}-raw-preview`}
                              className="text-[10px] whitespace-pre-wrap break-all"
                            >
                              {preview.preview}
                            </pre>
                          </>
                        ) : (
                          <p
                            data-testid={`audit-row-${r.id}-raw-hidden`}
                            className="text-[11px] text-amber-300"
                          >
                            {preview.reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
