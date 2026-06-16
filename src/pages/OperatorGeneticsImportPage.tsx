/**
 * OperatorGeneticsImportPage — Operator Mode screen for previewing a
 * Verdant genetics XLSX sheet before any import or link action.
 *
 * Preview-only. No writes, no network beyond reading the uploaded file
 * in-browser, no AI, no alerts, no Action Queue, no device control.
 */
import { VerdantGeneticsXlsxImportPanel } from "@/components/VerdantGeneticsXlsxImportPanel";

export default function OperatorGeneticsImportPage() {
  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Operator · Genetics XLSX Import</h1>
        <p className="text-sm text-muted-foreground">
          Preview parsed varieties from a Verdant genetics XLSX sheet. No data
          is saved until confirmed. This screen never writes sensor readings
          and never enables device control.
        </p>
        <p className="text-xs text-muted-foreground" data-testid="operator-genetics-import-safety">
          This tool validates genetics spreadsheets in-browser. Batch linking is
          not enabled yet.
        </p>
      </header>
      <VerdantGeneticsXlsxImportPanel />
    </div>
  );
}
