/**
 * aiDoctorReportPackageRules — pure builder + client-side downloader for
 * the combined "AI Doctor PDF + Evidence CSV" package.
 *
 * Hard constraints:
 *  - Pure logic + DOM-only download. No fetch, no Supabase, no edge.
 *  - Both files are built from the SAME redacted report input so PDF
 *    and CSV always agree.
 *  - Deterministic filenames: ai-doctor-report-YYYY-MM-DD.{pdf,csv}.
 *  - Uses the project's existing JSZip dependency when available; the
 *    package falls back to sequential PDF + CSV downloads otherwise.
 */

import {
  buildAiDoctorReportPdfBytes,
  downloadAiDoctorReportPdf,
  type AiDoctorReportInput,
} from "./aiDoctorReportRules";
import {
  buildAiDoctorEvidenceCsv,
  downloadAiDoctorEvidenceCsv,
} from "./aiDoctorEvidenceCsvExportRules";

export type PackageMode = "zip" | "sequential";

export interface PackageFilenames {
  pdf: string;
  csv: string;
  zip: string;
}

/** Returns YYYY-MM-DD from an ISO-8601 timestamp; falls back to "report". */
export function packageDateStamp(generatedAt: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(generatedAt ?? "");
  return m ? m[1] : "report";
}

export function buildPackageFilenames(generatedAt: string): PackageFilenames {
  const d = packageDateStamp(generatedAt);
  return {
    pdf: `ai-doctor-report-${d}.pdf`,
    csv: `ai-doctor-evidence-${d}.csv`,
    zip: `ai-doctor-package-${d}.zip`,
  };
}

export interface PackageResult {
  mode: PackageMode;
  pdfFilename: string;
  csvFilename: string;
  zipFilename: string | null;
  message: string;
}

interface DownloadDeps {
  /** Inject a JSZip-like constructor for tests / opt-out. */
  zipCtor?: (new () => {
    file: (name: string, data: Uint8Array | string) => void;
    generateAsync: (opts: { type: "uint8array" }) => Promise<Uint8Array>;
  }) | null;
  /** Override raw downloaders for tests. */
  downloadPdf?: (bytes: Uint8Array, filename: string) => void;
  downloadCsv?: (csv: { filename: string; contents: string }) => void;
  downloadBlob?: (bytes: Uint8Array, filename: string, mime: string) => void;
}

function defaultDownloadBlob(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build the package payloads from a single redacted report input.
 * Always returns both bytes so the caller can choose to zip them or
 * stream them as sequential downloads.
 */
export function buildAiDoctorReportPackage(input: AiDoctorReportInput): {
  pdfBytes: Uint8Array;
  csv: { filename: string; contents: string };
  filenames: PackageFilenames;
} {
  const filenames = buildPackageFilenames(input.generatedAt);
  const pdfBytes = buildAiDoctorReportPdfBytes(input);
  const csv = buildAiDoctorEvidenceCsv(input);
  // Force deterministic filenames driven by generatedAt.
  csv.filename = filenames.csv;
  return { pdfBytes, csv, filenames };
}

/**
 * Download the package. When a JSZip-like constructor is available, the
 * caller gets a single .zip; otherwise the PDF and CSV are downloaded
 * sequentially and a friendly toast message is returned for surfacing.
 */
export async function downloadAiDoctorReportPackage(
  input: AiDoctorReportInput,
  deps: DownloadDeps = {},
): Promise<PackageResult> {
  const { pdfBytes, csv, filenames } = buildAiDoctorReportPackage(input);
  const downloadPdf = deps.downloadPdf ?? downloadAiDoctorReportPdf;
  const downloadCsv = deps.downloadCsv ?? downloadAiDoctorEvidenceCsv;
  const downloadBlob = deps.downloadBlob ?? defaultDownloadBlob;

  if (deps.zipCtor) {
    try {
      const zip = new deps.zipCtor();
      zip.file(filenames.pdf, pdfBytes);
      zip.file(filenames.csv, csv.contents);
      const bytes = await zip.generateAsync({ type: "uint8array" });
      downloadBlob(bytes, filenames.zip, "application/zip");
      return {
        mode: "zip",
        pdfFilename: filenames.pdf,
        csvFilename: filenames.csv,
        zipFilename: filenames.zip,
        message: `Downloaded AI Doctor package (${filenames.zip}).`,
      };
    } catch {
      /* fall through to sequential */
    }
  }

  downloadPdf(pdfBytes, filenames.pdf);
  downloadCsv({ filename: filenames.csv, contents: csv.contents });
  return {
    mode: "sequential",
    pdfFilename: filenames.pdf,
    csvFilename: filenames.csv,
    zipFilename: null,
    message: "Downloaded AI Doctor PDF and Evidence CSV.",
  };
}
