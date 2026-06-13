/**
 * TentCsvImportCard — Gate 2A "CSV Drop" surface.
 *
 * User-initiated import of historical sensor data from an exported CSV
 * (AC Infinity supported in this PR; TrolMaster + Other shown as
 * "Coming soon"). Presenter only — all parsing, normalization, dedupe and
 * source labeling live in src/lib/csvSensorImportRules.ts.
 *
 * Safety contract is enforced by src/test/csv-sensor-import.test.ts —
 * never auto-assigns plants, never writes alerts/action_queue, never blends
 * imported rows with live/manual readings.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  CSV_IMPORT_SOURCE_APPS,
  CSV_SOURCE_LABEL,
  MAX_CSV_BYTES,
  buildCsvInsertRows,
  normalizeAcInfinityRows,
  parseCsv,
  planColumns,
  type CsvImportSourceApp,
  type NormalizeResult,
} from "@/lib/csvSensorImportRules";
import { summarizeImportPreview } from "@/lib/sensorImportSourceApps";
import {
  buildSourceAppPreviewCopy,
  PREVIEW_PERSISTENCE_ENABLED,
  type PreviewCopy,
} from "@/lib/sensorImportPreviewCopy";
import { buildRegistryCsvInsertRows } from "@/lib/registryCsvInsertRowsAdapter";
import { readXlsxFileToCellGrid } from "@/lib/verdantGeneticsXlsxFileLoader";
import VerdantGeneticsXlsxPreviewPanel from "@/components/VerdantGeneticsXlsxPreviewPanel";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";
import { buildVerdantGeneticsXlsxPreviewViewModel } from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import { useTents } from "@/hooks/use-tents";
import type { TentOption } from "@/lib/verdantGeneticsXlsxMappingViewModel";
import { recordSensorHistoryImportAuditEvent } from "@/lib/sensorHistoryImportAuditLog";
import {
  buildRegistryCsvAuditInput,
  buildVerdantGeneticsXlsxAuditInput,
} from "@/lib/sensorHistoryImportAuditEventBuilders";
import SensorHistoryImportAuditLedger from "@/components/SensorHistoryImportAuditLedger";

interface Props {
  tentId: string;
  growId?: string | null;
}

const PREVIEW_ROWS = 15;

export default function TentCsvImportCard({ tentId, growId }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sourceApp, setSourceApp] = useState<CsvImportSourceApp>("ac_infinity");
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NormalizeResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<PreviewCopy | null>(null);
  const [xlsxGrid, setXlsxGrid] = useState<CellGrid | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  const { data: tentsData } = useTents();
  const tentOptions: TentOption[] = useMemo(
    () =>
      (tentsData ?? []).map((t) => ({
        id: t.id as string,
        name: (t.name as string) || "Untitled tent",
      })),
    [tentsData],
  );

  const supportedApp = CSV_IMPORT_SOURCE_APPS.find((a) => a.id === sourceApp);
  const sourceEnabled = !!supportedApp?.enabled;

  function reset() {
    setText(null);
    setFileName(null);
    setParseError(null);
    setPreview(null);
    setSourcePreview(null);
    setXlsxGrid(null);
    setXlsxFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File | null) {
    setParseError(null);
    setPreview(null);
    setSourcePreview(null);
    setXlsxGrid(null);
    setXlsxFileName(null);
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setParseError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${
          MAX_CSV_BYTES / 1024 / 1024
        } MB.`,
      );
      return;
    }
    setFileName(file.name);
    // XLSX branch — preview-only via the pure Verdant Genetics parser.
    // Persistence stays disabled. No Supabase, no alerts, no Action Queue.
    if (/\.xlsx$/i.test(file.name)) {
      try {
        const grid = await readXlsxFileToCellGrid(file);
        setXlsxGrid(grid);
        setXlsxFileName(file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't read XLSX.";
        setParseError(msg);
      }
      return;
    }
    const t = await file.text();
    setText(t);
    // Read-only source-app detection. Never touches the persistence path.
    try {
      setSourcePreview(buildSourceAppPreviewCopy(summarizeImportPreview(t)));
    } catch {
      setSourcePreview(null);
    }
  }

  function handleParse() {
    if (!sourceEnabled) {
      setParseError("This source app is coming soon.");
      return;
    }
    if (!text) {
      setParseError("Pick a CSV file first.");
      return;
    }
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setParseError("CSV looks empty.");
      return;
    }
    const plan = planColumns(parsed.headers);
    if (plan.timestamp === null && plan.date === null) {
      setParseError("Couldn't find a timestamp column.");
      return;
    }
    const result = normalizeAcInfinityRows(parsed, plan);
    if (result.rows.length === 0 && result.skipped.length === 0) {
      setParseError("CSV had no data rows.");
      return;
    }
    setPreview(result);
  }

  function newBatchId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `csv-${Date.now()}`;
  }

  async function handleImport() {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    try {
      const importBatchId = newBatchId();
      const rows = buildCsvInsertRows({
        tentId,
        growId,
        sourceApp,
        importBatchId,
        rows: preview.rows,
      });
      // NOTE: no `user_id` in payload — DB default auth.uid() owns the row.
      const { error } = await supabase
        .from("sensor_readings")
        .insert(rows as never);
      if (error) throw error;
      toast.success("CSV sensor history imported.");
      qc.invalidateQueries({ queryKey: ["sensor_readings"] });
      qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
      qc.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
      qc.invalidateQueries({ queryKey: ["plant-tent-environment"] });
      qc.invalidateQueries({ queryKey: ["environment-trends"] });
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed.";
      setParseError(msg);
      toast.error("Couldn't import CSV.", { description: msg });
    } finally {
      setImporting(false);
    }
  }

  /**
   * Registry-adapter save path for Spider Farmer / Vivosun. AC Infinity is
   * intentionally excluded here — it continues to use the legacy
   * `buildCsvInsertRows` path via handleImport so this slice does not
   * regress its behavior. Adapter emits source = "csv" (the production
   * trigger's allow-listed canonical), with vendor lineage preserved in
   * raw_payload.source_app.
   */
  async function handleRegistryImport() {
    if (!sourcePreview || !text) return;
    const detected = sourcePreview.sourceAppId;
    if (detected !== "spider_farmer" && detected !== "vivosun") return;
    if (!PREVIEW_PERSISTENCE_ENABLED.has(detected)) return;
    if (!sourcePreview.importEnabled) return;
    setImporting(true);
    try {
      const importBatchId = newBatchId();
      const result = buildRegistryCsvInsertRows({
        tentId,
        growId,
        sourceApp: detected,
        importBatchId,
        csvText: text,
      });
      if (result.blocked) {
        setParseError(
          result.blockedReason === "unknown_source_app"
            ? "Unknown CSV source. Review mapping before importing."
            : "This CSV can't be imported.",
        );
        return;
      }
      if (result.rows.length === 0) {
        setParseError(
          "No sensor readings found. This file appears to contain timestamps or device metadata only.",
        );
        return;
      }
      const { error } = await supabase
        .from("sensor_readings")
        .insert(result.rows as never);
      if (error) throw error;
      toast.success(
        `Imported ${result.rows.length} ${sourcePreview.sourceAppLabel} CSV history rows.`,
      );
      const auditInput = buildRegistryCsvAuditInput({
        sourceAppId: detected,
        adapterResult: result,
        tentId,
        tentOptions,
      });
      if (auditInput) {
        recordSensorHistoryImportAuditEvent(auditInput);
        setAuditRefreshKey((k) => k + 1);
      }
      qc.invalidateQueries({ queryKey: ["sensor_readings"] });
      qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
      qc.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
      qc.invalidateQueries({ queryKey: ["plant-tent-environment"] });
      qc.invalidateQueries({ queryKey: ["environment-trends"] });
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed.";
      setParseError(msg);
      toast.error("Couldn't import CSV.", { description: msg });
    } finally {
      setImporting(false);
    }
  }

  /**
   * XLSX save path for Verdant Genetics multi-tent exports. The mapping
   * UI passes its current adapter result here. We re-insert into
   * sensor_readings only — never alerts, action_queue, diary_entries,
   * grow_events, AI tables, or device tables. Rows are canonical
   * source = "csv" with raw_payload.source_app = "verdant_genetics_xlsx"
   * (produced by the pure adapter).
   */
  async function handleXlsxSave(args: {
    adapterResult: import("@/lib/verdantGeneticsXlsxInsertRowsAdapter").VerdantGeneticsXlsxInsertRowsResult;
    tentIdBySensorGroup?: Record<string, string>;
  }) {
    const { adapterResult, tentIdBySensorGroup = {} } = args;
    if (adapterResult.blocked || adapterResult.rows.length === 0) {
      toast.error("No XLSX sensor readings were imported.");
      throw new Error(
        adapterResult.blockedReason === "missing_tent_mapping"
          ? "Some sensor groups are unmapped."
          : "No readable sensor rows found.",
      );
    }
    const { error } = await supabase
      .from("sensor_readings")
      .insert(adapterResult.rows as never);
    if (error) {
      toast.error("Couldn't import XLSX.", { description: error.message });
      throw error;
    }
    const rejectedSummary =
      adapterResult.rejectedRowCount > 0
        ? ` ${adapterResult.rejectedRowCount} rows rejected (${Object.entries(
            adapterResult.rejectionReasons,
          )
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}).`
        : "";
    toast.success(
      `Imported XLSX sensor history as CSV history. ${adapterResult.acceptedRowCount} rows imported.${rejectedSummary}`,
    );
    if (xlsxGrid) {
      try {
        const previewVm = buildVerdantGeneticsXlsxPreviewViewModel(xlsxGrid);
        const auditInput = buildVerdantGeneticsXlsxAuditInput({
          previewVm,
          adapterResult,
          tentIdBySensorGroup,
          tentOptions,
        });
        if (auditInput) {
          recordSensorHistoryImportAuditEvent(auditInput);
          setAuditRefreshKey((k) => k + 1);
        }
      } catch {
        // audit is best-effort; never block the import flow
      }
    }
    qc.invalidateQueries({ queryKey: ["sensor_readings"] });
    qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
    qc.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
    qc.invalidateQueries({ queryKey: ["plant-tent-environment"] });
    qc.invalidateQueries({ queryKey: ["environment-trends"] });
  }


  const registrySaveVisible =
    !!sourcePreview &&
    (sourcePreview.sourceAppId === "spider_farmer" ||
      sourcePreview.sourceAppId === "vivosun");

  const validCount = preview?.rows.reduce((n, r) => n + r.readings.length, 0) ?? 0;
  const skippedCount = preview?.skipped.length ?? 0;
  const importDisabled = !preview || preview.rows.length === 0 || importing;

  const previewRows = useMemo(() => {
    if (!preview) return [];
    const flat = preview.rows.flatMap((r) =>
      r.readings.map((x) => ({
        captured_at: r.captured_at,
        metric: x.metric,
        value: x.value,
      })),
    );
    return flat.slice(0, PREVIEW_ROWS);
  }, [preview]);

  return (
    <section
      className="glass rounded-2xl p-4 mb-6"
      data-testid="tent-csv-import-card"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <FileUp className="h-4 w-4" /> Import Sensor History (CSV)
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            Bring in exported data from AC Infinity or other grow apps.
            Imported readings are tagged as CSV data and never treated as live
            sensor readings.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          CSV Import
        </Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="csv-source-app">
            Source App
          </label>
          <Select
            value={sourceApp}
            onValueChange={(v) => setSourceApp(v as CsvImportSourceApp)}
          >
            <SelectTrigger id="csv-source-app" data-testid="csv-source-app">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CSV_IMPORT_SOURCE_APPS.map((app) => (
                <SelectItem
                  key={app.id}
                  value={app.id}
                  disabled={!app.enabled}
                >
                  {app.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "mt-3 rounded-xl border-2 border-dashed border-border/60 p-6 text-center",
          dragOver && "border-primary/70 bg-primary/5",
        )}
        data-testid="csv-dropzone"
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="text-sm mt-2">
          {fileName ? (
            <span data-testid="csv-filename">{fileName}</span>
          ) : (
            "Drag a CSV here, or pick a file"
          )}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          data-testid="csv-file-input"
        />
        <div className="mt-3 flex justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            data-testid="csv-pick-file"
          >
            Pick file
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleParse}
            disabled={!text || !sourceEnabled}
            data-testid="csv-parse"
          >
            Parse &amp; Preview
          </Button>
        </div>
      </div>

      {parseError && (
        <p
          role="alert"
          className="mt-3 text-sm text-destructive"
          data-testid="csv-error"
        >
          {parseError}
        </p>
      )}

      {xlsxGrid && (
        <div data-testid="csv-xlsx-preview-wrapper">
          {xlsxFileName && (
            <p
              className="mt-3 text-[11px] text-muted-foreground"
              data-testid="csv-xlsx-filename"
            >
              {xlsxFileName}
            </p>
          )}
          <VerdantGeneticsXlsxPreviewPanel
            grid={xlsxGrid}
            tentOptions={tentOptions}
            growId={growId ?? undefined}
            onSave={handleXlsxSave}
          />

        </div>
      )}

      {sourcePreview && (
        <div
          className="mt-4 rounded-xl border border-border/60 p-3 grid gap-2 text-xs"
          data-testid="csv-source-preview"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid="csv-source-preview-app">
              {sourcePreview.sourceAppLabel}
            </Badge>
            <span
              className="text-muted-foreground"
              data-testid="csv-source-preview-confidence"
            >
              {sourcePreview.confidenceLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Accepted rows"
              value={String(sourcePreview.acceptedRowCount)}
              testId="csv-source-preview-accepted"
            />
            <Stat
              label="Rejected rows"
              value={String(sourcePreview.rejectedRowCount)}
              testId="csv-source-preview-rejected"
            />
            <Stat
              label="Mapped metrics"
              value={
                sourcePreview.mappedMetrics.length > 0
                  ? sourcePreview.mappedMetrics.join(", ")
                  : "—"
              }
              testId="csv-source-preview-metrics"
            />
            <Stat
              label="Unmapped columns"
              value={String(sourcePreview.unmappedColumns.length)}
              testId="csv-source-preview-unmapped"
            />
          </div>

          {sourcePreview.warnings.length > 0 && (
            <ul
              className="grid gap-1 text-amber-200/90"
              data-testid="csv-source-preview-warnings"
            >
              {sourcePreview.warnings.map((w) => (
                <li key={w.code} data-testid={`csv-source-preview-warning-${w.code}`}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}

          {sourcePreview.notices.map((n, i) => (
            <p
              key={i}
              className="text-muted-foreground"
              data-testid="csv-source-preview-notice"
            >
              {n}
            </p>
          ))}

          <p
            className="text-muted-foreground"
            data-testid="csv-source-preview-canonical"
          >
            {sourcePreview.canonicalSourceCopy}
          </p>

          {!sourcePreview.importEnabled && sourcePreview.importDisabledReason && (
            <p
              className="text-[11px] text-amber-200/80"
              data-testid="csv-source-preview-import-blocked"
            >
              {sourcePreview.importDisabledReason}
            </p>
          )}

          {registrySaveVisible && (
            <Button
              type="button"
              onClick={handleRegistryImport}
              disabled={!sourcePreview.importEnabled || importing}
              data-testid="csv-registry-import"
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                `Import ${sourcePreview.sourceAppLabel} CSV history`
              )}
            </Button>
          )}
        </div>
      )}


      {preview && (
        <div className="mt-4 grid gap-3" data-testid="csv-preview">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Readings parsed" value={String(validCount)} testId="csv-stat-parsed" />
            <Stat label="Rows skipped" value={String(skippedCount)} testId="csv-stat-skipped" />
            <Stat
              label="Date range"
              value={
                preview.dateRange
                  ? `${preview.dateRange.from.slice(0, 10)} → ${preview.dateRange.to.slice(0, 10)}`
                  : "—"
              }
              testId="csv-stat-range"
            />
            <Stat
              label="Metrics"
              value={preview.metricsDetected.join(", ") || "—"}
              testId="csv-stat-metrics"
            />
          </div>

          {skippedCount > 0 && (
            <div
              className="rounded-md border border-amber-400/40 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90"
              data-testid="csv-skipped-warning"
            >
              {skippedCount} row{skippedCount === 1 ? "" : "s"} skipped (invalid
              timestamp or no numeric metrics).
            </div>
          )}

          {preview.unsupportedMetrics.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Detected but not imported in this release:{" "}
              {preview.unsupportedMetrics.join(", ")}
            </p>
          )}

          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full text-xs" data-testid="csv-preview-table">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-2 py-1.5">Captured</th>
                  <th className="text-left px-2 py-1.5">Metric</th>
                  <th className="text-right px-2 py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="odd:bg-muted/10">
                    <td className="px-2 py-1 font-mono">{r.captured_at}</td>
                    <td className="px-2 py-1">{r.metric}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.value.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Import {validCount} readings into this tent? They will appear with a{" "}
            <span className="font-medium">{CSV_SOURCE_LABEL[sourceApp]}</span>{" "}
            badge and will not be treated as live sensor data.
          </p>

          <Button
            type="button"
            onClick={handleImport}
            disabled={importDisabled}
            data-testid="csv-import"
            className="w-full"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Importing…
              </>
            ) : (
              "Import Data"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-md border border-border/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
