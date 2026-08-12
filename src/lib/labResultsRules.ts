/**
 * labResultsRules — pure view rules for the Plant Detail "Lab results" panel.
 *
 * Turns a plant's grower-entered lab test rows (transcribed from a Certificate
 * of Analysis) into display cards, and validates a new-entry draft before it
 * is saved.
 *
 * Hard constraints (repo rules-module style):
 *   - Pure & deterministic: clock injected via `now`; no I/O, no React.
 *   - Honest: values are what the grower transcribed — never verified, never
 *     compared or ranked across plants. Calculated totals are explicitly
 *     labeled as calculated, with the formula stated in the honesty note.
 *   - Calm copy: none of the banned marketing words (paywallCtaViewModel).
 */

export interface LabTestRow {
  id: string;
  /** ISO timestamp of the test date as recorded. */
  testedAt: string | null;
  /**
   * Row creation timestamp — the sort tie-breaker. Date-only entry gives
   * every same-day test an identical midnight tested_at, so without this the
   * card order could flap between refreshes.
   */
  createdAt: string | null;
  thcaPercent: number | null;
  thcPercent: number | null;
  cbdaPercent: number | null;
  cbdPercent: number | null;
  /** Raw jsonb from the row — validated here, never trusted. */
  terpenes: unknown;
  labName: string | null;
  note: string | null;
}

export interface LabResultCardView {
  id: string;
  /** e.g. "Mar 14, 2026" or "Date not recorded". */
  dateLabel: string;
  labName: string | null;
  /** Only the cannabinoids present on the row, in a fixed order. */
  cannabinoids: Array<{ key: string; label: string; valueLabel: string }>;
  /** Calculated total THC (THCa × 0.877 + THC), when computable. */
  totalThcLabel: string | null;
  /** Calculated total CBD (CBDa × 0.877 + CBD), when computable. */
  totalCbdLabel: string | null;
  /** Valid terpene entries sorted by percentage, highest first. */
  terpenes: Array<{ name: string; valueLabel: string }>;
  note: string | null;
}

export interface LabResultsView {
  hasAny: boolean;
  count: number;
  cards: LabResultCardView[];
  emptyCopy: string;
  honestyNote: string;
}

export const LAB_RESULTS_HEADING = "Lab results";

export const LAB_RESULTS_EMPTY_COPY =
  "No lab results recorded yet. Add one from a lab report to build this plant's evidence record.";

/** Shown under the cards; states exactly where numbers come from. */
export const LAB_RESULTS_HONESTY_NOTE =
  "Entered by you from your lab report. Totals are calculated as acid form × 0.877 + neutral form.";

export const LAB_RESULTS_ADD_LABEL = "Add lab result";

/** Standard decarboxylation factor for acid → neutral cannabinoid mass. */
export const DECARB_FACTOR = 0.877;

function isPercent(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** "24.5%" — up to 2 decimals, trailing zeros trimmed. */
export function formatPercent(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return `${rounded}%`;
}

/**
 * Total = acid × 0.877 + neutral. Computable when at least one part is
 * present; a missing part contributes 0 (the COA simply didn't list it).
 */
export function calculateDecarbTotal(
  acidPercent: number | null,
  neutralPercent: number | null,
): number | null {
  const hasAcid = isPercent(acidPercent);
  const hasNeutral = isPercent(neutralPercent);
  if (!hasAcid && !hasNeutral) return null;
  return (hasAcid ? acidPercent * DECARB_FACTOR : 0) + (hasNeutral ? neutralPercent : 0);
}

function parseTerpenes(raw: unknown): Array<{ name: string; value: number }> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entries: Array<{ name: string; value: number }> = [];
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (name.trim().length === 0) continue;
    if (!isPercent(value)) continue;
    entries.push({ name: name.trim(), value });
  }
  entries.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return entries;
}

/**
 * Formatted in UTC on purpose: the draft validator stores the entered
 * date-only value as midnight UTC, so formatting that instant in the
 * browser's LOCAL timezone would shift the recorded COA date back a day for
 * every grower west of UTC. A lab report date is a calendar date, not an
 * instant — UTC formatting preserves it exactly as entered.
 */
function formatDateLabel(iso: string | null): string {
  if (typeof iso !== "string" || iso.length === 0) return "Date not recorded";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Date not recorded";
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const CANNABINOID_FIELDS: Array<{
  key: keyof Pick<LabTestRow, "thcaPercent" | "thcPercent" | "cbdaPercent" | "cbdPercent">;
  label: string;
}> = [
  { key: "thcaPercent", label: "THCa" },
  { key: "thcPercent", label: "THC" },
  { key: "cbdaPercent", label: "CBDa" },
  { key: "cbdPercent", label: "CBD" },
];

/** Newest created first; missing created_at sinks; id is the final tie. */
function tieBreak(a: LabTestRow, b: LabTestRow): number {
  const ca = a.createdAt ? Date.parse(a.createdAt) : NaN;
  const cb = b.createdAt ? Date.parse(b.createdAt) : NaN;
  if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return cb - ca;
  if (Number.isFinite(ca) && !Number.isFinite(cb)) return -1;
  if (!Number.isFinite(ca) && Number.isFinite(cb)) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildLabResultsView(
  rows: ReadonlyArray<LabTestRow> | null | undefined,
): LabResultsView {
  const cards: LabResultCardView[] = (rows ?? [])
    .slice()
    .sort((a, b) => {
      const ta = a.testedAt ? Date.parse(a.testedAt) : NaN;
      const tb = b.testedAt ? Date.parse(b.testedAt) : NaN;
      // Newest first; rows without a valid date sink to the end. Ties (all
      // same-day tests share midnight) break on created_at then id so the
      // order is deterministic across refreshes.
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return tieBreak(a, b);
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      if (tb !== ta) return tb - ta;
      return tieBreak(a, b);
    })
    .map((row) => {
      const cannabinoids = CANNABINOID_FIELDS.flatMap(({ key, label }) => {
        const v = row[key];
        return isPercent(v) ? [{ key, label, valueLabel: formatPercent(v) }] : [];
      });
      const totalThc = calculateDecarbTotal(row.thcaPercent, row.thcPercent);
      const totalCbd = calculateDecarbTotal(row.cbdaPercent, row.cbdPercent);
      return {
        id: row.id,
        dateLabel: formatDateLabel(row.testedAt),
        labName:
          typeof row.labName === "string" && row.labName.trim().length > 0
            ? row.labName.trim()
            : null,
        cannabinoids,
        totalThcLabel: totalThc === null ? null : formatPercent(totalThc),
        totalCbdLabel: totalCbd === null ? null : formatPercent(totalCbd),
        terpenes: parseTerpenes(row.terpenes).map((t) => ({
          name: t.name,
          valueLabel: formatPercent(t.value),
        })),
        note: typeof row.note === "string" && row.note.trim().length > 0 ? row.note.trim() : null,
      };
    });

  return {
    hasAny: cards.length > 0,
    count: cards.length,
    cards,
    emptyCopy: LAB_RESULTS_EMPTY_COPY,
    honestyNote: LAB_RESULTS_HONESTY_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Draft validation (before save)
// ---------------------------------------------------------------------------

export interface LabTestDraft {
  /** ISO date string from the form's date input (e.g. "2026-08-12"). */
  testedAt: string;
  /** Raw form strings — empty means "not on the report". */
  thcaPercent: string;
  thcPercent: string;
  cbdaPercent: string;
  cbdPercent: string;
  terpenes: Array<{ name: string; percent: string }>;
  labName: string;
  note: string;
}

export interface LabTestPayload {
  tested_at: string;
  thca_percent: number | null;
  thc_percent: number | null;
  cbda_percent: number | null;
  cbd_percent: number | null;
  terpenes: Record<string, number>;
  lab_name: string | null;
  note: string | null;
}

export interface LabTestDraftResult {
  ok: boolean;
  errors: string[];
  payload: LabTestPayload | null;
}

function parsePercentField(raw: string, label: string, errors: string[]): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const v = Number(trimmed);
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    errors.push(`${label} must be a percentage between 0 and 100.`);
    return null;
  }
  return v;
}

export function validateLabTestDraft(draft: LabTestDraft, now: number): LabTestDraftResult {
  const errors: string[] = [];

  const testedMs = Date.parse(draft.testedAt);
  if (!Number.isFinite(testedMs)) {
    errors.push("Test date is required.");
  } else {
    // Compare CALENDAR dates, not instants. The form value is date-only
    // (parsed as midnight UTC), so an instant comparison would wrongly
    // reject "today" for growers east of UTC (their local today can be
    // tomorrow in UTC) — the same timezone class of bug as the display fix.
    const local = new Date(now);
    const localToday = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    if (draft.testedAt.slice(0, 10) > localToday) {
      errors.push("Test date cannot be in the future.");
    }
  }

  const thca = parsePercentField(draft.thcaPercent, "THCa", errors);
  const thc = parsePercentField(draft.thcPercent, "THC", errors);
  const cbda = parsePercentField(draft.cbdaPercent, "CBDa", errors);
  const cbd = parsePercentField(draft.cbdPercent, "CBD", errors);

  const terpenes: Record<string, number> = {};
  for (const entry of draft.terpenes) {
    const name = entry.name.trim();
    const rawValue = entry.percent.trim();
    if (name.length === 0 && rawValue.length === 0) continue; // blank row
    if (name.length === 0) {
      errors.push("Each terpene needs a name.");
      continue;
    }
    if (name.length > 64) {
      errors.push("Terpene names must be 64 characters or fewer.");
      continue;
    }
    const v = Number(rawValue);
    if (rawValue.length === 0 || !Number.isFinite(v) || v < 0 || v > 100) {
      errors.push(`Terpene "${name}" needs a percentage between 0 and 100.`);
      continue;
    }
    // Object keys collapse duplicates silently — a second row with the same
    // name would overwrite the first measurement unrecoverably. Refuse it.
    if (name in terpenes) {
      errors.push(`Terpene "${name}" is listed more than once.`);
      continue;
    }
    terpenes[name] = v;
  }

  const hasAnyMeasurement =
    thca !== null ||
    thc !== null ||
    cbda !== null ||
    cbd !== null ||
    Object.keys(terpenes).length > 0;
  if (!hasAnyMeasurement) {
    errors.push("Enter at least one measurement from the report.");
  }

  if (errors.length > 0) return { ok: false, errors, payload: null };

  const labName = draft.labName.trim();
  const note = draft.note.trim();
  return {
    ok: true,
    errors: [],
    payload: {
      tested_at: new Date(testedMs).toISOString(),
      thca_percent: thca,
      thc_percent: thc,
      cbda_percent: cbda,
      cbd_percent: cbd,
      terpenes,
      lab_name: labName.length > 0 ? labName : null,
      note: note.length > 0 ? note : null,
    },
  };
}
