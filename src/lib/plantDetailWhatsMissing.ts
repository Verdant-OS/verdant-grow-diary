/**
 * plantDetailWhatsMissing — pure view-model for the Plant Detail
 * "What's Missing?" guidance panel.
 *
 * Deterministic. No React, no I/O, no fetch, no privileged keys, no
 * writes. Consumes already-loaded Plant Detail signals and projects up
 * to 3 missing/stale context prompts with safe CTAs that reuse existing
 * routes/events.
 *
 * Priority (deterministic):
 *  1. no timeline entries
 *  2. stage unknown
 *  3. no recent photo
 *  4. no sensor snapshot
 *  5. no recent watering/feed note
 */

import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import {
  ONE_TENT_LOOP_CTA_LABEL,
  resolveOneTentLoopNextStep,
  type OneTentLoopIds,
  type OneTentLoopNextStep,
} from "@/lib/oneTentLoopNavigationRules";
import { PLANT_RELATIVE_TIMELINE_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { plantDetailPath } from "@/lib/routes";

export type WhatsMissingPromptKind =
  | "no_timeline"
  | "stage_unknown"
  | "no_recent_photo"
  | "no_sensor_snapshot"
  | "no_recent_watering_or_feed";

export type WhatsMissingCtaKind = "quicklog" | "sensor_snapshot" | "upload_photo";

export interface WhatsMissingPrompt {
  kind: WhatsMissingPromptKind;
  title: string;
  description: string;
  cta?: WhatsMissingCta;
}

export interface WhatsMissingCta {
  kind: WhatsMissingCtaKind;
  label: string;
  /** Route href when the CTA navigates. */
  href?: string;
  /** Global event name when the CTA dispatches instead of navigating. */
  event?: "open-quicklog";
  /** Existing Quick Log prefill; the grower still reviews and saves. */
  eventPayload?: {
    plantId: string | null;
    growId: string | null;
    activityId: "photo";
  };
  /** Query params object for href construction (kept minimal). */
  query?: Record<string, string>;
}

export interface PlantDetailWhatsMissingInput {
  plantId: string | null | undefined;
  growId?: string | null;
  /** True when the plant has at least one recent timeline/activity entry. */
  hasTimelineEntries: boolean;
  /** Current plant stage value (null/undefined/empty counts as unknown). */
  stage?: string | null;
  /** True when a recent photo exists for this plant. */
  hasRecentPhoto: boolean;
  /** True when at least one recent activity entry includes a sensor snapshot. */
  hasSensorSnapshot: boolean;
  /** True when at least one recent activity entry is watering or feeding. */
  hasRecentWateringOrFeed: boolean;
}

type PlantDetailActivitySignals = Pick<
  PlantDetailWhatsMissingInput,
  "hasTimelineEntries" | "hasRecentPhoto" | "hasSensorSnapshot" | "hasRecentWateringOrFeed"
>;

export const PLANT_ACTIVITY_UNAVAILABLE_COPY =
  "Recent plant activity is unavailable. Try again shortly.";

/**
 * Share the existing recent-activity projection between both plant guidance
 * surfaces. Any saved note counts as activity; it does not imply watering/feed.
 * Null means unavailable, whereas a successful [] means no recorded activity.
 * Reject the whole read if normalization drops or cannot validate any row.
 */
export function derivePlantDetailActivitySignals(
  plantId: string | null | undefined,
  hasPlantPhoto: boolean,
  rawRows: unknown,
): PlantDetailActivitySignals | null {
  if (!plantId || !Array.isArray(rawRows)) return null;

  try {
    const rows = buildPlantRecentActivity(rawRows, { plantId, limit: rawRows.length || 1 });
    if (
      rows.length !== rawRows.length ||
      rows.some(
        (row) =>
          !row.occurredAt || row.warnings.some((warning) => warning !== "event-type:missing"),
      )
    ) {
      return null;
    }

    let hasRecentPhoto = hasPlantPhoto;
    let hasSensorSnapshot = false;
    let hasRecentWateringOrFeed = false;
    for (const row of rows) {
      if (row.hasPhoto) hasRecentPhoto = true;
      if (row.hasSnapshot) hasSensorSnapshot = true;
      const category = classifyTimelineEntry({ eventType: row.eventType });
      if (category === "watering" || category === "feeding") hasRecentWateringOrFeed = true;
    }
    return {
      hasTimelineEntries: rows.length > 0,
      hasRecentPhoto,
      hasSensorSnapshot,
      hasRecentWateringOrFeed,
    };
  } catch {
    return null;
  }
}

/** Adapt the plant step only; the other One-Tent Loop steps keep their rules. */
export function resolvePlantDetailActivityNextStep(
  ids: OneTentLoopIds | undefined,
  activity: { data?: unknown; isLoading?: boolean; isError?: boolean },
): OneTentLoopNextStep {
  const base = resolveOneTentLoopNextStep("plant", ids);
  const plantId = base.quickLogPrefill?.plantId;
  if (!plantId) return base;

  const signals =
    activity.isError || activity.isLoading
      ? null
      : derivePlantDetailActivitySignals(plantId, false, activity.data);
  if (!signals) {
    return {
      ...base,
      next: null,
      disabled: true,
      quickLogPrefill: null,
      disabledReason: activity.isLoading
        ? "Loading recent plant activity…"
        : PLANT_ACTIVITY_UNAVAILABLE_COPY,
    };
  }
  if (!signals.hasTimelineEntries) return base;

  return {
    ...base,
    next: "timeline",
    ctaLabel: ONE_TENT_LOOP_CTA_LABEL["quick-log"],
    intent: "navigate",
    href: `${plantDetailPath(plantId)}#${PLANT_RELATIVE_TIMELINE_ANCHOR_ID}`,
    quickLogPrefill: null,
  };
}

const PROMPTS: Record<WhatsMissingPromptKind, { title: string; description: string }> = {
  no_timeline: {
    title: "No timeline entries yet",
    description: "Logging helps you track what happened and when.",
  },
  stage_unknown: {
    title: "Stage unknown",
    description: "Set the plant stage so Verdant can tailor guidance and VPD targets.",
  },
  no_recent_photo: {
    title: "No recent photo",
    description: "Photos help compare plant response over time.",
  },
  no_sensor_snapshot: {
    title: "No sensor snapshot",
    description: "Sensor snapshots help separate environment issues from plant issues.",
  },
  no_recent_watering_or_feed: {
    title: "No recent watering or feed note",
    description: "Watering and feeding logs help spot patterns and prevent repeats.",
  },
};

function buildCta(
  kind: WhatsMissingCtaKind,
  plantId?: string | null,
  growId?: string | null,
): WhatsMissingCta {
  switch (kind) {
    case "quicklog":
      return { kind, label: "Add Quick Log", event: "open-quicklog" };
    case "sensor_snapshot": {
      const href = growId ? `/sensors?growId=${encodeURIComponent(growId)}` : "/sensors";
      return { kind, label: "Add manual sensor snapshot", href };
    }
    case "upload_photo": {
      return {
        kind,
        label: "Upload photo",
        event: "open-quicklog",
        eventPayload: {
          plantId: plantId ?? null,
          growId: growId ?? null,
          activityId: "photo",
        },
      };
    }
  }
}

function isStageUnknown(stage: string | null | undefined): boolean {
  if (stage == null) return true;
  const s = stage.toString().trim().toLowerCase();
  return s === "" || s === "unknown";
}

const PRIORITY: WhatsMissingPromptKind[] = [
  "no_timeline",
  "stage_unknown",
  "no_recent_photo",
  "no_sensor_snapshot",
  "no_recent_watering_or_feed",
];

const CTA_FOR_KIND: Record<WhatsMissingPromptKind, WhatsMissingCtaKind | null> = {
  no_timeline: "quicklog",
  stage_unknown: null,
  no_recent_photo: "upload_photo",
  no_sensor_snapshot: "sensor_snapshot",
  no_recent_watering_or_feed: "quicklog",
};

/**
 * Build the "What's Missing?" prompt list for Plant Detail.
 *
 * Returns up to 3 prompts in deterministic priority order.
 * When nothing is missing, returns an empty array so the caller can
 * render calm success copy.
 */
export function buildPlantDetailWhatsMissing(
  input: PlantDetailWhatsMissingInput,
): WhatsMissingPrompt[] {
  const out: WhatsMissingPrompt[] = [];

  const conditions: Record<WhatsMissingPromptKind, boolean> = {
    no_timeline: !input.hasTimelineEntries,
    stage_unknown: isStageUnknown(input.stage),
    no_recent_photo: !input.hasRecentPhoto,
    no_sensor_snapshot: !input.hasSensorSnapshot,
    no_recent_watering_or_feed: !input.hasRecentWateringOrFeed,
  };

  for (const kind of PRIORITY) {
    if (conditions[kind]) {
      const ctaKind = CTA_FOR_KIND[kind];
      const prompt: WhatsMissingPrompt = {
        kind,
        ...PROMPTS[kind],
        ...(ctaKind ? { cta: buildCta(ctaKind, input.plantId, input.growId) } : {}),
      };
      out.push(prompt);
    }
    if (out.length >= 3) break;
  }

  return out;
}
