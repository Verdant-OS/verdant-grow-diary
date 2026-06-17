/**
 * timelineEvidenceDetailViewModel — pure presenter model for the
 * Timeline Evidence Detail Drawer.
 *
 * Strictly read-only. Deterministic. Null-safe. No DOM, no React, no
 * fetch, no DB, no AI, no Action Queue / alert / device / sensor work.
 *
 * Only a tiny allow-list of safe display fields is exposed. `raw_payload`,
 * Authorization headers, bridge tokens, JWTs, service-role keys, ingest
 * URLs and similar secrets MUST NEVER appear in the returned model.
 */

export type TimelineEvidenceSource =
  | "manual"
  | "live"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

const ALLOWED_SOURCES: ReadonlySet<TimelineEvidenceSource> = new Set([
  "manual",
  "live",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

const SOURCE_LABELS: Record<TimelineEvidenceSource, string> = {
  manual: "Manual",
  live: "Live",
  csv: "CSV import",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  unknown: "Unknown",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  note: "Note",
  photo: "Photo",
  watering: "Watering",
  feeding: "Feeding",
  measurement: "Measurement",
  environment_check: "Environment check",
  pest_disease: "Pest / disease",
  training: "Training",
  action_followup: "Action follow-up",
  ai_doctor_check_in: "AI Doctor check-in",
};

// Hard list of details keys the drawer may read. Anything outside this
// list — especially `raw_payload`, tokens, headers, URLs — is ignored.
const SAFE_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "event_type",
  "plant_name",
  "tent_name",
  "source",
  "remind_at",
  "sensor",
  "sensor_snapshot",
  "watering_ml",
  "feeding_ec",
  "feeding_ph",
]);

const TIMELINE_DETAIL_STALE_MS = 30 * 60 * 1000;

export interface TimelineEvidenceDetailInput {
  id: string;
  note?: string | null;
  photo_url?: string | null;
  stage?: string | null;
  entry_at?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TimelineEvidenceSensorSummary {
  source: TimelineEvidenceSource;
  capturedAt: string | null;
  isStale: boolean;
  tempC: number | null;
  rhPercent: number | null;
  vpdKpa: number | null;
  co2Ppm: number | null;
  soilPercent: number | null;
}

export interface TimelineEvidencePhotoSummary {
  hasPhoto: true;
  altText: string;
}

export type TimelineEvidenceBadge =
  | "photo"
  | "sensor"
  | "note"
  | "watering"
  | "feeding"
  | "stale_sensor";

export type TimelineEvidenceContext =
  | "strong"
  | "partial_missing_photo"
  | "partial_missing_sensor"
  | "limited";

export interface TimelineEvidenceContextHint {
  level: TimelineEvidenceContext;
  label: string;
  description: string;
}

export interface TimelineEvidenceDetailViewModel {
  id: string;
  title: string;
  subtitle: string;
  eventType: string;
  eventTypeLabel: string;
  occurredAt: string | null;
  stageLabel: string | null;
  plantLabel: string | null;
  tentLabel: string | null;
  note: string;
  photo: TimelineEvidencePhotoSummary | null;
  sensor: TimelineEvidenceSensorSummary | null;
  sourceLabels: string[];
  watering: { volumeMl: number | null } | null;
  feeding: { ec: number | null; ph: number | null } | null;
  remindAt: string | null;
  badges: TimelineEvidenceBadge[];
  contextHint: TimelineEvidenceContextHint;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSource(value: unknown): TimelineEvidenceSource {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (ALLOWED_SOURCES.has(s as TimelineEvidenceSource)
    ? (s as TimelineEvidenceSource)
    : "unknown");
}

function readSafeDetail(
  details: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!details || !SAFE_DETAIL_KEYS.has(key)) return undefined;
  return details[key];
}

function readSensor(
  details: Record<string, unknown> | null | undefined,
  fallbackEntryAt: string | null,
  nowMs: number,
): TimelineEvidenceSensorSummary | null {
  const raw =
    readSafeDetail(details, "sensor_snapshot") ?? readSafeDetail(details, "sensor");
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const capturedAt = safeString(obj.ts) ?? fallbackEntryAt;
  let isStale = true;
  if (capturedAt) {
    const t = new Date(capturedAt).getTime();
    isStale = !Number.isFinite(t) || nowMs - t > TIMELINE_DETAIL_STALE_MS;
  }

  const source = normalizeSource(obj.source ?? readSafeDetail(details, "source"));

  return {
    source,
    capturedAt,
    isStale,
    tempC: safeNumber(obj.temp ?? obj.temp_c ?? obj.tempC),
    rhPercent: safeNumber(obj.rh ?? obj.humidity ?? obj.rh_percent),
    vpdKpa: safeNumber(obj.vpd ?? obj.vpd_kpa ?? obj.vpdKpa),
    co2Ppm: safeNumber(obj.co2 ?? obj.co2_ppm),
    soilPercent: safeNumber(obj.soil ?? obj.soil_percent),
  };
}

function buildAltText(
  plantName: string | null,
  entryAt: string | null,
): string {
  const parts = ["Timeline photo"];
  if (plantName) parts.push(`of ${plantName}`);
  if (entryAt) parts.push(`taken ${entryAt}`);
  return parts.join(" ");
}

function decideContext(
  hasPhoto: boolean,
  hasSensor: boolean,
  staleSensor: boolean,
): TimelineEvidenceContextHint {
  if (hasPhoto && hasSensor && !staleSensor) {
    return {
      level: "strong",
      label: "Useful for AI Doctor context",
      description:
        "Photo and recent sensor snapshot — strong evidence for AI Doctor.",
    };
  }
  if (hasPhoto && !hasSensor) {
    return {
      level: "partial_missing_sensor",
      label: "Missing sensor context",
      description:
        "Has a photo but no sensor snapshot — AI Doctor context is partial.",
    };
  }
  if (!hasPhoto && hasSensor) {
    return {
      level: "partial_missing_photo",
      label: "Missing photo context",
      description:
        "Has a sensor snapshot but no photo — AI Doctor context is partial.",
    };
  }
  return {
    level: "limited",
    label: "Missing photo/sensor context",
    description:
      "No photo and no sensor snapshot — limited evidence for AI Doctor.",
  };
}

export function buildTimelineEvidenceDetailViewModel(
  input: TimelineEvidenceDetailInput | null | undefined,
  options: { nowMs?: number } = {},
): TimelineEvidenceDetailViewModel | null {
  if (!input || typeof input.id !== "string" || !input.id) return null;
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();

  const details =
    input.details && typeof input.details === "object" ? input.details : null;

  const eventTypeRaw = safeString(readSafeDetail(details, "event_type")) ?? "note";
  const eventTypeLabel = EVENT_TYPE_LABELS[eventTypeRaw] ?? "Entry";

  const plantLabel = safeString(readSafeDetail(details, "plant_name"));
  const tentLabel = safeString(readSafeDetail(details, "tent_name"));
  const stageLabel = safeString(input.stage);

  const note = typeof input.note === "string" ? input.note : "";
  const entryAt = safeString(input.entry_at);

  const hasPhoto = !!safeString(input.photo_url);
  const photo: TimelineEvidencePhotoSummary | null = hasPhoto
    ? { hasPhoto: true, altText: buildAltText(plantLabel, entryAt) }
    : null;

  const sensor = readSensor(details, entryAt, nowMs);

  const declaredSource = normalizeSource(readSafeDetail(details, "source"));
  const sources: TimelineEvidenceSource[] = [];
  if (declaredSource !== "unknown") sources.push(declaredSource);
  if (sensor) {
    if (!sources.includes(sensor.source)) sources.push(sensor.source);
    if (sensor.isStale && !sources.includes("stale")) sources.push("stale");
  }
  const sourceLabels = sources.map((s) => SOURCE_LABELS[s]);

  const wateringMl = safeNumber(readSafeDetail(details, "watering_ml"));
  const feedingEc = safeNumber(readSafeDetail(details, "feeding_ec"));
  const feedingPh = safeNumber(readSafeDetail(details, "feeding_ph"));

  const watering =
    eventTypeRaw === "watering" || wateringMl !== null
      ? { volumeMl: wateringMl }
      : null;
  const feeding =
    eventTypeRaw === "feeding" || feedingEc !== null || feedingPh !== null
      ? { ec: feedingEc, ph: feedingPh }
      : null;

  const badges: TimelineEvidenceBadge[] = [];
  if (hasPhoto) badges.push("photo");
  if (sensor) badges.push("sensor");
  if (note.trim()) badges.push("note");
  if (watering) badges.push("watering");
  if (feeding) badges.push("feeding");
  if (sensor && sensor.isStale) badges.push("stale_sensor");

  const contextHint = decideContext(hasPhoto, !!sensor, !!sensor?.isStale);

  const title = plantLabel ?? eventTypeLabel;
  const subtitleParts = [eventTypeLabel];
  if (stageLabel) subtitleParts.push(stageLabel);
  if (tentLabel) subtitleParts.push(tentLabel);
  const subtitle = subtitleParts.join(" · ");

  return {
    id: input.id,
    title,
    subtitle,
    eventType: eventTypeRaw,
    eventTypeLabel,
    occurredAt: entryAt,
    stageLabel,
    plantLabel,
    tentLabel,
    note,
    photo,
    sensor,
    sourceLabels,
    watering,
    feeding,
    remindAt: safeString(readSafeDetail(details, "remind_at")),
    badges,
    contextHint,
  };
}

export const TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS = SAFE_DETAIL_KEYS;
export const TIMELINE_EVIDENCE_SOURCE_LABELS = SOURCE_LABELS;
