/**
 * VerdantGeneticsXlsxImportPanel — Operator Mode panel for uploading a
 * Verdant genetics XLSX sheet and previewing parsed varieties.
 *
 * Safety:
 *   - Preview-only. No Supabase writes, no AI, no alerts, no Action
 *     Queue, no device control, no automation.
 *   - File bytes never leave the browser.
 *   - The "Link to batch" action is intentionally disabled because no
 *     safe seed/plant batch write path exists yet (see blocker copy).
 */
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readXlsxFileToCellGrid } from "@/lib/verdantGeneticsXlsxFileLoader";
import {
  buildGeneticsImportPreview,
  buildGeneticsTemplateCsv,
  buildGeneticsValidationReportCsv,
  GENETICS_TEMPLATE_CSV_FILENAME,
  GENETICS_VALIDATION_REPORT_FILENAME,
  selectImportableRows,
  type GeneticsImportPreviewResult,
} from "@/lib/verdantGeneticsImportPreviewRules";
import { VerdantGeneticsImportPreviewTable } from "@/components/VerdantGeneticsImportPreviewTable";

export const GENETICS_LINK_DISABLED_COPY =
  "Batch linking is not enabled yet. Preview is safe and no data has been saved." as const;

export const GENETICS_TEMPLATE_CSV_FALLBACK_COPY =
  "XLSX template export is blocked pending a safe writer utility. Providing CSV template instead." as const;

/**
 * Trigger a local download from an in-memory text payload. Browser-only.
 * No fetch, no Supabase, no network.
 */
function triggerLocalDownload(filename: string, content: string, mime: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface VerdantGeneticsXlsxImportPanelProps {
  /**
   * Optional injected loader for tests. Defaults to the real File→grid
   * loader. Returning an array-of-arrays representing the sheet.
   */
  loader?: (file: File) => Promise<ReadonlyArray<ReadonlyArray<unknown>>>;
  /**
   * Optional injected link helper. When omitted, the link action is
   * disabled and the blocker copy is shown.
   */
  onLink?: (rows: ReturnType<typeof selectImportableRows>) => Promise<void> | void;
}

export function VerdantGeneticsXlsxImportPanel({
  loader = readXlsxFileToCellGrid,
  onLink,
}: VerdantGeneticsXlsxImportPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<GeneticsImportPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const importableRows = useMemo(() => (result ? selectImportableRows(result) : []), [result]);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setError(null);
      setResult(null);
      setLinkMessage(null);
      setFileName(file.name);
      try {
        const grid = await loader(file);
        const preview = buildGeneticsImportPreview(grid);
        setResult(preview);
      } catch {
        setError("Could not read this file. Please upload a valid .xlsx genetics sheet.");
      } finally {
        setParsing(false);
      }
    },
    [loader],
  );

  const handleConfirm = useCallback(async () => {
    if (!onLink || importableRows.length === 0) return;
    setLinking(true);
    setLinkMessage(null);
    try {
      await onLink(importableRows);
      setLinkMessage(`Linked ${importableRows.length} varieties.`);
    } catch {
      setLinkMessage("Linking failed. No data was saved.");
    } finally {
      setLinking(false);
    }
  }, [onLink, importableRows]);

  const linkDisabled = !onLink || importableRows.length === 0 || linking || parsing;

  return (
    <Card data-testid="genetics-import-panel">
      <CardHeader>
        <CardTitle>XLSX genetics import preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          XLSX genetics import preview. No data saved until confirmed.
        </p>
        <p className="text-xs text-muted-foreground">
          This tool validates genetics spreadsheets in-browser. Batch linking is not enabled yet.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="genetics-xlsx-file">
            Upload genetics XLSX
          </label>
          <input
            id="genetics-xlsx-file"
            data-testid="genetics-xlsx-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="text-sm"
          />
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="genetics-template-button"
            onClick={() =>
              triggerLocalDownload(
                GENETICS_TEMPLATE_CSV_FILENAME,
                buildGeneticsTemplateCsv(),
                "text/csv;charset=utf-8",
              )
            }
          >
            Download CSV template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="genetics-export-report-button"
            disabled={!result || !!result.fileLevelError}
            onClick={() => {
              if (!result) return;
              triggerLocalDownload(
                GENETICS_VALIDATION_REPORT_FILENAME,
                buildGeneticsValidationReportCsv(result),
                "text/csv;charset=utf-8",
              );
            }}
          >
            Export validation report
          </Button>
        </div>
        <p data-testid="genetics-template-fallback-copy" className="text-xs text-muted-foreground">
          {GENETICS_TEMPLATE_CSV_FALLBACK_COPY}
        </p>

        {parsing && <p className="text-sm text-muted-foreground">Parsing file…</p>}

        {error && (
          <Alert variant="destructive" data-testid="genetics-file-error">
            <AlertTitle>Unable to import</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result?.fileLevelError && (
          <Alert variant="destructive" data-testid="genetics-file-error">
            <AlertTitle>Unrecognized sheet</AlertTitle>
            <AlertDescription>{result.fileLevelError}</AlertDescription>
          </Alert>
        )}

        {result && !result.fileLevelError && result.fileWarnings.length > 0 && (
          <Alert data-testid="genetics-file-warnings">
            <AlertTitle>Duplicate mapped headers detected.</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 text-sm">
                {result.fileWarnings.map((w, i) => (
                  <li key={i} data-testid={`genetics-file-warning-${w.field}`}>
                    {w.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {result && !result.fileLevelError && (
          <>
            <div data-testid="genetics-preview-summary" className="flex flex-wrap gap-3 text-sm">
              <span>Total: {result.totals.total}</span>
              <span className="text-emerald-700">Ready: {result.totals.valid}</span>
              <span className="text-yellow-700">Warnings: {result.totals.warning}</span>
              <span className="text-destructive">Blocked: {result.totals.blocked}</span>
            </div>

            <VerdantGeneticsImportPreviewTable rows={result.rows} />

            <div className="flex flex-col gap-2">
              <Button
                data-testid="genetics-link-button"
                onClick={handleConfirm}
                disabled={linkDisabled}
              >
                Link to batch
              </Button>
              {!onLink && (
                <p
                  data-testid="genetics-link-disabled-copy"
                  className="text-xs text-muted-foreground"
                >
                  {GENETICS_LINK_DISABLED_COPY}
                </p>
              )}
              {linkMessage && (
                <p className="text-sm" data-testid="genetics-link-result">
                  {linkMessage}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
