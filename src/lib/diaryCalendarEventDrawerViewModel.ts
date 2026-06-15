/**
 * diaryCalendarEventDrawerViewModel — pure presenter for the read-only
 * diary calendar event drawer.
 *
 * Hard rules:
 *  - Pure. No I/O. No React. No Supabase. No model calls. No writes.
 *  - Never echoes raw payloads, raw_payload, vendor metadata, service_role,
 *    tokens, private keys, internal IDs, or arbitrary unknown keys.
 *  - Only emits a small, vetted display surface assembled from an
 *    allowlist of safe fields.
 *  - Attachments expose presence only — never URLs, storage paths,
 *    snapshot IDs, vendor IDs, or raw values.
 *  - Derived previews (EC @25°C) are always disclaimed as not stored.
 */
import {
  buildEcCompensationPreview,
  type EcCompensationPreviewModel,
} from "@/lib/ecCompensationPreviewViewModel";
import type { EcUnit } from "@/constants/units";
import type {
  DiaryCalendarEvent,
  DiaryCalendarEventKind,
} from "@/lib/diaryCalendarViewModel";

export const DIARY_CALENDAR_DRAWER_READ_ONLY_LABEL =
  "Read-only diary event" as const;
export const DIARY_CALENDAR_DRAWER_DERIVED_DISCLAIMER =
  "Derived previews are not stored" as const;

export const DIARY_CALENDAR_DRAWER_PHOTO_EMPTY = "No photo attached" as const;
export const DIARY_CALENDAR_DRAWER_SENSOR_EMPTY =
  "No linked sensor snapshot" as const;
export const DIARY_CALENDAR_DRAWER_PHOTO_ATTACHED =
  "Photo attached" as const;
export const DIARY_CALENDAR_DRAWER_SENSOR_LINKED =
  "Sensor snapshot linked" as const;

export const DIARY_CALENDAR_DRAWER_VIEW_LABEL =
  "View event details" as const;
export const DIARY_CALENDAR_DRAWER_CLOSE_LABEL =
  "Close event details" as const;

export interface DiaryCalendarDrawerField {
  label: string;
  value: string;
}

export interface DiaryCalendarDrawerSection {
  id: "summary" | "measurements" | "plantMemory" | "attachments";
  title: string;
  fields: DiaryCalendarDrawerField[];
}

export interface DiaryCalendarDrawerAttachments {
  photoLabel: string;
  photoPresent: boolean;
  sensorLabel: string;
  sensorPresent: boolean;
}

export interface DiaryCalendarEventDrawerViewModel {
  eventId: string;
  kind: DiaryCalendarEventKind;
  title: string;
  occurredAtIso: string;
  plantName: string | null;
  noteSnippet: string | null;
  readOnlyLabel: typeof DIARY_CALENDAR_DRAWER_READ_ONLY_LABEL;
  derivedDisclaimer: typeof DIARY_CALENDAR_DRAWER_DERIVED_DISCLAIMER;
  summary: DiaryCalendarDrawerSection;
  measurements: DiaryCalendarDrawerSection & {
    ecPreview: EcCompensationPreviewModel | null;
  };
  plantMemory: DiaryCalendarDrawerSection;
  attachments: DiaryCalendarDrawerAttachments;
}

// ---------------------------------------------------------------------------
// Safe pickers (local to drawer model — no leakage of unknown keys).
// ---------------------------------------------------------------------------

const STRING_VALUE_MAX = 120;

function pickRecord(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function pickFirstString(
  d: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t.length > STRING_VALUE_MAX ? `${t.slice(0, STRING_VALUE_MAX - 1)}…` : t;
    }
  }
  return null;
}

function pickFirstFiniteNumber(
  d: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function hasAnyKey(d: Record<string, unknown>, keys: readonly string[]): boolean {
  for (const k of keys) {
    const v = d[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return true;
  }
  return false;
}

function normalizeEcUnit(raw: unknown): EcUnit | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (k === "ms/cm" || k === "mscm") return "mS/cm";
  if (k === "us/cm" || k === "uscm" || k === "µs/cm" || k === "μs/cm") return "µS/cm";
  return null;
}

const DIAGNOSIS_SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  moderate: "Medium",
  high: "High",
  critical: "Critical",
  info: "Info",
};

const VIGOR_LABELS: Record<string, string> = {
  poor: "Poor",
  weak: "Weak",
  ok: "OK",
  good: "Good",
  strong: "Strong",
  excellent: "Excellent",
};

const STAGE_LABELS: Record<string, string> = {
  seedling: "Seedling",
  early_veg: "Early vegetative",
  veg: "Vegetative",
  late_veg: "Late vegetative",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
};

const PHOTO_PRESENCE_KEYS = [
  "photo_path",
  "photoPath",
  "photo_url",
  "photoUrl",
  "photo_id",
  "photoId",
  "image_path",
  "imagePath",
  "has_photo",
  "hasPhoto",
] as const;

const SENSOR_PRESENCE_KEYS = [
  "sensor_snapshot_id",
  "sensorSnapshotId",
  "snapshot_id",
  "snapshotId",
  "sensor_snapshot",
  "sensorSnapshot",
  "has_sensor_snapshot",
  "hasSensorSnapshot",
] as const;

// ---------------------------------------------------------------------------
// Builders for each section. Allowlist-only.
// ---------------------------------------------------------------------------

function buildSummarySection(
  kind: DiaryCalendarEventKind,
  d: Record<string, unknown> | null,
): DiaryCalendarDrawerField[] {
  if (!d) return [];
  const fields: DiaryCalendarDrawerField[] = [];

  if (kind === "diagnosis") {
    const summary = pickFirstString(d, ["summary", "title", "headline"]);
    if (summary) fields.push({ label: "Summary", value: summary });
    const issue = pickFirstString(d, ["likely_issue", "likelyIssue", "issue"]);
    if (issue) fields.push({ label: "Likely issue", value: issue });
    const confidence = pickFirstFiniteNumber(d, ["confidence", "confidence_score"]);
    if (confidence != null) {
      const pct = confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
        fields.push({ label: "Confidence", value: `${pct}%` });
      }
    }
    const severityRaw = pickFirstString(d, ["severity", "risk_level", "riskLevel"]);
    if (severityRaw) {
      const lbl = DIAGNOSIS_SEVERITY_LABELS[severityRaw.toLowerCase()] ?? null;
      if (lbl) fields.push({ label: "Severity", value: lbl });
    }
  } else if (kind === "watering") {
    const method = pickFirstString(d, ["method", "watering_method", "wateringMethod"]);
    if (method) fields.push({ label: "Method", value: method });
  } else if (kind === "feeding") {
    const recipe = pickFirstString(d, [
      "nutrients",
      "recipe",
      "nutrient_line",
      "nutrientLine",
    ]);
    if (recipe) fields.push({ label: "Nutrients", value: recipe });
    const brand = pickFirstString(d, ["nutrient_brand", "nutrientBrand", "brand"]);
    if (brand) fields.push({ label: "Brand", value: brand });
  }
  return fields;
}

function buildMeasurementsSection(
  kind: DiaryCalendarEventKind,
  d: Record<string, unknown> | null,
): { fields: DiaryCalendarDrawerField[]; ecPreview: EcCompensationPreviewModel | null } {
  if (!d) return { fields: [], ecPreview: null };
  const fields: DiaryCalendarDrawerField[] = [];
  let ecPreview: EcCompensationPreviewModel | null = null;

  if (kind === "watering") {
    const ml = pickFirstFiniteNumber(d, [
      "watering_amount_ml",
      "wateringAmountMl",
      "volume_ml",
      "amount_ml",
    ]);
    const l = pickFirstFiniteNumber(d, ["watering_amount_l", "wateringAmountL", "amount_l"]);
    if (ml != null) fields.push({ label: "Amount", value: `${ml} ml` });
    else if (l != null) fields.push({ label: "Amount", value: `${l} L` });
    const ph = pickFirstFiniteNumber(d, ["ph", "ph_value", "runoff_ph"]);
    if (ph != null) fields.push({ label: "pH", value: ph.toFixed(2) });
  }

  if (kind === "feeding") {
    const ph = pickFirstFiniteNumber(d, ["ph", "ph_value"]);
    if (ph != null) fields.push({ label: "pH", value: ph.toFixed(2) });
    const ec = pickFirstFiniteNumber(d, ["ec", "ec_value", "ecValue"]);
    const ecUnit = normalizeEcUnit(d.ec_unit ?? d.ecUnit) ?? "mS/cm";
    if (ec != null) fields.push({ label: "EC", value: `${ec} ${ecUnit}` });
    const waterTempC = pickFirstFiniteNumber(d, ["water_temp_c", "waterTempC"]);
    if (waterTempC != null) {
      fields.push({ label: "Water temp", value: `${waterTempC.toFixed(1)}°C` });
    }
    if (ec != null && waterTempC != null) {
      const preview = buildEcCompensationPreview({
        ec,
        ecUnit,
        waterTempC,
        sourceLabel: "manual",
      });
      if (preview.visible) ecPreview = preview;
    }
  }

  // Allowlisted environment check fields — surface only when explicitly
  // present in details; never invent values.
  const tempC = pickFirstFiniteNumber(d, ["temp_c", "tempC", "air_temp_c", "airTempC"]);
  if (tempC != null) fields.push({ label: "Air temp", value: `${tempC.toFixed(1)}°C` });
  const humidity = pickFirstFiniteNumber(d, ["humidity_pct", "humidityPct", "rh", "humidity"]);
  if (humidity != null && humidity >= 0 && humidity <= 100) {
    fields.push({ label: "Humidity", value: `${Math.round(humidity)}%` });
  }
  const vpd = pickFirstFiniteNumber(d, ["vpd_kpa", "vpdKpa", "vpd"]);
  if (vpd != null && vpd >= 0 && vpd < 10) {
    fields.push({ label: "VPD", value: `${vpd.toFixed(2)} kPa` });
  }
  const co2 = pickFirstFiniteNumber(d, ["co2_ppm", "co2Ppm"]);
  if (co2 != null && co2 >= 0) {
    fields.push({ label: "CO₂", value: `${Math.round(co2)} ppm` });
  }
  const ppfd = pickFirstFiniteNumber(d, ["ppfd", "ppfd_umol"]);
  if (ppfd != null && ppfd >= 0) {
    fields.push({ label: "PPFD", value: `${Math.round(ppfd)} µmol/m²/s` });
  }

  return { fields, ecPreview };
}

function buildPlantMemorySection(
  event: DiaryCalendarEvent,
  d: Record<string, unknown> | null,
): DiaryCalendarDrawerField[] {
  const fields: DiaryCalendarDrawerField[] = [];
  if (event.plantName) fields.push({ label: "Plant", value: event.plantName });
  if (!d) return fields;

  const stageRaw = pickFirstString(d, ["stage", "growth_stage", "growthStage"]);
  if (stageRaw) {
    const lbl = STAGE_LABELS[stageRaw.toLowerCase()] ?? null;
    if (lbl) fields.push({ label: "Stage", value: lbl });
  }
  const milestone = pickFirstString(d, [
    "milestone",
    "growth_milestone",
    "growthMilestone",
  ]);
  if (milestone) fields.push({ label: "Milestone", value: milestone });
  const vigorRaw = pickFirstString(d, ["vigor", "vigor_rating", "vigorRating"]);
  if (vigorRaw) {
    const lbl = VIGOR_LABELS[vigorRaw.toLowerCase()] ?? null;
    if (lbl) fields.push({ label: "Vigor", value: lbl });
  }
  return fields;
}

function buildAttachments(
  d: Record<string, unknown> | null,
): DiaryCalendarDrawerAttachments {
  const photoPresent = d ? hasAnyKey(d, PHOTO_PRESENCE_KEYS) : false;
  const sensorPresent = d ? hasAnyKey(d, SENSOR_PRESENCE_KEYS) : false;
  return {
    photoPresent,
    photoLabel: photoPresent
      ? DIARY_CALENDAR_DRAWER_PHOTO_ATTACHED
      : DIARY_CALENDAR_DRAWER_PHOTO_EMPTY,
    sensorPresent,
    sensorLabel: sensorPresent
      ? DIARY_CALENDAR_DRAWER_SENSOR_LINKED
      : DIARY_CALENDAR_DRAWER_SENSOR_EMPTY,
  };
}

// ---------------------------------------------------------------------------
// Main builder.
// ---------------------------------------------------------------------------

export function buildDiaryCalendarEventDrawerViewModel(
  event: DiaryCalendarEvent,
  rawDetails: unknown,
): DiaryCalendarEventDrawerViewModel {
  const d = pickRecord(rawDetails);
  const summaryFields = buildSummarySection(event.kind, d);
  const measurements = buildMeasurementsSection(event.kind, d);
  const plantMemoryFields = buildPlantMemorySection(event, d);
  const attachments = buildAttachments(d);

  return {
    eventId: event.id,
    kind: event.kind,
    title: event.label,
    occurredAtIso: event.occurredAt,
    plantName: event.plantName,
    noteSnippet: event.noteSnippet,
    readOnlyLabel: DIARY_CALENDAR_DRAWER_READ_ONLY_LABEL,
    derivedDisclaimer: DIARY_CALENDAR_DRAWER_DERIVED_DISCLAIMER,
    summary: { id: "summary", title: "Summary", fields: summaryFields },
    measurements: {
      id: "measurements",
      title: "Measurements",
      fields: measurements.fields,
      ecPreview: measurements.ecPreview,
    },
    plantMemory: {
      id: "plantMemory",
      title: "Plant memory",
      fields: plantMemoryFields,
    },
    attachments,
  };
}
