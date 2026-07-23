/**
 * Guided diary-action checklist — pure rules module.
 *
 * Advisory only. This module never writes to any table, never enqueues
 * anything into the approval-required Action Queue, and never invents
 * data the grower did not log.
 *
 * Given a grow's plants, tents, recent diary timeline, latest sensor
 * snapshots, and open alerts, it returns a deterministic ranked list of
 * next actionable items the grower should consider capturing. Presenters
 * render this list and deep-link the grower into the appropriate existing
 * screen (Quick Log, Alerts, Plant Detail). The grower still saves.
 *
 * All time is injectable via `now` for tests.
 */
import type { NormalizedDiaryEntry } from "@/lib/diaryEntryRules";

export type GuidedActionItemKind =
  | "sensor_context"
  | "cadence"
  | "alert_followup"
  | "stage_transition";

export interface GuidedActionItem {
  /** Stable, deterministic id — safe to use as a local-dismiss key. */
  id: string;
  kind: GuidedActionItemKind;
  /** 1 = most urgent, 4 = least. Used only for sort. */
  priority: 1 | 2 | 3 | 4;
  title: string;
  /** One-line explanation grounded in captured evidence. */
  reason: string;
  ctaLabel: string;
  /** Deep-link into an existing screen. Presenter navigates. */
  ctaHref: string;
  plantId: string | null;
  tentId: string | null;
}

export interface GuidedChecklistPlant {
  id: string;
  name: string;
  tentId: string | null;
  stage: string | null;
}

export interface GuidedChecklistTent {
  id: string;
  name: string;
}

export interface GuidedChecklistAlert {
  id: string;
  title: string;
  severity: "info" | "watch" | "warning" | "critical" | string;
  plantId: string | null;
  tentId: string | null;
}

export interface GuidedChecklistSensorReading {
  capturedAt: string | null;
  source: string | null;
  /** Optional narrowed quality; only "ok" counts as fresh. */
  quality?: string | null;
}

export interface BuildGuidedActionChecklistInput {
  now: number;
  scopedGrowId: string;
  plants: readonly GuidedChecklistPlant[];
  tents: readonly GuidedChecklistTent[];
  /** Diary entries already scoped to the active grow. */
  diaryEntries: readonly NormalizedDiaryEntry[];
  /** Latest sensor reading per tent id. Missing key = no reading. */
  latestReadingByTent: Readonly<
    Record<string, GuidedChecklistSensorReading | null | undefined>
  >;
  openAlerts: readonly GuidedChecklistAlert[];
  /** Locally-dismissed item ids that should be filtered out. */
  dismissedIds: readonly string[];
  /** Optional hard cap on visible items. Defaults to 8. */
  maxItems?: number;
}

// Time windows — kept as named constants for auditability.
export const SENSOR_FRESHNESS_MS = 30 * 60 * 1000;
export const WATERING_CADENCE_MS = 3 * 24 * 60 * 60 * 1000;
export const PHOTO_CADENCE_MS = 5 * 24 * 60 * 60 * 1000;
export const FLOWER_TRICHOME_CHECK_CADENCE_MS = 14 * 24 * 60 * 60 * 1000;

const TRUSTED_SENSOR_SOURCES = new Set(["live", "manual"]);
const KIND_ORDER: Record<GuidedActionItemKind, number> = {
  alert_followup: 0,
  sensor_context: 1,
  cadence: 2,
  stage_transition: 3,
};

const SEVERITY_PRIORITY: Record<string, 1 | 2 | 3 | 4> = {
  critical: 1,
  warning: 2,
  watch: 3,
  info: 4,
};

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function latestEntryTimestamp(
  entries: readonly NormalizedDiaryEntry[],
  predicate: (e: NormalizedDiaryEntry) => boolean,
): number | null {
  let latest: number | null = null;
  for (const e of entries) {
    if (!predicate(e)) continue;
    const t = parseIso(e.createdAt);
    if (t == null) continue;
    if (latest == null || t > latest) latest = t;
  }
  return latest;
}

function isWateringEntry(e: NormalizedDiaryEntry): boolean {
  const t = e.eventType.toLowerCase();
  return t === "watering" || t === "feeding" || t === "water" || t === "feed";
}

function isPhotoEntry(e: NormalizedDiaryEntry): boolean {
  if (e.photoUrl) return true;
  const t = e.eventType.toLowerCase();
  return t === "photo";
}

function isTrichomeOrBudCheck(e: NormalizedDiaryEntry): boolean {
  const note = (e.note ?? "").toLowerCase();
  if (!note) return false;
  return (
    note.includes("trichome") ||
    note.includes("pistil") ||
    note.includes("bud")
  );
}

function isFlowerStage(stage: string | null): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase();
  return s === "flower" || s === "flowering" || s === "flush";
}

function isReadingFresh(
  reading: GuidedChecklistSensorReading | null | undefined,
  now: number,
): boolean {
  if (!reading) return false;
  const source = (reading.source ?? "").toLowerCase();
  if (!TRUSTED_SENSOR_SOURCES.has(source)) return false;
  if (reading.quality != null && reading.quality !== "ok") return false;
  const t = parseIso(reading.capturedAt);
  if (t == null) return false;
  return now - t <= SENSOR_FRESHNESS_MS;
}

function describeStaleReason(
  reading: GuidedChecklistSensorReading | null | undefined,
  now: number,
): string {
  if (!reading) return "No sensor reading captured yet.";
  const source = (reading.source ?? "unknown").toLowerCase();
  if (!TRUSTED_SENSOR_SOURCES.has(source)) {
    return `Last reading source was "${source}" — not counted as fresh.`;
  }
  if (reading.quality != null && reading.quality !== "ok") {
    return `Last reading quality was "${reading.quality}" — not counted as fresh.`;
  }
  const t = parseIso(reading.capturedAt);
  if (t == null) return "Last reading has no valid timestamp.";
  const minutes = Math.max(1, Math.round((now - t) / 60000));
  if (minutes < 90) return `Last fresh reading was ${minutes} min ago.`;
  const hours = Math.round(minutes / 60);
  return `Last fresh reading was ${hours}h ago.`;
}

function formatAge(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours}h`;
}

/**
 * Deterministic sort:
 *   1. priority ascending
 *   2. kind order (alert → sensor → cadence → stage)
 *   3. title ascending (stable tie-break)
 */
function compareItems(a: GuidedActionItem, b: GuidedActionItem): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ak = KIND_ORDER[a.kind];
  const bk = KIND_ORDER[b.kind];
  if (ak !== bk) return ak - bk;
  return a.title.localeCompare(b.title);
}

export function buildGuidedActionChecklist(
  input: BuildGuidedActionChecklistInput,
): GuidedActionItem[] {
  const {
    now,
    plants,
    tents,
    diaryEntries,
    latestReadingByTent,
    openAlerts,
    dismissedIds,
    maxItems = 8,
  } = input;

  const dismissed = new Set(dismissedIds);
  const items: GuidedActionItem[] = [];

  // 1) Open alerts — highest priority band, mapped by severity.
  for (const alert of openAlerts) {
    const severity = (alert.severity ?? "info").toLowerCase();
    const priority = SEVERITY_PRIORITY[severity] ?? 3;
    items.push({
      id: `alert:${alert.id}`,
      kind: "alert_followup",
      priority,
      title: alert.title || "Open alert",
      reason: `Open ${severity} alert needs your review.`,
      ctaLabel: "Review alert",
      ctaHref: `/alerts/${alert.id}`,
      plantId: alert.plantId,
      tentId: alert.tentId,
    });
  }

  // 2) Sensor context — one item per tent whose latest reading is not fresh.
  for (const tent of tents) {
    const reading = latestReadingByTent[tent.id] ?? null;
    if (isReadingFresh(reading, now)) continue;
    items.push({
      id: `sensor:${tent.id}`,
      kind: "sensor_context",
      priority: 2,
      title: `Capture a fresh reading for ${tent.name}`,
      reason: describeStaleReason(reading, now),
      ctaLabel: "Log snapshot",
      ctaHref: "/quick-log",
      plantId: null,
      tentId: tent.id,
    });
  }

  // 3) Cadence — per plant, watering + photo gaps.
  for (const plant of plants) {
    const plantEntries = diaryEntries.filter((e) => e.plantId === plant.id);

    const lastWatering = latestEntryTimestamp(plantEntries, isWateringEntry);
    if (lastWatering == null || now - lastWatering >= WATERING_CADENCE_MS) {
      const age =
        lastWatering == null ? "no log yet" : formatAge(now - lastWatering);
      items.push({
        id: `cadence:water:${plant.id}`,
        kind: "cadence",
        priority: 2,
        title: `Log the next watering for ${plant.name}`,
        reason:
          lastWatering == null
            ? "No watering or feeding logged for this plant yet."
            : `No watering or feeding in ${age}.`,
        ctaLabel: "Quick Log",
        ctaHref: "/quick-log",
        plantId: plant.id,
        tentId: plant.tentId,
      });
    }

    const lastPhoto = latestEntryTimestamp(plantEntries, isPhotoEntry);
    if (lastPhoto == null || now - lastPhoto >= PHOTO_CADENCE_MS) {
      const age = lastPhoto == null ? "no photo yet" : formatAge(now - lastPhoto);
      items.push({
        id: `cadence:photo:${plant.id}`,
        kind: "cadence",
        priority: 3,
        title: `Capture a fresh photo of ${plant.name}`,
        reason:
          lastPhoto == null
            ? "No photo captured for this plant yet."
            : `No photo in ${age}.`,
        ctaLabel: "Quick Log",
        ctaHref: "/quick-log",
        plantId: plant.id,
        tentId: plant.tentId,
      });
    }

    // 4) Stage transition — flower-stage trichome/pistil check cadence.
    if (isFlowerStage(plant.stage)) {
      const lastCheck = latestEntryTimestamp(
        plantEntries,
        isTrichomeOrBudCheck,
      );
      if (
        lastCheck == null ||
        now - lastCheck >= FLOWER_TRICHOME_CHECK_CADENCE_MS
      ) {
        const age =
          lastCheck == null ? "never logged" : formatAge(now - lastCheck);
        items.push({
          id: `stage:trichome:${plant.id}`,
          kind: "stage_transition",
          priority: 3,
          title: `Check trichomes on ${plant.name}`,
          reason:
            lastCheck == null
              ? `${plant.name} is in flower — no trichome or pistil note yet.`
              : `${plant.name} is in flower — last trichome/pistil note ${age} ago.`,
          ctaLabel: "Log observation",
          ctaHref: "/quick-log",
          plantId: plant.id,
          tentId: plant.tentId,
        });
      }
    }
  }

  const visible = items
    .filter((item) => !dismissed.has(item.id))
    .sort(compareItems);

  return visible.slice(0, Math.max(0, maxItems));
}
