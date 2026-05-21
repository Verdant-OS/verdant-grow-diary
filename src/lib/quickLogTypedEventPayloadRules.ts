/**
 * quickLogTypedEventPayloadRules — pure adapter that maps a QuickLog draft
 * into a typed grow event payload candidate for the future
 * grow_events + subtype event tables.
 *
 * Pure. No React. No Supabase. No RPC. Deterministic.
 * Warning/error strings never echo raw user-entered values.
 */

export const TYPED_EVENT_SCHEMA_VERSION = 1;

export type TypedEventKind =
  | "watering"
  | "feeding"
  | "photo"
  | "observation"
  | "training"
  | "environment";

export interface QuickLogTypedDraft {
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  user_id?: string | null;
  event_type?: string | null;
  note?: string | null;
  occurred_at?: string | number | Date | null;
  photo_url?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TypedParentPayload {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  user_id?: string;
  event_type: TypedEventKind;
  source: "manual";
  /** ISO timestamp, or null when caller did not supply one — let the DB
   * default (`now()`) apply rather than fabricating an epoch-0 row. */
  occurred_at: string | null;
  note: string | null;
  schema_version: number;
}

export interface TypedSubtypePayload {
  kind: TypedEventKind;
  payload: Record<string, unknown>;
}

export interface TypedEventSuccess {
  ok: true;
  parent: TypedParentPayload;
  subtype: TypedSubtypePayload;
  warnings: string[];
}

export interface TypedEventFailure {
  ok: false;
  reason: string;
  warnings: string[];
}

export type TypedEventResult = TypedEventSuccess | TypedEventFailure;

const KNOWN_EVENT_TYPES: ReadonlySet<TypedEventKind> = new Set([
  "watering",
  "feeding",
  "photo",
  "observation",
  "training",
  "environment",
]);

// ---------------------------------------------------------------------------
// Coercion helpers (pure)
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? new Date(v).toISOString() : null;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

function toStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const e of v) {
    const s = toStringOrNull(e);
    if (s) out.push(s);
  }
  return out.length > 0 ? out : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Field validators returning { value, error } so we can fail loud
// ---------------------------------------------------------------------------

type FieldResult = { value?: number; error?: string };

function checkPh(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 14) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkEc(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 10) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkVolumeMl(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 1_000_000) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkHumidity(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 100) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkLightHours(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 24) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkTemperatureC(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < -50 || n > 100) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkVpd(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 10) return { error: `${code}:out-of-range` };
  return { value: n };
}

function checkCo2(v: unknown, code: string): FieldResult {
  if (v == null || v === "") return {};
  const n = toNumber(v);
  if (n == null) return { error: `${code}:invalid` };
  if (n < 0 || n > 50000) return { error: `${code}:out-of-range` };
  return { value: n };
}

// ---------------------------------------------------------------------------
// Known keys per subtype, to compute "extras"
// ---------------------------------------------------------------------------

const SUBTYPE_KNOWN_KEYS: Record<TypedEventKind, ReadonlySet<string>> = {
  watering: new Set([
    "volume_ml", "watering_amount_ml", "wateringAmountMl",
    "watering_amount", "wateringAmount",
    "watering_amount_l", "wateringAmountL",
    "ph", "pH", "ec", "EC",
    "runoff_ml", "runoffMl",
    "runoff_ph", "runoffPh",
    "runoff_ec", "runoffEc",
  ]),
  feeding: new Set([
    "ph", "pH", "ec", "EC",
    "volume_ml", "watering_amount_ml", "wateringAmountMl",
    "watering_amount", "wateringAmount",
    "watering_amount_l", "wateringAmountL",
    "nutrient_brand", "nutrientBrand", "brand",
    "recipe", "nutrients",
  ]),
  photo: new Set([
    "photo_url", "photoUrl",
    "caption",
    "taken_at", "takenAt",
  ]),
  observation: new Set([
    "symptom_type", "symptomType", "symptoms",
    "severity",
    "affected_area", "affectedArea",
    "details",
  ]),
  training: new Set([
    "technique",
    "intensity",
    "affected_nodes", "affectedNodes",
  ]),
  environment: new Set([
    "temperature_c", "temperatureC", "temp", "temperature",
    "humidity_pct", "humidityPct", "rh", "humidity",
    "vpd_kpa", "vpdKpa", "vpd",
    "co2_ppm", "co2Ppm", "co2",
    "light_on", "lightOn",
    "light_hours", "lightHours",
  ]),
};

function collectExtras(
  d: Record<string, unknown> | null | undefined,
  kind: TypedEventKind,
): Record<string, unknown> | undefined {
  if (!d) return undefined;
  const known = SUBTYPE_KNOWN_KEYS[kind];
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(d)) {
    if (known.has(k)) continue;
    if (typeof v === "function") continue;
    out[k] = v;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

function pick(d: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!d) return undefined;
  for (const k of keys) {
    if (d[k] != null) return d[k];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Watering volume normalizer (ml or l)
// ---------------------------------------------------------------------------

function readVolumeMl(
  d: Record<string, unknown> | null | undefined,
): FieldResult {
  if (!d) return {};
  if (d.watering_amount_l != null || d.wateringAmountL != null) {
    const lRaw = d.watering_amount_l ?? d.wateringAmountL;
    const l = toNumber(lRaw);
    if (l == null) return { error: "volume:invalid" };
    if (l < 0 || l > 1000) return { error: "volume:out-of-range" };
    return { value: Math.round(l * 1000) };
  }
  const raw = pick(
    d,
    "volume_ml",
    "watering_amount_ml",
    "wateringAmountMl",
    "watering_amount",
    "wateringAmount",
  );
  return checkVolumeMl(raw, "volume");
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export function quickLogToTypedEventPayload(
  draft: QuickLogTypedDraft | null | undefined,
): TypedEventResult {
  const warnings: string[] = [];

  if (!draft || typeof draft !== "object") {
    return { ok: false, reason: "draft:missing", warnings };
  }

  const grow_id = toStringOrNull(draft.grow_id);
  if (!grow_id) {
    return { ok: false, reason: "grow_id:missing", warnings };
  }

  const eventTypeRaw = toStringOrNull(draft.event_type);
  if (!eventTypeRaw) {
    return { ok: false, reason: "event_type:missing", warnings };
  }
  if (!KNOWN_EVENT_TYPES.has(eventTypeRaw as TypedEventKind)) {
    return { ok: false, reason: "event_type:unknown", warnings };
  }
  const event_type = eventTypeRaw as TypedEventKind;

  const occurredIso = toIsoOrNull(draft.occurred_at);
  if (draft.occurred_at != null && occurredIso == null) {
    warnings.push("occurred_at:invalid");
  }
  // When missing/invalid, leave null so DB default (now()) applies.
  const occurred_at: string | null = occurredIso;

  const tent_id = toStringOrNull(draft.tent_id);
  const plant_id = toStringOrNull(draft.plant_id);
  const user_id = toStringOrNull(draft.user_id) ?? undefined;
  const note = toStringOrNull(draft.note);

  const details = isPlainObject(draft.details) ? draft.details : null;

  // Build subtype payload (with hard fails on invalid numeric domains)
  let subtypePayload: Record<string, unknown> = {};

  switch (event_type) {
    case "watering": {
      const vol = readVolumeMl(details);
      if (vol.error) return { ok: false, reason: vol.error, warnings };
      // Watering must have a strictly positive volume — DB RPC requires it.
      if (vol.value === undefined || vol.value <= 0) {
        return { ok: false, reason: "volume:required-positive", warnings };
      }
      const ph = checkPh(pick(details, "ph", "pH"), "ph");
      if (ph.error) return { ok: false, reason: ph.error, warnings };
      const ec = checkEc(pick(details, "ec", "EC"), "ec");
      if (ec.error) return { ok: false, reason: ec.error, warnings };
      const runoffMl = checkVolumeMl(
        pick(details, "runoff_ml", "runoffMl"),
        "runoff_volume",
      );
      if (runoffMl.error) return { ok: false, reason: runoffMl.error, warnings };
      const runoffPh = checkPh(pick(details, "runoff_ph", "runoffPh"), "runoff_ph");
      if (runoffPh.error) return { ok: false, reason: runoffPh.error, warnings };
      const runoffEc = checkEc(pick(details, "runoff_ec", "runoffEc"), "runoff_ec");
      if (runoffEc.error) return { ok: false, reason: runoffEc.error, warnings };

      subtypePayload.volume_ml = vol.value;
      if (ph.value !== undefined) subtypePayload.ph = ph.value;
      if (ec.value !== undefined) subtypePayload.ec_ms_cm = ec.value;
      if (runoffMl.value !== undefined) subtypePayload.runoff_ml = runoffMl.value;
      if (runoffPh.value !== undefined) subtypePayload.runoff_ph = runoffPh.value;
      if (runoffEc.value !== undefined) subtypePayload.runoff_ec_ms_cm = runoffEc.value;
      break;
    }
    case "feeding": {
      const ph = checkPh(pick(details, "ph", "pH"), "ph");
      if (ph.error) return { ok: false, reason: ph.error, warnings };
      const ec = checkEc(pick(details, "ec", "EC"), "ec");
      if (ec.error) return { ok: false, reason: ec.error, warnings };
      const vol = readVolumeMl(details);
      if (vol.error) return { ok: false, reason: vol.error, warnings };
      const brand = toStringOrNull(
        pick(details, "nutrient_brand", "nutrientBrand", "brand"),
      );
      const recipeRaw = pick(details, "recipe", "nutrients");
      let recipe: unknown = undefined;
      if (recipeRaw != null) {
        if (isPlainObject(recipeRaw) || Array.isArray(recipeRaw)) {
          recipe = recipeRaw;
        } else {
          warnings.push("recipe:invalid");
        }
      }

      if (ph.value !== undefined) subtypePayload.ph = ph.value;
      if (ec.value !== undefined) subtypePayload.ec_ms_cm = ec.value;
      if (vol.value !== undefined) subtypePayload.volume_ml = vol.value;
      if (brand) subtypePayload.nutrient_brand = brand;
      if (recipe !== undefined) subtypePayload.recipe = recipe;
      break;
    }
    case "photo": {
      const photo_url =
        toStringOrNull(pick(details, "photo_url", "photoUrl")) ??
        toStringOrNull(draft.photo_url);
      if (!photo_url) {
        return { ok: false, reason: "photo_url:missing", warnings };
      }
      const caption = toStringOrNull(pick(details, "caption")) ?? note;
      const taken_at =
        toIsoOrNull(pick(details, "taken_at", "takenAt")) ?? occurred_at;
      subtypePayload.photo_url = photo_url;
      if (caption) subtypePayload.caption = caption;
      if (taken_at) subtypePayload.taken_at = taken_at;
      break;
    }
    case "observation": {
      const symptomRaw = pick(details, "symptom_type", "symptomType", "symptoms");
      let symptom_type: string[] | null = null;
      if (symptomRaw != null) {
        if (Array.isArray(symptomRaw)) {
          symptom_type = toStringArray(symptomRaw);
        } else {
          const s = toStringOrNull(symptomRaw);
          symptom_type = s ? [s] : null;
        }
        if (symptom_type == null) warnings.push("symptom_type:invalid");
      }
      const severity = toStringOrNull(pick(details, "severity"));
      const affected_area = toStringOrNull(
        pick(details, "affected_area", "affectedArea"),
      );
      const detailsText =
        toStringOrNull(pick(details, "details")) ?? note;

      if (symptom_type) subtypePayload.symptom_type = symptom_type;
      if (severity) subtypePayload.severity = severity;
      if (affected_area) subtypePayload.affected_area = affected_area;
      if (detailsText) subtypePayload.details = detailsText;
      break;
    }
    case "training": {
      const technique = toStringOrNull(pick(details, "technique"));
      if (!technique) {
        return { ok: false, reason: "technique:missing", warnings };
      }
      const intensity = toStringOrNull(pick(details, "intensity"));
      const affectedRaw = pick(details, "affected_nodes", "affectedNodes");
      let affected_nodes: string[] | null = null;
      if (affectedRaw != null) {
        if (Array.isArray(affectedRaw)) {
          affected_nodes = toStringArray(affectedRaw);
        }
        if (affected_nodes == null) warnings.push("affected_nodes:invalid");
      }
      subtypePayload.technique = technique;
      if (intensity) subtypePayload.intensity = intensity;
      if (affected_nodes) subtypePayload.affected_nodes = affected_nodes;
      break;
    }
    case "environment": {
      const temp = checkTemperatureC(
        pick(details, "temperature_c", "temperatureC", "temp", "temperature"),
        "temperature_c",
      );
      if (temp.error) return { ok: false, reason: temp.error, warnings };
      const rh = checkHumidity(
        pick(details, "humidity_pct", "humidityPct", "rh", "humidity"),
        "humidity_pct",
      );
      if (rh.error) return { ok: false, reason: rh.error, warnings };
      const vpd = checkVpd(pick(details, "vpd_kpa", "vpdKpa", "vpd"), "vpd_kpa");
      if (vpd.error) return { ok: false, reason: vpd.error, warnings };
      const co2 = checkCo2(pick(details, "co2_ppm", "co2Ppm", "co2"), "co2_ppm");
      if (co2.error) return { ok: false, reason: co2.error, warnings };
      const lightHours = checkLightHours(
        pick(details, "light_hours", "lightHours"),
        "light_hours",
      );
      if (lightHours.error) {
        return { ok: false, reason: lightHours.error, warnings };
      }
      const lightOnRaw = pick(details, "light_on", "lightOn");
      let light_on: boolean | undefined = undefined;
      if (lightOnRaw != null) {
        if (typeof lightOnRaw === "boolean") light_on = lightOnRaw;
        else if (lightOnRaw === "true") light_on = true;
        else if (lightOnRaw === "false") light_on = false;
        else warnings.push("light_on:invalid");
      }

      if (temp.value !== undefined) subtypePayload.temperature_c = temp.value;
      if (rh.value !== undefined) subtypePayload.humidity_pct = rh.value;
      if (vpd.value !== undefined) subtypePayload.vpd_kpa = vpd.value;
      if (co2.value !== undefined) subtypePayload.co2_ppm = co2.value;
      if (light_on !== undefined) subtypePayload.light_on = light_on;
      if (lightHours.value !== undefined) {
        subtypePayload.light_hours = lightHours.value;
      }
      break;
    }
  }

  // Preserve unknown extras safely under `.extras`
  const extras = collectExtras(details, event_type);
  if (extras) {
    subtypePayload = { ...subtypePayload, extras };
  }

  const parent: TypedParentPayload = {
    grow_id,
    tent_id,
    plant_id,
    event_type,
    source: "manual",
    occurred_at,
    note,
    schema_version: TYPED_EVENT_SCHEMA_VERSION,
  };
  if (user_id) parent.user_id = user_id;

  return {
    ok: true,
    parent,
    subtype: { kind: event_type, payload: subtypePayload },
    warnings,
  };
}
