/**
 * verdantGeneticsImportPreviewRules — pure, deterministic validation
 * helpers for the Operator Genetics XLSX Import Preview UI.
 *
 * Scope: takes a raw cell grid (header row + data rows) representing a
 * varieties / genetics sheet (strain, breeder, seed type, lineage,
 * flowering time, notes) and produces typed preview rows with
 * row-numbered errors and warnings.
 *
 * Safety:
 *   - No I/O, no Supabase, no network, no AI, no Action Queue, no
 *     alerts, no device control. Pure functions only.
 *   - Output is preview-only. This module does not write anything.
 *   - "live" labels are intentionally never produced.
 */

export type GeneticsCellGrid = ReadonlyArray<ReadonlyArray<unknown>>;

export type SeedType = "regular" | "feminized" | "autoflower" | "clone";

export const ALLOWED_SEED_TYPES: readonly SeedType[] = [
  "regular",
  "feminized",
  "autoflower",
  "clone",
] as const;

export const GENETICS_REQUIRED_FIELDS = ["strain", "breeder", "seed_type"] as const;
export type GeneticsRequiredField = (typeof GENETICS_REQUIRED_FIELDS)[number];

export type GeneticsImportRowStatus = "valid" | "warning" | "blocked";

export interface GeneticsImportRowIssue {
  /** 1-based row number as the user would see it in their spreadsheet. */
  rowNumber: number;
  field: GeneticsRequiredField | "seed_type_value" | "flowering_weeks" | "row";
  severity: "error" | "warning";
  message: string;
}

export interface GeneticsImportPreviewRow {
  rowNumber: number;
  strain: string | null;
  breeder: string | null;
  seedType: SeedType | null;
  rawSeedType: string | null;
  lineage: string | null;
  floweringWeeks: number | null;
  notes: string | null;
  status: GeneticsImportRowStatus;
  missingRequired: GeneticsRequiredField[];
  issues: GeneticsImportRowIssue[];
}

export interface GeneticsImportFileWarning {
  field: string;
  message: string;
}

export interface GeneticsImportPreviewResult {
  rows: GeneticsImportPreviewRow[];
  fileLevelError: string | null;
  fileWarnings: GeneticsImportFileWarning[];
  totals: {
    total: number;
    valid: number;
    warning: number;
    blocked: number;
  };
}

/** Canonical header aliases we accept for each logical column. */
const HEADER_ALIASES: Record<
  "strain" | "breeder" | "seed_type" | "lineage" | "flowering_weeks" | "notes",
  string[]
> = {
  strain: ["strain", "variety", "variety name", "strain name", "name"],
  breeder: ["breeder", "bank", "seed bank"],
  seed_type: ["seed type", "type", "seedtype"],
  lineage: ["lineage", "parents", "genetics"],
  flowering_weeks: [
    "flowering time",
    "flowering weeks",
    "flower time",
    "flower weeks",
    "flowering",
  ],
  notes: ["notes", "note", "comments"],
};

function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/_/g, " ");
}

function mapHeaders(headerRow: ReadonlyArray<unknown>): Record<string, number> {
  const mapping: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const n = normalizeHeader(cell);
    if (!n) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[key] !== undefined) continue;
      if (aliases.includes(n)) mapping[key] = idx;
    }
  });
  return mapping;
}

function toTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function normalizeSeedType(raw: string | null): SeedType | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (["reg", "regular", "regs"].includes(v)) return "regular";
  if (["fem", "feminized", "feminised"].includes(v)) return "feminized";
  if (["auto", "autoflower", "autoflowering"].includes(v)) return "autoflower";
  if (["clone", "cutting"].includes(v)) return "clone";
  return null;
}

function parseFloweringWeeks(value: unknown): {
  weeks: number | null;
  invalid: boolean;
} {
  if (value === null || value === undefined || value === "") {
    return { weeks: null, invalid: false };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value <= 30) return { weeks: value, invalid: false };
    return { weeks: null, invalid: true };
  }
  const s = String(value).trim();
  const match = s.match(/(\d+(?:\.\d+)?)/);
  if (!match) return { weeks: null, invalid: true };
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 30) {
    return { weeks: null, invalid: true };
  }
  return { weeks: n, invalid: false };
}

function isRowEffectivelyEmpty(row: ReadonlyArray<unknown>): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === "");
}

export function buildGeneticsImportPreview(
  grid: GeneticsCellGrid,
): GeneticsImportPreviewResult {
  const empty: GeneticsImportPreviewResult = {
    rows: [],
    fileLevelError: null,
    totals: { total: 0, valid: 0, warning: 0, blocked: 0 },
  };
  if (!grid || grid.length === 0) {
    return {
      ...empty,
      fileLevelError:
        "The uploaded file does not contain a recognizable genetics sheet.",
    };
  }
  const headerRow = grid[0] ?? [];
  const map = mapHeaders(headerRow);
  const hasAnyKnown =
    map.strain !== undefined ||
    map.breeder !== undefined ||
    map.seed_type !== undefined;
  if (!hasAnyKnown) {
    return {
      ...empty,
      fileLevelError:
        "The uploaded file does not contain a recognizable genetics sheet.",
    };
  }

  const rows: GeneticsImportPreviewRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] ?? [];
    if (isRowEffectivelyEmpty(raw)) continue;
    const rowNumber = i + 1; // 1-based, matching spreadsheet display

    const strain = map.strain !== undefined ? toTrimmedString(raw[map.strain]) : null;
    const breeder = map.breeder !== undefined ? toTrimmedString(raw[map.breeder]) : null;
    const rawSeedType =
      map.seed_type !== undefined ? toTrimmedString(raw[map.seed_type]) : null;
    const seedType = normalizeSeedType(rawSeedType);
    const lineage = map.lineage !== undefined ? toTrimmedString(raw[map.lineage]) : null;
    const notes = map.notes !== undefined ? toTrimmedString(raw[map.notes]) : null;
    const { weeks: floweringWeeks, invalid: floweringInvalid } =
      map.flowering_weeks !== undefined
        ? parseFloweringWeeks(raw[map.flowering_weeks])
        : { weeks: null, invalid: false };

    const issues: GeneticsImportRowIssue[] = [];
    const missingRequired: GeneticsRequiredField[] = [];

    if (!strain) {
      missingRequired.push("strain");
      issues.push({
        rowNumber,
        field: "strain",
        severity: "error",
        message: `Row ${rowNumber} is missing strain name.`,
      });
    }
    if (!breeder) {
      missingRequired.push("breeder");
      issues.push({
        rowNumber,
        field: "breeder",
        severity: "error",
        message: `Row ${rowNumber} is missing breeder.`,
      });
    }
    if (!rawSeedType) {
      missingRequired.push("seed_type");
      issues.push({
        rowNumber,
        field: "seed_type",
        severity: "error",
        message: `Row ${rowNumber} is missing seed type.`,
      });
    } else if (!seedType) {
      issues.push({
        rowNumber,
        field: "seed_type_value",
        severity: "error",
        message: `Row ${rowNumber} has an invalid seed type.`,
      });
    }
    if (floweringInvalid) {
      issues.push({
        rowNumber,
        field: "flowering_weeks",
        severity: "warning",
        message: `Row ${rowNumber} has an unrecognized flowering time.`,
      });
    }

    const hasError = issues.some((i) => i.severity === "error");
    const hasWarning = issues.some((i) => i.severity === "warning");
    const status: GeneticsImportRowStatus = hasError
      ? "blocked"
      : hasWarning
        ? "warning"
        : "valid";

    rows.push({
      rowNumber,
      strain,
      breeder,
      seedType,
      rawSeedType,
      lineage,
      floweringWeeks,
      notes,
      status,
      missingRequired,
      issues,
    });
  }

  const totals = {
    total: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    warning: rows.filter((r) => r.status === "warning").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
  };

  return { rows, fileLevelError: null, totals };
}

export function selectImportableRows(
  result: GeneticsImportPreviewResult,
): GeneticsImportPreviewRow[] {
  return result.rows.filter((r) => r.status !== "blocked");
}
