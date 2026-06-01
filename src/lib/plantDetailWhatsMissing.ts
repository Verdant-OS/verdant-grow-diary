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

export type WhatsMissingPromptKind =
  | "no_timeline"
  | "stage_unknown"
  | "no_recent_photo"
  | "no_sensor_snapshot"
  | "no_recent_watering_or_feed";

export type WhatsMissingCtaKind =
  | "quicklog"
  | "sensor_snapshot"
  | "upload_photo";

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
      const href = growId ? `/logs?growId=${encodeURIComponent(growId)}` : "/logs";
      return { kind, label: "Upload photo", href };
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
        ...(ctaKind ? { cta: buildCta(ctaKind, input.growId) } : {}),
      };
      out.push(prompt);
    }
    if (out.length >= 3) break;
  }

  return out;
}
