/**
 * verdantGeneticsXlsxFileLoader — UI/import-boundary helper that lazily
 * loads SheetJS to convert an uploaded .xlsx File into the CellGrid the
 * pure Verdant Genetics parser consumes.
 *
 * This module is the ONLY place the xlsx dependency is allowed in the
 * Verdant Genetics XLSX preview flow. Pure parsing and the view-model
 * stay dep-free and unit-testable.
 *
 * Safety:
 *   - No Supabase, no network, no inserts, no alerts, no Action Queue,
 *     no AI, no device control.
 *   - The File is read in-browser via ArrayBuffer; bytes never leave the
 *     browser.
 */
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";

export interface XlsxFileToGridOptions {
  /** Sheet index (defaults to first sheet). */
  sheetIndex?: number;
}

export async function readXlsxFileToCellGrid(
  file: File,
  opts: XlsxFileToGridOptions = {},
): Promise<CellGrid> {
  const buffer = await file.arrayBuffer();
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[opts.sheetIndex ?? 0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return aoa as CellGrid;
}
