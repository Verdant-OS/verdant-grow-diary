/**
 * growDiaryTimelineRules — pure helpers that turn raw or normalized diary
 * entries into a safe, deterministic timeline view model for grower-facing
 * diary/timeline UI.
 *
 * Pure & deterministic. No React. No Supabase. Reuses diaryEntryRules for
 * normalization. Note previews are length-capped and never echo raw
 * payload values. Unknown event types fall back to safe labels.
 */

import { normalizeDiaryEntry, type NormalizedDiaryEntry } from "./diaryEntryRules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrowDiaryTimelineItem {
  id: string;
  title: string;
  subtitle: string;
  /** Sort key: epoch ms of createdAt, or null when missing/invalid. */
  timestamp: number | null;
  timestampLabel: string;
  growId: string | null;
  plantId: string | null;
  tentId: string | null;
  stage: string | null;
  eventType: string;
  notePreview: string;
  hasPhoto: boolean;
  hasSensorSnapshot: boolean;
  /** "live" | "manual" | "stale" | "invalid" | null when missing/legacy. */
  sensorSnapshotState: string | null;
  /** Display label for the snapshot's transport/origin (presenter-only). */
  sensorSourceLabel?: string | null;
  /** Display label for vendor lineage (lineage only; never auth/ownership). */
  sensorVendorLabel?: string | null;
  tags: string[];
  warnings: string[];
  isUsefulForAiContext: boolean;
}

export interface GrowDiaryTimelineFilter {
  growId?: string | null;
  plantId?: string | null;
  tentId?: string | null;
  eventType?: string | string[] | null;
  stage?: string | string[] | null;
  /** Inclusive ISO/epoch/Date range. */
  startAt?: string | number | Date | null;
  endAt?: string | number | Date | null;
  /** Default false. When false, only entries with isValidForAiContext are kept. */
  includeInvalid?: boolean;
}

export interface BuildGrowDiaryTimelineInput {
  /** Either raw rows OR pre-normalized entries — both accepted. */
  rawEntries?: readonly unknown[];
  entries?: readonly NormalizedDiaryEntry[];
  growStartedAt?: string | number | Date | null;
  plantStartedAt?: string | number | Date | null;
  now?: number;
  filter?: GrowDiaryTimelineFilter;
  /** Maximum length of notePreview. Default 160. */
  notePreviewMaxLength?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_NOTE_PREVIEW_MAX = 160;

const VALID_SENSOR_STATES = new Set(["live", "manual", "stale", "invalid"]);

export interface SensorSnapshotBadge {
  label: string;
  variant: "neutral" | "positive" | "warning" | "error";
}

export function sensorSnapshotBadge(state: string | null | undefined): SensorSnapshotBadge | null {
  const s = (state ?? "").trim().toLowerCase();
  if (!s || !VALID_SENSOR_STATES.has(s)) return null;
  switch (s) {
    case "live":
      return { label: "Live", variant: "positive" };
    case "manual":
      return { label: "Manual", variant: "neutral" };
    case "stale":
      return { label: "Stale", variant: "warning" };
    case "invalid":
      return { label: "Invalid", variant: "error" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Source / vendor presenter helpers (presenter-only — no auth/ownership).
// ---------------------------------------------------------------------------

const SOURCE_DISPLAY_LABELS: Record<string, string> = {
  // Display labels only. No network calls, no device actions — this map
  // is purely a presenter lookup for grower-facing badges.
  pi_bridge: "Pi bridge",
  node_red_bridge: "Node-RED",
  ecowitt: "EcoWitt",
  csv: "CSV",
  live: "Live",
  manual: "Manual",
  sim: "Simulated",
  stale: "Stale",
  invalid: "Invalid",
  demo: "Demo",
  home_assistant_bridge: "Home Assistant",
  ha_forwarded: "Home Assistant",
  esp32_arduino: "ESP32",
  esp32_arduino_sht31: "ESP32 (SHT31)",
  esp32_esphome: "ESPHome",
  webhook: "Webhook",
  webhook_generic: "Webhook",
  mqtt: "MQTT",
  esp32_mqtt_bridge: "MQTT bridge",
};

const VENDOR_DISPLAY_LABELS: Record<string, string> = {
  ecowitt: "EcoWitt",
  home_assistant: "Home Assistant",
  homeassistant: "Home Assistant",
  shelly: "Shelly",
  sensorpush: "SensorPush",
};

/**
 * Resolve the display label for a snapshot's `source`. Unknown values
 * fall back to a sanitized echo of the trimmed input (letters/digits/
 * dash/underscore/space only, 32-char cap) so a raw enum value never
 * looks like trusted live telemetry.
 */
export function resolveDiarySensorSourceLabel(
  source: string | null | undefined,
): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (SOURCE_DISPLAY_LABELS[key]) return SOURCE_DISPLAY_LABELS[key];
  const sanitized = key.replace(/[^a-z0-9_\-\s]/g, "").slice(0, 32).trim();
  if (!sanitized) return null;
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

/**
 * Resolve the lineage label for a snapshot's `vendor`. Vendor is
 * lineage only — it must NEVER influence authorization, ownership, or
 * routing. Unknown vendors fall back to a sanitized echo so the badge
 * cannot be styled as authoritative.
 */
export function resolveDiarySensorVendorLabel(
  vendor: string | null | undefined,
): string | null {
  if (typeof vendor !== "string") return null;
  const trimmed = vendor.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (VENDOR_DISPLAY_LABELS[key]) return VENDOR_DISPLAY_LABELS[key];
  // Keep grower-typed casing for unknown vendor lineage; cap length.
  return trimmed.slice(0, 32);
}

const EVENT_TYPE_TITLES: Record<string, string> = {
  watering: "Watering",
  water: "Watering",
  feeding: "Feeding",
  feed: "Feeding",
  training: "Training",
  defoliation: "Defoliation",
  topping: "Topping",
  lst: "Low-stress training",
  transplant: "Transplant",
  observation: "Observation",
  note: "Note",
  photo: "Photo",
  measurement: "Measurement",
  ph_check: "pH check",
  ec_check: "EC check",
  pest: "Pest sighting",
  harvest: "Harvest",
  flush: "Flush",
  action_followup: "Follow-up",
  action_outcome: "Outcome",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEpoch(v: string | number | Date | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function isNormalizedEntry(v: unknown): v is NormalizedDiaryEntry {
  if (v == null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.eventType === "string" &&
    "details" in r &&
    "warnings" in r &&
    "isValidForAiContext" in r
  );
}

function titleForEventType(eventType: string): string {
  const key = (eventType || "").toLowerCase().trim();
  if (key && EVENT_TYPE_TITLES[key]) return EVENT_TYPE_TITLES[key];
  if (!key) return "Diary entry";
  // Safe fallback for unknown event types — capitalize the first character
  // of a sanitized key (alnum + dash/underscore/space only). Never echo
  // arbitrary punctuation or html.
  const sanitized = key
    .replace(/[^a-z0-9_\-\s]/g, "")
    .slice(0, 32)
    .trim();
  if (!sanitized) return "Diary entry";
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

function clipNotePreview(note: string, maxLen: number): string {
  if (!note) return "";
  // Collapse whitespace so previews don't surface formatting artifacts.
  const flat = note.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return flat.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function buildSubtitle(entry: NormalizedDiaryEntry): string {
  const parts: string[] = [];
  if (entry.dayOfGrow != null) parts.push(`Day ${entry.dayOfGrow}`);
  if (entry.stage) parts.push(entry.stage);
  if (entry.details.wateringAmountMl != null) {
    parts.push(`${entry.details.wateringAmountMl} ml`);
  }
  if (entry.details.ph != null) parts.push(`pH ${entry.details.ph}`);
  if (entry.details.ec != null) parts.push(`EC ${entry.details.ec}`);
  return parts.join(" · ");
}

function buildTags(entry: NormalizedDiaryEntry): string[] {
  const tags: string[] = [];
  const ev = (entry.eventType || "").toLowerCase();
  if (ev) tags.push(ev);
  if (entry.photoUrl) tags.push("photo");
  if (entry.details.sensorSnapshot) tags.push("sensor-snapshot");
  if (entry.details.wateringAmountMl != null) tags.push("watering");
  if (entry.details.nutrients && entry.details.nutrients.length > 0) {
    tags.push("feeding");
  }
  if (entry.details.trainingActions && entry.details.trainingActions.length > 0) {
    tags.push("training");
  }
  if (entry.details.symptoms && entry.details.symptoms.length > 0) {
    tags.push("symptoms");
  }
  if (entry.details.ph != null || entry.details.ec != null) tags.push("nutrient");
  // Deduplicate, stable order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function matchesEventType(ev: string, filter: string | string[] | null | undefined): boolean {
  if (filter == null) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  const set = new Set(list.map((s) => (s ?? "").toLowerCase()));
  return set.has((ev ?? "").toLowerCase());
}

function matchesStage(stage: string | null, filter: string | string[] | null | undefined): boolean {
  if (filter == null) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  const set = new Set(list.map((s) => (s ?? "").toLowerCase()));
  return set.has((stage ?? "").toLowerCase());
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function toTimelineItem(
  entry: NormalizedDiaryEntry,
  opts: { notePreviewMaxLength?: number } = {},
): GrowDiaryTimelineItem {
  const maxLen = opts.notePreviewMaxLength ?? DEFAULT_NOTE_PREVIEW_MAX;
  const timestamp = entry.createdAt ? Date.parse(entry.createdAt) : null;
  return {
    id: entry.id,
    title: titleForEventType(entry.eventType),
    subtitle: buildSubtitle(entry),
    timestamp: Number.isFinite(timestamp as number) ? (timestamp as number) : null,
    timestampLabel: entry.createdAtLabel,
    growId: entry.growId,
    plantId: entry.plantId,
    tentId: entry.tentId,
    stage: entry.stage,
    eventType: entry.eventType,
    notePreview: clipNotePreview(entry.note, maxLen),
    hasPhoto: !!entry.photoUrl,
    hasSensorSnapshot: !!entry.details.sensorSnapshot,
    sensorSnapshotState: entry.details.sensorSnapshot?.state ?? null,
    sensorSourceLabel: resolveDiarySensorSourceLabel(
      entry.details.sensorSnapshot?.source ?? null,
    ),
    sensorVendorLabel: resolveDiarySensorVendorLabel(
      entry.details.sensorSnapshot?.vendor ?? null,
    ),
    tags: buildTags(entry),
    warnings: entry.warnings.slice(),
    isUsefulForAiContext: entry.isValidForAiContext,
  };
}

export function buildGrowDiaryTimeline(
  input: BuildGrowDiaryTimelineInput | null | undefined,
): GrowDiaryTimelineItem[] {
  if (!input) return [];
  const filter: GrowDiaryTimelineFilter = input.filter ?? {};
  const includeInvalid = !!filter.includeInvalid;

  // Source entries — accept pre-normalized OR raw.
  const source: NormalizedDiaryEntry[] = [];
  if (Array.isArray(input.entries)) {
    for (const e of input.entries) {
      if (isNormalizedEntry(e)) source.push(e);
    }
  }
  if (Array.isArray(input.rawEntries)) {
    for (const raw of input.rawEntries) {
      const n = normalizeDiaryEntry(raw, {
        growStartedAt: input.growStartedAt,
        plantStartedAt: input.plantStartedAt,
        now: input.now,
      });
      if (n) source.push(n);
    }
  }

  const startEpoch = toEpoch(filter.startAt ?? null);
  const endEpoch = toEpoch(filter.endAt ?? null);

  const filtered = source.filter((e) => {
    if (!includeInvalid && !e.isValidForAiContext) return false;
    if (filter.growId != null && e.growId !== filter.growId) return false;
    if (filter.plantId != null && e.plantId !== filter.plantId) return false;
    if (filter.tentId != null && e.tentId !== filter.tentId) return false;
    if (!matchesEventType(e.eventType, filter.eventType)) return false;
    if (!matchesStage(e.stage, filter.stage)) return false;
    if (startEpoch != null || endEpoch != null) {
      const t = e.createdAt ? Date.parse(e.createdAt) : NaN;
      if (!Number.isFinite(t)) return false;
      if (startEpoch != null && t < startEpoch) return false;
      if (endEpoch != null && t > endEpoch) return false;
    }
    return true;
  });

  const items = filtered.map((e) =>
    toTimelineItem(e, { notePreviewMaxLength: input.notePreviewMaxLength }),
  );

  // Newest-first; invalid timestamps sort last. Stable lexical id tie-break.
  items.sort((a, b) => {
    const at = a.timestamp ?? -Infinity;
    const bt = b.timestamp ?? -Infinity;
    if (at !== bt) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return items;
}
