/**
 * plantFeedingDisplayRules — pure helpers for surfacing a feeding entry's
 * nutrient line name and stripping the database `(quick log)` note placeholder
 * on plant-scoped activity and history surfaces.
 *
 * Pure: no React, no I/O, no clock, no randomness.
 */

const SECRET_HINT_RE =
  /(secret|token|api[_-]?key|password|service[_-]?role|bearer\s|^eyJ[A-Za-z0-9_-]{8,}\.|^sk_(live|test)_|^sb_|^pk_(live|test)_)/i;

const MAX_LINE_NAME_LENGTH = 120;

type PlainRecord = Record<string, unknown>;

function asPlainRecord(value: unknown): PlainRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as PlainRecord)
    : null;
}

function parseDetailsRecord(rawDetails: unknown): PlainRecord | null {
  if (rawDetails == null) return null;
  if (typeof rawDetails === "string") {
    const trimmed = rawDetails.trim();
    if (!trimmed) return null;
    try {
      return asPlainRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return asPlainRecord(rawDetails);
}

function cleanLineCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_LINE_NAME_LENGTH ||
    trimmed.toLowerCase() === "default" ||
    SECRET_HINT_RE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

/**
 * True when `note` is the database placeholder `(quick log)` written by
 * `quicklog_save_event` / `quicklog_save_manual` when `p_note` is empty.
 */
export function isQuickLogPlaceholderNote(note: unknown): boolean {
  return typeof note === "string" && note.trim().toLowerCase() === "(quick log)";
}

/**
 * Resolve a feeding entry's nutrient line name from raw or normalized details.
 * Returns `null` when absent, `"default"`, over-long, or secret-like.
 */
export function resolveFeedingNutrientLineName(details: unknown): string | null {
  const record = parseDetailsRecord(details);
  if (!record) return null;

  const feeding = asPlainRecord(record.feeding);
  if (feeding) {
    for (const key of [
      "line_id",
      "lineId",
      "nutrient_line_id",
      "nutrientLineId",
      "nutrient_line",
      "nutrientLine",
      "recipe",
      "nutrient_brand",
      "nutrientBrand",
    ]) {
      const candidate = cleanLineCandidate(feeding[key]);
      if (candidate) return candidate;
    }
  }

  for (const key of [
    "nutrient_line_id",
    "nutrientLineId",
    "line_id",
    "lineId",
    "nutrient_line",
    "nutrientLine",
    "recipe",
    "recipe_name",
    "recipeName",
    "feed_recipe",
    "feedRecipe",
    "nutrient_brand",
    "nutrientBrand",
  ]) {
    const candidate = cleanLineCandidate(record[key]);
    if (candidate) return candidate;
  }

  const rootZone = asPlainRecord(record.root_zone_v1);
  if (rootZone) {
    const candidate = cleanLineCandidate(rootZone.nutrientLine);
    if (candidate) return candidate;
  }

  return null;
}

/**
 * True only when the note already IS the line name, or already starts with the
 * `<line> · ` prefix this module prepends. A grower note that merely contains
 * the line text (line "Grow", note "Strong growth today") is not a match.
 */
function noteAlreadyShowsLine(note: string, lineName: string): boolean {
  const lowerNote = note.toLowerCase();
  const lowerLine = lineName.toLowerCase();
  return lowerNote === lowerLine || lowerNote.startsWith(`${lowerLine} · `);
}

function isFeedingRow(row: PlainRecord, details: PlainRecord | null): boolean {
  for (const key of ["entry_type", "entryType", "event_type", "eventType", "type"]) {
    const v = row[key];
    if (typeof v === "string") {
      const lower = v.trim().toLowerCase();
      if (lower === "feeding" || lower === "feed") return true;
    }
  }
  if (details) {
    for (const key of ["event_type", "eventType", "declaredEventType"]) {
      const v = details[key];
      if (typeof v === "string") {
        const lower = v.trim().toLowerCase();
        if (lower === "feeding" || lower === "feed") return true;
      }
    }
    if (asPlainRecord(details.feeding) !== null) return true;
  }
  return false;
}

/**
 * Enrich a single raw diary row for plant-page display when it represents a
 * feeding event:
 *  - Replaces the `(quick log)` note placeholder with the nutrient line name
 *    (or `""` if no line name exists), or prepends the nutrient line name
 *    when a custom grower note is also present.
 *  - Lifts nested `details.feeding` fields (`volume_ml`, `ph`, `ec_in`, etc.)
 *    so downstream diary normalizers and identity resolvers see them.
 * Non-feeding rows are returned untouched (`=== row`).
 */
export function enrichPlantFeedingDiaryRow<T>(row: T): T {
  const r = asPlainRecord(row);
  if (!r) return row;
  const details = parseDetailsRecord(r.details);
  if (!isFeedingRow(r, details)) return row;

  const lineName = resolveFeedingNutrientLineName(details);
  const rawNote = typeof r.note === "string" ? r.note.trim() : "";
  const placeholder = isQuickLogPlaceholderNote(rawNote);

  let nextNote = r.note;
  if (placeholder || rawNote === "") {
    if (lineName) {
      nextNote = lineName;
    } else if (placeholder) {
      nextNote = "";
    }
  } else if (lineName && !noteAlreadyShowsLine(rawNote, lineName)) {
    nextNote = `${lineName} · ${rawNote}`;
  }

  let nextDetails: PlainRecord | null = null;
  const ensureDetails = (): PlainRecord => {
    if (!nextDetails) nextDetails = { ...(details ?? {}) };
    return nextDetails;
  };

  const feeding = details ? asPlainRecord(details.feeding) : null;
  if (feeding && details) {
    if (
      feeding.volume_ml != null &&
      details.watering_amount_ml == null &&
      details.wateringAmountMl == null &&
      details.watering_amount == null &&
      details.wateringAmount == null
    ) {
      ensureDetails().watering_amount_ml = feeding.volume_ml;
    }
    if (feeding.ph != null && details.ph == null && details.pH == null) {
      ensureDetails().ph = feeding.ph;
    }
    const ec = feeding.ec_in ?? feeding.ec_ms_cm;
    if (ec != null && details.ec == null && details.EC == null) {
      ensureDetails().ec = ec;
    }
    if (feeding.ec_out != null && details.ec_out == null && details.ecOut == null) {
      ensureDetails().ec_out = feeding.ec_out;
    }
    if (feeding.runoff_ml != null && details.runoff_ml == null && details.runoffMl == null) {
      ensureDetails().runoff_ml = feeding.runoff_ml;
    }
    if (feeding.runoff_ph != null && details.runoff_ph == null && details.runoffPh == null) {
      ensureDetails().runoff_ph = feeding.runoff_ph;
    }
    if (feeding.runoff_ec != null && details.runoff_ec == null && details.runoffEc == null) {
      ensureDetails().runoff_ec = feeding.runoff_ec;
    }
    if (
      feeding.water_temp_c != null &&
      details.water_temp_c == null &&
      details.waterTempC == null
    ) {
      ensureDetails().water_temp_c = feeding.water_temp_c;
    }
    const products = feeding.products ?? feeding.nutrients;
    if (Array.isArray(products) && details.nutrients == null) {
      ensureDetails().nutrients = products;
    }
  }

  if (lineName && details) {
    if (details.nutrient_line_id == null && details.nutrientLineId == null) {
      ensureDetails().nutrient_line_id = lineName;
    }
    if (details.recipe == null) {
      ensureDetails().recipe = lineName;
    }
  }

  if (nextNote === r.note && nextDetails === null) return row;

  return {
    ...r,
    ...(nextNote !== r.note ? { note: nextNote } : {}),
    ...(nextDetails !== null ? { details: nextDetails } : {}),
  } as unknown as T;
}

export function enrichPlantFeedingDiaryRows<T>(rows: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => enrichPlantFeedingDiaryRow(row));
}
