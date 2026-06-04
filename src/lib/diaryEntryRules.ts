/**
 * diaryEntryRules — pure helpers that normalize raw `diary_entries` rows
 * (and their loose `details` jsonb) into a typed, safe shape for the
 * timeline, AI context, and future typed watering/feeding/photo migration.
 *
 * Pure & deterministic. No React. No Supabase. Safe against malformed
 * jsonb, NaN/Infinity, invalid dates, and unknown keys. Warning messages
 * never echo raw payload values.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiaryEntryDetailsExtras {
  [key: string]: unknown;
}

export interface NormalizedDiaryDetails {
  ph?: number;
  ec?: number;
  tds?: number;
  runoffPh?: number;
  runoffEc?: number;
  runoffTds?: number;
  /** Watering amount in millilitres (normalized). */
  wateringAmountMl?: number;
  nutrients?: ReadonlyArray<{ name: string; amount?: number; unit?: string }>;
  trainingActions?: readonly string[];
  symptoms?: readonly string[];
  observations?: string;
  sensorSnapshot?: {
    at?: string;
    temp?: number;
    rh?: number;
    vpd?: number;
    co2?: number;
    ph?: number;
    ec?: number;
    /** Declared source string from the sensor-reading row (e.g. "live", "manual"). */
    source?: string;
    /** Narrowed state: "live" | "manual" | "stale" | "invalid". */
    state?: string;
    /** Optional vendor lineage (lineage only — never auth/ownership). */
    vendor?: string;
  };
  remindAt?: string;
  /** Unknown but preserved keys (sanitized — no functions, no class instances). */
  extras?: DiaryEntryDetailsExtras;
}

export interface NormalizedDiaryEntry {
  id: string;
  growId: string | null;
  plantId: string | null;
  tentId: string | null;
  stage: string | null;
  eventType: string;
  note: string;
  photoUrl: string | null;
  createdAt: string | null; // ISO if valid, else null
  createdAtLabel: string;
  dayOfGrow: number | null;
  weekOfGrow: number | null;
  details: NormalizedDiaryDetails;
  warnings: string[];
  isValidForAiContext: boolean;
}

export interface NormalizeDiaryInput {
  rawEntries: readonly unknown[];
  growStartedAt?: string | number | Date | null;
  plantStartedAt?: string | number | Date | null;
  now?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_DETAIL_KEYS = new Set([
  "ph",
  "pH",
  "ec",
  "EC",
  "tds",
  "TDS",
  "runoff_ph",
  "runoffPh",
  "runoff_ec",
  "runoffEc",
  "runoff_tds",
  "runoffTds",
  "watering_amount",
  "wateringAmount",
  "watering_amount_ml",
  "wateringAmountMl",
  "watering_amount_l",
  "wateringAmountL",
  "nutrients",
  "training_actions",
  "trainingActions",
  "symptoms",
  "observations",
  "sensor_snapshot",
  "sensorSnapshot",
  "remind_at",
  "remindAt",
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function coerceFiniteNumber(v: unknown): number | null {
  if (isFiniteNumber(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nonBlankString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function parseDateIso(v: unknown): { iso: string | null; epoch: number | null } {
  if (v == null) return { iso: null, epoch: null };
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t)
      ? { iso: new Date(t).toISOString(), epoch: t }
      : { iso: null, epoch: null };
  }
  if (typeof v === "number") {
    return Number.isFinite(v)
      ? { iso: new Date(v).toISOString(), epoch: v }
      : { iso: null, epoch: null };
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t)
      ? { iso: new Date(t).toISOString(), epoch: t }
      : { iso: null, epoch: null };
  }
  return { iso: null, epoch: null };
}

function safeParseDetails(
  raw: unknown,
  warnings: string[],
): { value: Record<string, unknown> | null; malformed: boolean } {
  if (raw == null) return { value: null, malformed: false };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { value: null, malformed: false };
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown>, malformed: false };
      }
      warnings.push("details:not-object");
      return { value: null, malformed: true };
    } catch {
      warnings.push("details:invalid-json");
      return { value: null, malformed: true };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { value: raw as Record<string, unknown>, malformed: false };
  }
  warnings.push("details:not-object");
  return { value: null, malformed: true };
}

function normalizePh(
  raw: unknown,
  code: "ph" | "runoff-ph",
  warnings: string[],
): number | undefined {
  if (raw == null) return undefined;
  const n = coerceFiniteNumber(raw);
  if (n == null) {
    warnings.push(`${code}:invalid`);
    return undefined;
  }
  if (n < 0 || n > 14) {
    warnings.push(`${code}:out-of-range`);
    return undefined;
  }
  return n;
}

function normalizeEc(
  raw: unknown,
  code: "ec" | "runoff-ec",
  warnings: string[],
): number | undefined {
  if (raw == null) return undefined;
  const n = coerceFiniteNumber(raw);
  if (n == null) {
    warnings.push(`${code}:invalid`);
    return undefined;
  }
  if (n < 0 || n > 10) {
    warnings.push(`${code}:out-of-range`);
    return undefined;
  }
  return n;
}

function normalizeTds(
  raw: unknown,
  code: "tds" | "runoff-tds",
  warnings: string[],
): number | undefined {
  if (raw == null) return undefined;
  const n = coerceFiniteNumber(raw);
  if (n == null) {
    warnings.push(`${code}:invalid`);
    return undefined;
  }
  if (n < 0 || n > 10000) {
    warnings.push(`${code}:out-of-range`);
    return undefined;
  }
  return n;
}

function normalizeWateringMl(
  d: Record<string, unknown>,
  warnings: string[],
): number | undefined {
  const mlRaw =
    d.wateringAmountMl ?? d.watering_amount_ml ?? d.wateringAmount ?? d.watering_amount;
  const lRaw = d.wateringAmountL ?? d.watering_amount_l;
  if (lRaw != null) {
    const l = coerceFiniteNumber(lRaw);
    if (l == null || l < 0 || l > 1000) {
      warnings.push("watering:invalid");
      return undefined;
    }
    return Math.round(l * 1000);
  }
  if (mlRaw == null) return undefined;
  const ml = coerceFiniteNumber(mlRaw);
  if (ml == null || ml < 0 || ml > 1_000_000) {
    warnings.push("watering:invalid");
    return undefined;
  }
  return ml;
}

function normalizeStringArray(
  raw: unknown,
  code: string,
  warnings: string[],
): readonly string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) {
    warnings.push(`${code}:invalid`);
    return undefined;
  }
  const out: string[] = [];
  for (const v of raw) {
    const s = nonBlankString(v);
    if (s != null) out.push(s);
  }
  return out.length > 0 ? out : undefined;
}

function normalizeNutrients(
  raw: unknown,
  warnings: string[],
): NormalizedDiaryDetails["nutrients"] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) {
    warnings.push("nutrients:invalid");
    return undefined;
  }
  const out: Array<{ name: string; amount?: number; unit?: string }> = [];
  for (const item of raw) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const r = item as Record<string, unknown>;
      const name = nonBlankString(r.name);
      if (!name) continue;
      const amountRaw = r.amount;
      const amount = amountRaw == null ? undefined : coerceFiniteNumber(amountRaw) ?? undefined;
      if (amountRaw != null && amount == null) {
        warnings.push("nutrients:invalid-amount");
      }
      const unit = nonBlankString(r.unit) ?? undefined;
      out.push({ name, amount, unit });
    } else if (typeof item === "string" && item.trim().length > 0) {
      out.push({ name: item });
    } else {
      warnings.push("nutrients:invalid-entry");
    }
  }
  return out.length > 0 ? out : undefined;
}

function normalizeSensorSnapshot(
  raw: unknown,
  warnings: string[],
): NormalizedDiaryDetails["sensorSnapshot"] | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("sensor-snapshot:invalid");
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  const at = parseDateIso(r.at ?? r.recordedAt).iso ?? undefined;
  const num = (key: string): number | undefined => {
    if (r[key] == null) return undefined;
    const n = coerceFiniteNumber(r[key]);
    if (n == null) {
      warnings.push(`sensor-snapshot:${key}:invalid`);
      return undefined;
    }
    return n;
  };
  const out = {
    at,
    temp: num("temp"),
    rh: num("rh"),
    vpd: num("vpd"),
    co2: num("co2"),
    ph: num("ph"),
    ec: num("ec"),
    source: nonBlankString(r.source) ?? undefined,
    state: nonBlankString(r.state) ?? undefined,
  };
  const anyDefined = Object.values(out).some((v) => v !== undefined);
  return anyDefined ? out : undefined;
}

function normalizeRemindAt(raw: unknown, warnings: string[]): string | undefined {
  if (raw == null) return undefined;
  const parsed = parseDateIso(raw);
  if (parsed.iso == null) {
    warnings.push("remind-at:invalid");
    return undefined;
  }
  return parsed.iso;
}

function pickFirst(...vals: unknown[]): unknown {
  for (const v of vals) if (v != null) return v;
  return undefined;
}

function collectExtras(d: Record<string, unknown>): DiaryEntryDetailsExtras | undefined {
  const out: DiaryEntryDetailsExtras = {};
  let count = 0;
  for (const [k, v] of Object.entries(d)) {
    if (KNOWN_DETAIL_KEYS.has(k)) continue;
    if (typeof v === "function") continue;
    if (v && typeof v === "object" && (v as { constructor?: { name?: string } }).constructor?.name &&
        (v as { constructor: { name: string } }).constructor.name !== "Object" &&
        !Array.isArray(v)) {
      continue;
    }
    out[k] = v;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

function formatLabel(iso: string | null): string {
  if (iso == null) return "Unknown time";
  return iso;
}

// ---------------------------------------------------------------------------
// Single-entry normalization
// ---------------------------------------------------------------------------

export function normalizeDiaryEntry(
  raw: unknown,
  context: {
    growStartedAt?: string | number | Date | null;
    plantStartedAt?: string | number | Date | null;
    now?: number;
  } = {},
): NormalizedDiaryEntry | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const warnings: string[] = [];

  const idRaw = pickFirst(r.id, r.entry_id, r.entryId);
  const id = nonBlankString(idRaw);
  if (!id) {
    // Without an id we cannot safely produce a stable normalized entry.
    return null;
  }

  const growId = nonBlankString(pickFirst(r.grow_id, r.growId));
  const plantId = nonBlankString(pickFirst(r.plant_id, r.plantId));
  const tentId = nonBlankString(pickFirst(r.tent_id, r.tentId));
  const stage = nonBlankString(pickFirst(r.stage, r.plant_stage, r.plantStage));
  const eventTypeRaw = nonBlankString(
    pickFirst(r.entry_type, r.entryType, r.event_type, r.eventType, r.type),
  );
  const eventType = eventTypeRaw ?? "note";
  if (!eventTypeRaw) warnings.push("event-type:missing");

  const note = nonBlankString(pickFirst(r.note, r.body, r.text)) ?? "";

  const photoUrl = nonBlankString(pickFirst(r.photo_url, r.photoUrl));

  const createdParsed = parseDateIso(
    pickFirst(r.entry_at, r.entryAt, r.created_at, r.createdAt, r.at),
  );
  const createdAt = createdParsed.iso;
  if (createdAt == null && pickFirst(r.entry_at, r.created_at, r.at) != null) {
    warnings.push("created-at:invalid");
  } else if (createdAt == null) {
    warnings.push("created-at:missing");
  }
  const createdAtLabel = formatLabel(createdAt);

  // Day/Week of grow — derive only from valid dates
  const refStarted = parseDateIso(context.plantStartedAt ?? context.growStartedAt);
  let dayOfGrow: number | null = null;
  let weekOfGrow: number | null = null;
  if (
    createdParsed.epoch != null &&
    refStarted.epoch != null &&
    createdParsed.epoch >= refStarted.epoch
  ) {
    dayOfGrow = Math.floor(
      (createdParsed.epoch - refStarted.epoch) / (24 * 60 * 60 * 1000),
    );
    weekOfGrow = Math.floor(dayOfGrow / 7);
  }

  // Details ---------------------------------------------------------------
  const detailsParsed = safeParseDetails(r.details, warnings);
  const details: NormalizedDiaryDetails = {};
  if (detailsParsed.value) {
    const d = detailsParsed.value;
    const ph = normalizePh(pickFirst(d.ph, d.pH), "ph", warnings);
    const ec = normalizeEc(pickFirst(d.ec, d.EC), "ec", warnings);
    const tds = normalizeTds(pickFirst(d.tds, d.TDS), "tds", warnings);
    const runoffPh = normalizePh(
      pickFirst(d.runoff_ph, d.runoffPh),
      "runoff-ph",
      warnings,
    );
    const runoffEc = normalizeEc(
      pickFirst(d.runoff_ec, d.runoffEc),
      "runoff-ec",
      warnings,
    );
    const runoffTds = normalizeTds(
      pickFirst(d.runoff_tds, d.runoffTds),
      "runoff-tds",
      warnings,
    );
    const wateringAmountMl = normalizeWateringMl(d, warnings);
    const nutrients = normalizeNutrients(d.nutrients, warnings);
    const trainingActions = normalizeStringArray(
      pickFirst(d.training_actions, d.trainingActions),
      "training-actions",
      warnings,
    );
    const symptoms = normalizeStringArray(d.symptoms, "symptoms", warnings);
    const observations = nonBlankString(d.observations) ?? undefined;
    const sensorSnapshot = normalizeSensorSnapshot(
      pickFirst(d.sensor_snapshot, d.sensorSnapshot),
      warnings,
    );
    const remindAt = normalizeRemindAt(
      pickFirst(d.remind_at, d.remindAt),
      warnings,
    );
    const extras = collectExtras(d);

    if (ph !== undefined) details.ph = ph;
    if (ec !== undefined) details.ec = ec;
    if (tds !== undefined) details.tds = tds;
    if (runoffPh !== undefined) details.runoffPh = runoffPh;
    if (runoffEc !== undefined) details.runoffEc = runoffEc;
    if (runoffTds !== undefined) details.runoffTds = runoffTds;
    if (wateringAmountMl !== undefined) details.wateringAmountMl = wateringAmountMl;
    if (nutrients) details.nutrients = nutrients;
    if (trainingActions) details.trainingActions = trainingActions;
    if (symptoms) details.symptoms = symptoms;
    if (observations) details.observations = observations;
    if (sensorSnapshot) details.sensorSnapshot = sensorSnapshot;
    if (remindAt) details.remindAt = remindAt;
    if (extras) details.extras = extras;
  }

  const isValidForAiContext =
    createdAt != null &&
    !detailsParsed.malformed &&
    // critical sanity: any "*:invalid" warnings disqualify the entry from
    // confidently flowing into AI context.
    !warnings.some((w) => w.endsWith(":invalid"));

  return {
    id,
    growId,
    plantId,
    tentId,
    stage,
    eventType,
    note,
    photoUrl,
    createdAt,
    createdAtLabel,
    dayOfGrow,
    weekOfGrow,
    details,
    warnings,
    isValidForAiContext,
  };
}

// ---------------------------------------------------------------------------
// Bulk normalization + sort
// ---------------------------------------------------------------------------

export function normalizeDiaryEntries(
  input: NormalizeDiaryInput,
): NormalizedDiaryEntry[] {
  if (!input || !Array.isArray(input.rawEntries)) return [];
  const out: NormalizedDiaryEntry[] = [];
  for (const raw of input.rawEntries) {
    const n = normalizeDiaryEntry(raw, {
      growStartedAt: input.growStartedAt,
      plantStartedAt: input.plantStartedAt,
      now: input.now,
    });
    if (n) out.push(n);
  }
  return out;
}

/**
 * Sort newest-first with stable id tie-breaker. Entries without a valid
 * createdAt sort last (also tie-broken by id).
 */
export function sortDiaryEntriesNewestFirst(
  entries: readonly NormalizedDiaryEntry[],
): NormalizedDiaryEntry[] {
  const arr = entries.slice();
  arr.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
    const bt = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
    if (at !== bt) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return arr;
}
