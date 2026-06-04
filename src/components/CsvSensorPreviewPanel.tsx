import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildCsvPreview,
  buildCsvTimelinePreviewRows,
  CSV_PREVIEW_SOURCE_LABEL,
  CSV_PREVIEW_STATUS_LABEL,
  type CsvPreviewParseResult,
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

/**
 * CsvSensorPreviewPanel — read-only drag/drop preview for sensor CSVs.
 *
 * Safe-by-Design:
 *  - File is parsed in-memory only. No upload, no fetch, no Supabase call,
 *    no Edge Function invocation, no Storage write.
 *  - No alerts created. No Action Queue items written. No AI invocation.
 *  - No device control. Purely a visual preview of how Verdant *would* map
 *    the columns if a future import were ever run.
 */
export default function CsvSensorPreviewPanel() {
  const [result, setResult] = useState<CsvPreviewParseResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setResult({
        ok: false,
        fileName: file.name,
        headers: [],
        rows: [],
        totalRows: 0,
        sampleRows: [],
        mappings: [],
        unmapped: [],
        flags: [],
        sourceLabel: CSV_PREVIEW_SOURCE_LABEL,
        statusLabel: CSV_PREVIEW_STATUS_LABEL,
        error: "Only .csv files are supported in preview.",
      });
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
    setResult(buildCsvPreview(text, file.name));
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const timeline = useMemo(
    () => (result ? buildCsvTimelinePreviewRows(result, 10) : []),
    [result],
  );

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
          CSV source · Not live data · Nothing has been saved. Verdant performs
          no device control, no automation, no alerts, and no Action Queue
          writes from this screen.
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
          Drag a sensor <code>.csv</code> here, or pick a file. Nothing leaves
          your browser.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose CSV file"
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
          Choose CSV file
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

      {result && result.ok && (
        <div className="space-y-6">
          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" data-testid="csv-preview-source-label">
              Source: {result.sourceLabel}
            </Badge>
            <Badge variant="outline" data-testid="csv-preview-status-label">
              {result.statusLabel}
            </Badge>
            <span className="text-muted-foreground" data-testid="csv-preview-row-count">
              {result.totalRows} row{result.totalRows === 1 ? "" : "s"} parsed ·{" "}
              {result.headers.length} column{result.headers.length === 1 ? "" : "s"}
            </span>
            {result.fileName && (
              <span className="text-muted-foreground truncate max-w-[20rem]">
                {result.fileName}
              </span>
            )}
          </div>

          {/* Mapping */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Proposed field mapping</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CSV column</TableHead>
                  <TableHead>Verdant field</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.mappings.map((m) => (
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
                    <TableCell className="text-muted-foreground text-xs">
                      {m.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Flags */}
          {result.flags.length > 0 && (
            <div data-testid="csv-preview-flags">
              <h3 className="text-sm font-semibold mb-2">Suspicious values</h3>
              <ul className="space-y-1 text-sm">
                {result.flags.map((f, i) => (
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

          {/* Sample rows */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Sample rows</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.sampleRows.map((row, i) => (
                    <TableRow key={i} data-testid={`csv-preview-row-${i}`}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="font-mono text-xs">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Timeline preview */}
          {timeline.length > 0 && (
            <div data-testid="csv-preview-timeline">
              <h3 className="text-sm font-semibold mb-2">
                Timeline preview (read-only)
              </h3>
              <ul className="space-y-1 text-sm">
                {timeline.map((t, i) => (
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
