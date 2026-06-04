import { useCallback, useMemo, useRef, useState } from "react";
import {
  applySensorMappingOverrides,
  buildCsvPreviewReport,
  buildFullCsvTimelineRows,
  CANONICAL_FIELDS,
  CSV_PREVIEW_STATUS_LABEL,
  filterPreviewTimelineByWindow,
  parseDelimitedSensorPreview,
  SAMPLING_OPTIONS,
  TIME_WINDOW_OPTIONS,
  type CanonicalField,
  type CsvPreviewParseResult,
  type MappingOverrides,
  type SamplingKind,
  type TimeWindow,
  type TimeWindowKind,
} from "@/lib/csvSensorPreviewRules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * CsvSensorPreviewPanel v2 — read-only drag/drop preview for sensor CSV/TSV.
 *
 * Safe-by-Design:
 *  - File parsed in-memory only. No upload, no fetch, no Supabase call,
 *    no Edge Function invocation, no Storage write.
 *  - No alerts. No Action Queue writes. No AI invocation. No device control.
 *  - User mapping overrides + window/sampling settings live in local state only.
 *  - Report download uses a local Blob/object URL — never the network.
 */
export default function CsvSensorPreviewPanel() {
  const [result, setResult] = useState<CsvPreviewParseResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [overrides, setOverrides] = useState<MappingOverrides>({});
  const [windowKind, setWindowKind] = useState<TimeWindowKind>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [sampling, setSampling] = useState<SamplingKind>("cap100");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    const name = file.name ?? "";
    const isCsv = /\.csv$/i.test(name);
    const isTsv = /\.tsv$/i.test(name);
    const isTxt = /\.txt$/i.test(name);
    if (!isCsv && !isTsv && !isTxt) {
      setResult(
        parseDelimitedSensorPreview("", { fileName: name, delimiter: "," }),
      );
      setResult((prev) =>
        prev ? { ...prev, error: "Only .csv, .tsv, or .txt files are supported in preview." } : prev,
      );
      return;
    }
    const text =
      typeof (file as unknown as { text?: () => Promise<string> }).text === "function"
        ? await file.text()
        : await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result ?? ""));
            r.onerror = () => rej(r.error);
            r.readAsText(file);
          });
    // For .txt, only accept if clearly tab-delimited.
    if (isTxt) {
      const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
      const tabs = (firstLine.match(/\t/g) ?? []).length;
      if (tabs === 0) {
        const empty = parseDelimitedSensorPreview("", { fileName: name });
        setResult({ ...empty, error: ".txt files are only accepted when tab-separated." });
        return;
      }
    }
    setOverrides({});
    setResult(parseDelimitedSensorPreview(text, { fileName: name }));
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const effective = useMemo(
    () => (result && result.ok ? applySensorMappingOverrides(result, overrides) : result),
    [result, overrides],
  );

  const window: TimeWindow = useMemo(
    () => ({
      kind: windowKind,
      start: windowKind === "custom" ? customStart || undefined : undefined,
      end: windowKind === "custom" ? customEnd || undefined : undefined,
    }),
    [windowKind, customStart, customEnd],
  );

  const previewTimeline = useMemo(() => {
    if (!effective || !effective.ok) return [];
    const full = buildFullCsvTimelineRows(effective);
    const windowed = filterPreviewTimelineByWindow(full, window);
    // Sampling happens in the report builder too; keep timeline preview consistent.
    const { samplePreviewTimeline } = require("@/lib/csvSensorPreviewRules") as {
      samplePreviewTimeline: typeof import("@/lib/csvSensorPreviewRules").samplePreviewTimeline;
    };
    return samplePreviewTimeline(windowed, sampling);
  }, [effective, window, sampling]);

  const handleDownloadReport = useCallback(() => {
    if (!result || !result.ok) return;
    const report = buildCsvPreviewReport(result, {
      overrides,
      timeWindow: window,
      sampling,
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "verdant-sensor-preview-report.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, overrides, window, sampling]);

  const setOverride = (header: string, value: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === "__default__") {
        delete next[header];
      } else if (value === "__unmapped__") {
        next[header] = null;
      } else {
        next[header] = value as CanonicalField;
      }
      return next;
    });
  };

  return (
    <section
      aria-label="CSV sensor preview"
      data-testid="csv-sensor-preview-panel"
      className="space-y-6"
    >
      {/* Safety banner */}
      <div
        role="note"
        data-testid="csv-preview-safety-banner"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm space-y-1"
      >
        <p className="font-semibold text-foreground">Preview only — not saved</p>
        <p className="text-muted-foreground">
          Not live data · Nothing has been saved. Verdant performs no device
          control, no automation, no alerts, and no Action Queue writes from
          this screen.
        </p>
      </div>

      {/* Drop zone */}
      <div
        data-testid="csv-preview-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <p className="text-sm text-muted-foreground mb-3">
          Drag a sensor <code>.csv</code> or <code>.tsv</code> here, or pick a
          file. Nothing leaves your browser.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="sr-only"
          aria-label="Choose CSV or TSV file"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          Choose CSV or TSV file
        </Button>
      </div>

      {result && result.error && (
        <div
          role="alert"
          data-testid="csv-preview-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {result.error}
        </div>
      )}

      {effective && effective.ok && (
        <div className="space-y-6">
          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" data-testid="csv-preview-source-label">
              Source: {effective.sourceLabel}
            </Badge>
            <Badge variant="outline" data-testid="csv-preview-status-label">
              {effective.statusLabel}
            </Badge>
            <Badge variant="outline" data-testid="csv-preview-delimiter-label">
              {effective.delimiter === "\t" ? "TSV preview" : "CSV preview"}
            </Badge>
            <span className="text-muted-foreground" data-testid="csv-preview-row-count">
              {effective.totalRows} row{effective.totalRows === 1 ? "" : "s"} parsed ·{" "}
              {effective.headers.length} column{effective.headers.length === 1 ? "" : "s"}
            </span>
            {effective.fileName && (
              <span className="text-muted-foreground truncate max-w-[20rem]">
                {effective.fileName}
              </span>
            )}
          </div>

          {/* Download report */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              onClick={handleDownloadReport}
              data-testid="csv-preview-download-report"
            >
              Download CSV Preview Report
            </Button>
            <span className="text-xs text-muted-foreground">
              Generates a local JSON file. No upload, no save.
            </span>
          </div>

          {/* Editable mapping table */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Field mapping (editable)</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effective.mappings.map((m) => {
                  const overrideKey = Object.prototype.hasOwnProperty.call(
                    overrides,
                    m.header,
                  )
                    ? overrides[m.header] === null
                      ? "__unmapped__"
                      : (overrides[m.header] as string)
                    : "__default__";
                  return (
                    <TableRow key={m.header} data-testid={`csv-preview-mapping-${m.header}`}>
                      <TableCell className="font-mono text-xs">{m.header}</TableCell>
                      <TableCell>
                        {m.field ? (
                          <Badge variant="secondary">{m.field}</Badge>
                        ) : (
                          <Badge variant="outline" data-testid={`csv-preview-unmapped-${m.header}`}>
                            unmapped
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={overrideKey}
                          onValueChange={(v) => setOverride(m.header, v)}
                        >
                          <SelectTrigger
                            className="h-8 w-[12rem]"
                            data-testid={`csv-preview-override-trigger-${m.header}`}
                            aria-label={`Override mapping for ${m.header}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Use proposed</SelectItem>
                            <SelectItem value="__unmapped__">Ignore / unmapped</SelectItem>
                            {CANONICAL_FIELDS.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {m.reason}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Flags */}
          {effective.flags.length > 0 && (
            <div data-testid="csv-preview-flags">
              <h3 className="text-sm font-semibold mb-2">Suspicious values</h3>
              <ul className="space-y-1 text-sm">
                {effective.flags.map((f, i) => (
                  <li
                    key={`${f.code}-${f.header}-${i}`}
                    data-testid={`csv-preview-flag-${f.code}`}
                    className={
                      f.severity === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    <span className="font-mono text-xs mr-2">{f.header}</span>
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline controls */}
          <div
            data-testid="csv-preview-timeline-controls"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
          >
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Time window
              </label>
              <Select
                value={windowKind}
                onValueChange={(v) => setWindowKind(v as TimeWindowKind)}
              >
                <SelectTrigger
                  className="h-9"
                  data-testid="csv-preview-window-trigger"
                  aria-label="Time window"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_WINDOW_OPTIONS.map((o) => (
                    <SelectItem key={o.kind} value={o.kind}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Sampling
              </label>
              <Select
                value={sampling}
                onValueChange={(v) => setSampling(v as SamplingKind)}
              >
                <SelectTrigger
                  className="h-9"
                  data-testid="csv-preview-sampling-trigger"
                  aria-label="Sampling"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLING_OPTIONS.map((o) => (
                    <SelectItem key={o.kind} value={o.kind}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {windowKind === "custom" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Start
                  </label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    data-testid="csv-preview-custom-start"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    End
                  </label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    data-testid="csv-preview-custom-end"
                  />
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Timeline preview is sampled for readability. Original file is not
            modified. {CSV_PREVIEW_STATUS_LABEL}.
          </p>

          {/* Timeline preview */}
          <div data-testid="csv-preview-timeline">
            <h3 className="text-sm font-semibold mb-2">
              Timeline preview (read-only) · {previewTimeline.length} point
              {previewTimeline.length === 1 ? "" : "s"}
            </h3>
            {previewTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rows match the current window/sampling settings.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {previewTimeline.map((t, i) => (
                  <li key={i} className="flex flex-wrap gap-2">
                    <Badge variant="outline">{t.sourceLabel}</Badge>
                    <span className="font-mono text-xs">{t.capturedAt}</span>
                    <span className="text-muted-foreground text-xs">
                      {Object.entries(t.values)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
