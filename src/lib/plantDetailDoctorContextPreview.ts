/**
 * plantDetailDoctorContextPreview — pure view-model for the Plant
 * Detail "Doctor context" preview card.
 *
 * Deterministic. No React, no I/O, no fetch, no AI calls, no writes, no
 * RPC, no functions.invoke, no scheduling. Consumes already-loaded
 * Plant Detail signals (stage, recent activity rows, photo presence,
 * optional alert/action counts) and projects a cautious read-only
 * preview of what context AI Doctor would have for this plant.
 *
 * Copy never promises diagnosis certainty and never implies any
 * automation or hardware steering. Internal IDs, raw payloads, storage
 * paths, tokens, secrets, and provenance markers are never emitted.
 */
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";

export type DoctorContextItemState = "available" | "missing" | "stale";

export type DoctorContextItemKind =
  | "stage"
  | "timeline"
  | "photo"
  | "sensor_snapshot"
  | "watering_feeding"
  | "open_alerts"
  | "pending_actions";

export interface DoctorContextItem {
  kind: DoctorContextItemKind;
  label: string;
  state: DoctorContextItemState;
  /** Optional short, non-sensitive detail (e.g., "2 open", "Stage: flower"). */
  detail?: string;
}

export interface DoctorContextPreviewResult {
  /** All evaluated items, in display order. */
  items: DoctorContextItem[];
  /** Number of items considered "available". */
  availableCount: number;
  /** Number of items considered "missing" (excludes stale). */
  missingCount: number;
  /** Number of items considered "stale". */
  staleCount: number;
  /** Total number of evaluated items (excluding optional counts when absent). */
  totalCount: number;
}

export interface PlantDetailDoctorContextPreviewInput {
  stage?: string | null;
  hasPlantPhoto?: boolean;
  /** Recent activity rows already normalized for this plant. Newest first. */
  recentActivity: readonly PlantRecentActivityRow[];
  /** Optional open alerts count for the plant/tent context. Undefined → row hidden. */
  openAlertsCount?: number | null;
  /** Optional pending action queue count. Undefined → row hidden. */
  pendingActionsCount?: number | null;
  /** Stable "now" timestamp for deterministic staleness. */
  now: Date;
}

/** Maximum age (ms) before a signal is considered stale. */
export const DOCTOR_CONTEXT_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const STAGE_LABELS_KNOWN = new Set([
  "seedling",
  "veg",
  "vegetative",
  "flower",
  "flowering",
  "harvest",
  "drying",
  "curing",
  "cloning",
  "transition",
]);

function isStageKnown(stage: string | null | undefined): { known: boolean; label: string } {
  if (stage == null) return { known: false, label: "" };
  const s = stage.toString().trim().toLowerCase();
  if (s === "" || s === "unknown") return { known: false, label: "" };
  const label = STAGE_LABELS_KNOWN.has(s) ? s : s;
  return { known: true, label };
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return t;
}

function ageState(latestAt: number | null, now: number): DoctorContextItemState {
  if (latestAt == null) return "missing";
  if (now - latestAt > DOCTOR_CONTEXT_STALE_AFTER_MS) return "stale";
  return "available";
}

function safeCount(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  const v = Math.trunc(n);
  if (v < 0) return 0;
  return v;
}

export function buildPlantDetailDoctorContextPreview(
  input: PlantDetailDoctorContextPreviewInput,
): DoctorContextPreviewResult {
  const now = input.now.getTime();
  const rows = Array.isArray(input.recentActivity) ? input.recentActivity : [];

  // Stage
  const stage = isStageKnown(input.stage);
  const stageItem: DoctorContextItem = stage.known
    ? { kind: "stage", label: "Stage", state: "available", detail: stage.label }
    : { kind: "stage", label: "Stage", state: "missing", detail: "Not set" };

  // Timeline
  let latestTimelineAt: number | null = null;
  for (const r of rows) {
    const t = parseDate(r.occurredAt);
    if (t != null && (latestTimelineAt == null || t > latestTimelineAt)) {
      latestTimelineAt = t;
    }
  }
  const timelineItem: DoctorContextItem = {
    kind: "timeline",
    label: "Recent timeline entries",
    state: rows.length === 0 ? "missing" : ageState(latestTimelineAt, now),
  };

  // Photo — current plant photo counts as available (not stale-trackable),
  // otherwise look for the latest photo-bearing recent activity row.
  let photoState: DoctorContextItemState;
  if (input.hasPlantPhoto) {
    photoState = "available";
  } else {
    let latestPhotoAt: number | null = null;
    for (const r of rows) {
      if (!r.hasPhoto) continue;
      const t = parseDate(r.occurredAt);
      if (t != null && (latestPhotoAt == null || t > latestPhotoAt)) {
        latestPhotoAt = t;
      }
    }
    photoState = ageState(latestPhotoAt, now);
  }
  const photoItem: DoctorContextItem = {
    kind: "photo",
    label: "Recent photo",
    state: photoState,
  };

  // Sensor snapshot (manual or sensor-sourced — both ok for context)
  let latestSnapAt: number | null = null;
  for (const r of rows) {
    if (!r.hasSnapshot) continue;
    const t = parseDate(r.snapshotAt ?? r.occurredAt);
    if (t != null && (latestSnapAt == null || t > latestSnapAt)) {
      latestSnapAt = t;
    }
  }
  const sensorItem: DoctorContextItem = {
    kind: "sensor_snapshot",
    label: "Recent sensor snapshot",
    state: ageState(latestSnapAt, now),
  };

  // Watering or feeding note
  let latestWFAt: number | null = null;
  for (const r of rows) {
    const cat = classifyTimelineEntry({ eventType: r.eventType });
    if (cat !== "watering" && cat !== "feeding") continue;
    const t = parseDate(r.occurredAt);
    if (t != null && (latestWFAt == null || t > latestWFAt)) {
      latestWFAt = t;
    }
  }
  const wfItem: DoctorContextItem = {
    kind: "watering_feeding",
    label: "Recent watering or feed note",
    state: ageState(latestWFAt, now),
  };

  const items: DoctorContextItem[] = [
    stageItem,
    timelineItem,
    photoItem,
    sensorItem,
    wfItem,
  ];

  const alertsCount = safeCount(input.openAlertsCount);
  if (alertsCount != null) {
    items.push({
      kind: "open_alerts",
      label: "Open alerts",
      state: alertsCount > 0 ? "available" : "missing",
      detail: alertsCount > 0 ? `${alertsCount} open` : "None",
    });
  }

  const actionsCount = safeCount(input.pendingActionsCount);
  if (actionsCount != null) {
    items.push({
      kind: "pending_actions",
      label: "Pending actions",
      state: actionsCount > 0 ? "available" : "missing",
      detail: actionsCount > 0 ? `${actionsCount} pending` : "None",
    });
  }

  let availableCount = 0;
  let missingCount = 0;
  let staleCount = 0;
  for (const it of items) {
    if (it.state === "available") availableCount++;
    else if (it.state === "missing") missingCount++;
    else if (it.state === "stale") staleCount++;
  }

  return {
    items,
    availableCount,
    missingCount,
    staleCount,
    totalCount: items.length,
  };
}

export const DOCTOR_CONTEXT_HELPER_COPY =
  "AI Doctor works best when notes, photos, and sensor snapshots are available.";
