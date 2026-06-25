/**
 * HarvestEvidenceReportExportButton — one-click local print/PDF export.
 *
 * Strategy: browser `window.print()` against a hidden `print-only`
 * section marked with `data-print-section="harvest-evidence-report"`.
 * The print stylesheet in `src/index.css` shows only this section when
 * the browser prints. No external services, no upload, no server-side
 * export, no AI, no alerts, no Action Queue writes, no device control,
 * no sensor reads, no Supabase writes.
 *
 * The print section deliberately renders only safe, display-only fields:
 * plant name / strain / stage / window label / dates / category status /
 * counts / safe summary lines. It never emits plant_id, grow_id,
 * tent_id, user_id, raw_payload, or sensor readings.
 */
import { useCallback, useMemo } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  HarvestEvidenceReport,
  HarvestEvidenceReportPlant,
  HarvestEvidenceReportWindow,
  HarvestEvidenceCategorySummary,
} from "@/lib/harvestEvidenceReportViewModel";
import {
  buildHarvestEvidenceReportExportMetadata,
  HARVEST_EVIDENCE_REPORT_EXPORT_FOOTER,
} from "@/lib/harvestEvidenceReportExportRules";

interface Props {
  report: HarvestEvidenceReport | null | undefined;
  isLoading?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: Date;
  className?: string;
}

function statusLabel(s: HarvestEvidenceCategorySummary["status"]): string {
  if (s === "logged") return "Logged";
  if (s === "limited") return "Limited";
  return "Missing";
}

export default function HarvestEvidenceReportExportButton({
  report,
  isLoading = false,
  now,
  className,
}: Props) {
  const metadata = useMemo(
    () => buildHarvestEvidenceReportExportMetadata(report, now),
    [report, now],
  );

  const onExport = useCallback(() => {
    if (typeof window === "undefined") return;
    const prevTitle = document.title;
    try {
      document.title = metadata.filename.replace(/\.pdf$/i, "");
      window.print();
    } finally {
      // Restore on the next tick to give the print dialog time to read it.
      setTimeout(() => {
        document.title = prevTitle;
      }, 0);
    }
  }, [metadata.filename]);

  const disabled = !!isLoading || !report;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onExport}
        disabled={disabled}
        className={className}
        data-testid="harvest-evidence-report-export-button"
        aria-label="Export Harvest Evidence Report as PDF"
      >
        <Printer className="h-4 w-4 mr-2" aria-hidden="true" />
        Export PDF
      </Button>

      {report && (
        <PrintSection report={report} metadata={metadata} />
      )}
    </>
  );
}

function PrintSection({
  report,
  metadata,
}: {
  report: HarvestEvidenceReport;
  metadata: ReturnType<typeof buildHarvestEvidenceReportExportMetadata>;
}) {
  const t = report.totals;
  return (
    <section
      className="print-only"
      data-print-section="harvest-evidence-report"
      data-testid="harvest-evidence-report-print-section"
      aria-hidden="true"
    >
      <header style={{ marginBottom: "12px" }}>
        <h1 style={{ fontSize: "20px", margin: 0 }}>
          Harvest Evidence Report
        </h1>
        <p
          style={{ fontSize: "11px", margin: "4px 0 0" }}
          data-testid="harvest-evidence-report-print-generated-at"
        >
          Generated: {metadata.generatedAtLabel}
        </p>
        <p
          style={{ fontSize: "11px", margin: "2px 0 0" }}
          data-testid="harvest-evidence-report-print-scope"
        >
          Plant scope: {metadata.scopeLabel}
        </p>
      </header>

      <section
        style={{ marginBottom: "10px" }}
        data-testid="harvest-evidence-report-print-caution"
      >
        <p style={{ fontSize: "11px", margin: "0 0 4px" }}>
          {report.caution}
        </p>
        <p
          style={{ fontSize: "11px", margin: 0 }}
          data-testid="harvest-evidence-report-print-no-actions"
        >
          {report.noActionsCopy}
        </p>
      </section>

      <section
        style={{ marginBottom: "10px" }}
        data-testid="harvest-evidence-report-print-totals"
      >
        <h2 style={{ fontSize: "13px", margin: "0 0 4px" }}>Summary totals</h2>
        <ul style={{ fontSize: "11px", margin: 0, paddingLeft: "16px" }}>
          <li>Plants represented: {t.plants}</li>
          <li>Inspection windows: {t.inspectionWindows}</li>
          <li>Trichome inspections: {t.trichomeInspections}</li>
          <li>Pistil / recession notes: {t.pistilObservations}</li>
          <li>Bud maturity notes: {t.budMaturityNotes}</li>
          <li>Close flower photos: {t.closeFlowerPhotos}</li>
          <li>Missing evidence: {t.missingEvidenceCount}</li>
        </ul>
      </section>

      {report.isEmpty ? (
        <p
          style={{ fontSize: "12px" }}
          data-testid="harvest-evidence-report-print-empty"
        >
          {report.emptyCopy}
        </p>
      ) : (
        <section data-testid="harvest-evidence-report-print-plants">
          {report.plants.map((p, idx) => (
            <PrintPlant key={idx} plant={p} />
          ))}
        </section>
      )}

      <footer
        style={{
          marginTop: "16px",
          paddingTop: "6px",
          borderTop: "1px solid #ccc",
          fontSize: "10px",
        }}
        data-testid="harvest-evidence-report-print-footer"
      >
        {HARVEST_EVIDENCE_REPORT_EXPORT_FOOTER}
      </footer>
    </section>
  );
}

function PrintPlant({ plant }: { plant: HarvestEvidenceReportPlant }) {
  return (
    <article
      style={{ marginBottom: "10px", pageBreakInside: "avoid" }}
      data-testid="harvest-evidence-report-print-plant"
    >
      <h3 style={{ fontSize: "12px", margin: "0 0 4px" }}>
        {plant.plantName}
        {plant.strain ? ` — ${plant.strain}` : ""}
        {plant.stage ? ` (${plant.stage})` : ""}
      </h3>
      <ul style={{ margin: 0, paddingLeft: "16px" }}>
        {plant.windows.map((w) => (
          <PrintWindow key={w.key} window={w} />
        ))}
      </ul>
    </article>
  );
}

function PrintWindow({ window: w }: { window: HarvestEvidenceReportWindow }) {
  return (
    <li
      style={{ fontSize: "11px", marginBottom: "6px", pageBreakInside: "avoid" }}
      data-testid="harvest-evidence-report-print-window"
    >
      <div>
        <strong>{w.label}</strong>
        {" — "}
        {w.totalCount} entr{w.totalCount === 1 ? "y" : "ies"}
      </div>
      <ul style={{ margin: "2px 0 0", paddingLeft: "16px" }}>
        {w.categories.map((c) => (
          <li key={c.key}>
            {c.label}: {statusLabel(c.status)} · {c.count}
            {c.latestOccurredAtLabel ? ` · Latest: ${c.latestOccurredAtLabel}` : ""}
          </li>
        ))}
      </ul>
    </li>
  );
}
