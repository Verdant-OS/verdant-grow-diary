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

export interface GeneticsImportDuplicateColumn {
  /** Original header text as it appeared in the spreadsheet. */
  header: string;
  /** 0-based column index. */
  columnIndex: number;
}

export interface GeneticsImportFileWarning {
  field: string;
  message: string;
  /** Column actually used for this canonical field (optional metadata). */
  usedColumn?: GeneticsImportDuplicateColumn;
  /** Columns ignored because they mapped to the same canonical field. */
  ignoredColumns?: GeneticsImportDuplicateColumn[];
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

type CanonicalField = "strain" | "breeder" | "seed_type" | "lineage" | "flowering_weeks" | "notes";

/** Canonical header aliases we accept for each logical column. */
const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  strain: [
    "strain",
    "strain name",
    "variety",
    "variety name",
    "cultivar",
    "cultivar name",
    "genetics",
    "name",
  ],
  breeder: ["breeder", "breeder name", "company", "seed bank", "seedbank", "source", "bank"],
  seed_type: ["seed type", "seedtype", "type", "category", "genetics type", "seed class"],
  lineage: ["lineage", "parents", "parentage", "cross", "genetics lineage"],
  flowering_weeks: [
    "flowering weeks",
    "flower weeks",
    "flowering time",
    "flower time",
    "flowering",
    "weeks",
    "days to harvest",
  ],
  notes: ["notes", "note", "description", "comments", "remarks"],
};

/**
 * Normalize a header cell: lowercase, collapse separators (space, underscore,
 * hyphen) to single spaces, strip non-alphanumeric punctuation, trim.
 * Deterministic.
 */
function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface HeaderMapping {
  index: Record<CanonicalField, number | undefined>;
  /** Per-field metadata about which column was used and which were ignored. */
  duplicates: Record<
    CanonicalField,
    { used: GeneticsImportDuplicateColumn; ignored: GeneticsImportDuplicateColumn[] } | undefined
  >;
}

function originalHeader(headerRow: ReadonlyArray<unknown>, idx: number): string {
  const v = headerRow[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function mapHeaders(headerRow: ReadonlyArray<unknown>): HeaderMapping {
  const index: Record<string, number | undefined> = {};
  const ignored: Record<string, GeneticsImportDuplicateColumn[]> = {};
  const recordIgnored = (field: string, idx: number) => {
    const list = ignored[field] ?? (ignored[field] = []);
    if (!list.some((c) => c.columnIndex === idx)) {
      list.push({ header: originalHeader(headerRow, idx), columnIndex: idx });
    }
  };
  // First detected column wins for each canonical field. Later columns
  // that map to the same canonical field are recorded as ignored.
  headerRow.forEach((cell, idx) => {
    const n = normalizeHeader(cell);
    if (!n) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (key !== n && !aliases.includes(n)) continue;
      if (index[key] === undefined) {
        index[key] = idx;
      } else if (index[key] !== idx) {
        recordIgnored(key, idx);
      }
    }
  });
  const duplicates: HeaderMapping["duplicates"] = {} as HeaderMapping["duplicates"];
  for (const key of Object.keys(HEADER_ALIASES) as CanonicalField[]) {
    const ig = ignored[key];
    const usedIdx = index[key];
    if (ig && ig.length > 0 && usedIdx !== undefined) {
      duplicates[key] = {
        used: { header: originalHeader(headerRow, usedIdx), columnIndex: usedIdx },
        ignored: ig,
      };
    } else {
      duplicates[key] = undefined;
    }
  }
  return { index: index as HeaderMapping["index"], duplicates };
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

export function buildGeneticsImportPreview(grid: GeneticsCellGrid): GeneticsImportPreviewResult {
  const empty: GeneticsImportPreviewResult = {
    rows: [],
    fileLevelError: null,
    fileWarnings: [],
    totals: { total: 0, valid: 0, warning: 0, blocked: 0 },
  };
  if (!grid || grid.length === 0) {
    return {
      ...empty,
      fileLevelError: "The uploaded file does not contain a recognizable genetics sheet.",
    };
  }
  const headerRow = grid[0] ?? [];
  const { index: map, duplicates } = mapHeaders(headerRow);
  const hasAnyKnown =
    map.strain !== undefined || map.breeder !== undefined || map.seed_type !== undefined;
  if (!hasAnyKnown) {
    return {
      ...empty,
      fileLevelError: "The uploaded file does not contain a recognizable genetics sheet.",
    };
  }

  const fileWarnings: GeneticsImportFileWarning[] = [];
  for (const key of Object.keys(HEADER_ALIASES) as CanonicalField[]) {
    const dup = duplicates[key];
    if (!dup) continue;
    const usedLabel = dup.used.header || `column ${dup.used.columnIndex + 1}`;
    const ignoredLabels = dup.ignored
      .map((c) => `"${c.header || `column ${c.columnIndex + 1}`}"`)
      .join(", ");
    fileWarnings.push({
      field: key,
      message: `Field "${key}" used column "${usedLabel}" and ignored ${ignoredLabels}.`,
      usedColumn: dup.used,
      ignoredColumns: dup.ignored,
    });
  }

  const rows: GeneticsImportPreviewRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] ?? [];
    if (isRowEffectivelyEmpty(raw)) continue;
    const rowNumber = i + 1; // 1-based, matching spreadsheet display

    const strain = map.strain !== undefined ? toTrimmedString(raw[map.strain]) : null;
    const breeder = map.breeder !== undefined ? toTrimmedString(raw[map.breeder]) : null;
    const rawSeedType = map.seed_type !== undefined ? toTrimmedString(raw[map.seed_type]) : null;
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
    const status: GeneticsImportRowStatus = hasError ? "blocked" : hasWarning ? "warning" : "valid";

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

  return { rows, fileLevelError: null, fileWarnings, totals };
}

export function selectImportableRows(
  result: GeneticsImportPreviewResult,
): GeneticsImportPreviewRow[] {
  return result.rows.filter((r) => r.status !== "blocked");
}

// -- CSV export helpers (preview-only, no I/O) ------------------------------

/** Escape a single CSV field per RFC 4180 (quote if it contains , " \r \n). */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export const GENETICS_VALIDATION_REPORT_FILENAME =
  "verdant-genetics-validation-report.csv" as const;

export const GENETICS_TEMPLATE_CSV_FILENAME = "verdant-genetics-template.csv" as const;

export const GENETICS_VALIDATION_REPORT_COLUMNS = [
  "row_number",
  "status",
  "strain",
  "breeder",
  "seed_type",
  "lineage",
  "flowering_weeks",
  "messages",
] as const;

export function buildGeneticsValidationReportCsv(result: GeneticsImportPreviewResult): string {
  const header = [...GENETICS_VALIDATION_REPORT_COLUMNS] as unknown as string[];
  const body = result.rows.map((r) => [
    r.rowNumber,
    r.status,
    r.strain ?? "",
    r.breeder ?? "",
    r.seedType ?? r.rawSeedType ?? "",
    r.lineage ?? "",
    r.floweringWeeks ?? "",
    r.issues.map((i) => i.message).join(" | "),
  ]);
  return toCsv([header, ...body]);
}

export const GENETICS_TEMPLATE_REQUIRED_COLUMNS = ["strain", "breeder", "seed_type"] as const;

export const GENETICS_TEMPLATE_OPTIONAL_COLUMNS = ["lineage", "flowering_weeks", "notes"] as const;

export const GENETICS_TEMPLATE_EXAMPLE_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  ["Example Auto", "Example Breeder", "autoflower", "", "9", ""],
  ["Example Fem", "Example Breeder", "feminized", "", "8", ""],
  ["Example Regular", "Example Breeder", "regular", "", "9", ""],
];

export function buildGeneticsTemplateCsv(): string {
  const header = [
    ...GENETICS_TEMPLATE_REQUIRED_COLUMNS,
    ...GENETICS_TEMPLATE_OPTIONAL_COLUMNS,
  ] as unknown as string[];
  return toCsv([header, ...GENETICS_TEMPLATE_EXAMPLE_ROWS]);
}
