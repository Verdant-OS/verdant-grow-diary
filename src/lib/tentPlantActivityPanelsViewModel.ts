/**
 * tentPlantActivityPanelsViewModel — pure helper for the Tent Detail
 * per-plant Activity Panels.
 *
 * Deterministic. No React, no I/O, no Supabase, no AI/model calls, no
 * alerts, no Action Queue writes, no device control. Reuses the existing
 * per-plant recency + Harvest Watch public state already provided by
 * `useTentPlantRosterActivity` and the existing Quick Log prefill helper.
 *
 * Plant-scoped only — activity is keyed by plant id and never mixed
 * across plants in the same tent.
 */

import {
  buildPlantQuickLogPrefill,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";
import { plantDetailPath } from "@/lib/routes";
import {
  PLANT_RELATIVE_TIMELINE_ANCHOR_ID,
  PLANT_PHOTOS_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";

export interface TentPlantActivityPanelsPlantInput {
  id: string;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  isArchived?: boolean | null;
}

export interface TentPlantActivityPanelsActivityEntry {
  latestLogAt?: string | null;
  latestLogSummary?: string | null;
  hasRecentPhoto?: boolean | null;
  harvestWatchPublicState?: string | null;
}

export interface TentPlantActivityPanelsInput {
  plants: ReadonlyArray<TentPlantActivityPanelsPlantInput>;
  activityByPlantId: Readonly<
    Record<string, TentPlantActivityPanelsActivityEntry>
  >;
  includeArchived: boolean;
  /** null = "All plants" — show every visible plant's panel. */
  selectedPlantId: string | null;
  tentId: string | null;
  tentName: string | null;
  growId: string | null;
  /** Defaults to true — Plant Detail renders `#plant-photos`. */
  photosAnchorAvailable?: boolean;
}

export type TentPlantActivityPanelsHarvestWatchTone =
  | "neutral"
  | "info"
  | "watch"
  | "review"
  | "past"
  | "unknown";

export interface TentPlantActivityPanelHarvestWatch {
  state: string | null;
  copy: string;
  helpText: string;
  cautionText: string;
  tone: TentPlantActivityPanelsHarvestWatchTone;
  isFallback: boolean;
}

export interface TentPlantActivityPanelRow {
  id: string;
  name: string;
  strain: string | null;
  stage: string | null;
  isArchived: boolean;

  latestLogAt: string | null;
  latestLogDateLabel: string | null;
  latestLogSummary: string | null;
  diaryEmptyCopy: string | null;

  hasRecentPhoto: boolean;
  photoEmptyCopy: string | null;

  harvestWatch: TentPlantActivityPanelHarvestWatch;

  plantDetailHref: string;
  diaryHref: string;
  diaryAccessibleLabel: string;
  photosHref: string;
  photosAccessibleLabel: string;
  photosAnchorBlocked: boolean;

  quickLogCtaLabel: string;
  quickLogCtaAccessibleLabel: string;
  quickLogPrefill: PlantQuickLogPrefill | null;
  quickLogDisabled: boolean;
  quickLogDisabledReason: string | null;

  testId: string;
}

export interface TentPlantActivityPanelsViewModel {
  panels: TentPlantActivityPanelRow[];
  selectedPlantId: string | null;
  emptyCopy: string | null;
  sharedEnvironmentReminderCopy: string;
}

export const TENT_PLANT_ACTIVITY_NO_DIARY_COPY =
  "No recent diary activity for this plant.";
export const TENT_PLANT_ACTIVITY_NO_PHOTOS_COPY =
  "No recent photos for this plant.";
export const TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY =
  "Harvest Watch available on Plant Detail.";
export const TENT_PLANT_ACTIVITY_SHARED_ENV_COPY =
  "Tent environment is shared. Plant response is tracked per plant.";
export const TENT_PLANT_ACTIVITY_EMPTY_NO_PLANTS_COPY =
  "No plants assigned to this tent yet.";
export const TENT_PLANT_ACTIVITY_EMPTY_SELECTED_PLANT_COPY =
  "No plant-specific activity found for this plant yet.";

const HARVEST_WATCH_LABELS: Record<
  string,
  { copy: string; tone: TentPlantActivityPanelsHarvestWatchTone }
> = {
  not_enough_evidence: {
    copy: "Harvest Watch: not enough evidence yet.",
    tone: "neutral",
  },
  too_early_to_call: {
    copy: "Harvest Watch: too early to call.",
    tone: "info",
  },
  watch_window: {
    copy: "Harvest Watch: in observation window.",
    tone: "watch",
  },
  ready_for_manual_review: {
    copy: "Harvest Watch: queued for manual review on Plant Detail.",
    tone: "review",
  },
  past_expected_window: {
    copy: "Harvest Watch: past expected window — review on Plant Detail.",
    tone: "past",
  },
  unknown: {
    copy: "Harvest Watch: state unknown — review on Plant Detail.",
    tone: "unknown",
  },
};

function plantDisplayName(p: TentPlantActivityPanelsPlantInput): string {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  return name.length > 0 ? name : "Unnamed plant";
}

function formatDateLabel(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return null;
  }
}

function harvestWatchFor(
  state: string | null | undefined,
): TentPlantActivityPanelHarvestWatch {
  if (typeof state === "string" && state.length > 0) {
    const known = HARVEST_WATCH_LABELS[state];
    if (known) {
      return {
        state,
        copy: known.copy,
        tone: known.tone,
        isFallback: false,
      };
    }
    return {
      state,
      copy: TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY,
      tone: "unknown",
      isFallback: true,
    };
  }
  return {
    state: null,
    copy: TENT_PLANT_ACTIVITY_HARVEST_WATCH_FALLBACK_COPY,
    tone: "unknown",
    isFallback: true,
  };
}

export function buildTentPlantActivityPanelsViewModel(
  input: TentPlantActivityPanelsInput,
): TentPlantActivityPanelsViewModel {
  const includeArchived = input.includeArchived === true;
  const activity = input.activityByPlantId ?? {};
  const photosAnchorAvailable =
    input.photosAnchorAvailable === false ? false : true;

  const plants = Array.isArray(input.plants) ? input.plants : [];
  const visible = plants.filter((p) =>
    includeArchived ? true : p.isArchived !== true,
  );

  // Resolve selection: invalid/archived-hidden falls back to "all visible".
  let scoped: TentPlantActivityPanelsPlantInput[];
  let resolvedSelection: string | null;
  if (input.selectedPlantId == null) {
    scoped = visible;
    resolvedSelection = null;
  } else {
    const match = visible.find((p) => p.id === input.selectedPlantId) ?? null;
    if (match) {
      scoped = [match];
      resolvedSelection = match.id;
    } else {
      scoped = visible;
      resolvedSelection = null;
    }
  }

  const panels: TentPlantActivityPanelRow[] = scoped.map((p) => {
    const name = plantDisplayName(p);
    const a = activity[p.id] ?? {};
    const latestLogAt =
      typeof a.latestLogAt === "string" && a.latestLogAt.length > 0
        ? a.latestLogAt
        : null;
    const latestLogDateLabel = formatDateLabel(latestLogAt);
    const latestLogSummary =
      typeof a.latestLogSummary === "string" && a.latestLogSummary.length > 0
        ? a.latestLogSummary
        : null;
    const hasRecentPhoto = a.hasRecentPhoto === true;

    const plantDetailHref = plantDetailPath(p.id);
    const diaryHref = `${plantDetailHref}#${PLANT_RELATIVE_TIMELINE_ANCHOR_ID}`;
    const photosHref = photosAnchorAvailable
      ? `${plantDetailHref}#${PLANT_PHOTOS_ANCHOR_ID}`
      : plantDetailHref;

    const prefill = buildPlantQuickLogPrefill({
      plantId: p.id,
      plantName: name,
      growId: input.growId,
      tentId: input.tentId,
      tentName: input.tentName,
    });

    return {
      id: p.id,
      name,
      strain:
        typeof p.strain === "string" && p.strain.length > 0 ? p.strain : null,
      stage:
        typeof p.stage === "string" && p.stage.length > 0 ? p.stage : null,
      isArchived: p.isArchived === true,

      latestLogAt,
      latestLogDateLabel,
      latestLogSummary,
      diaryEmptyCopy: latestLogAt ? null : TENT_PLANT_ACTIVITY_NO_DIARY_COPY,

      hasRecentPhoto,
      photoEmptyCopy: hasRecentPhoto
        ? null
        : TENT_PLANT_ACTIVITY_NO_PHOTOS_COPY,

      harvestWatch: harvestWatchFor(a.harvestWatchPublicState ?? null),

      plantDetailHref,
      diaryHref,
      diaryAccessibleLabel: `Open ${name} diary on Plant Detail`,
      photosHref,
      photosAccessibleLabel: `Open ${name} photos on Plant Detail`,
      photosAnchorBlocked: !photosAnchorAvailable,

      quickLogCtaLabel: "Add Quick Log",
      quickLogCtaAccessibleLabel: `Add Quick Log for ${name}`,
      quickLogPrefill: prefill,
      quickLogDisabled: !prefill,
      quickLogDisabledReason: prefill
        ? null
        : "Plant, tent, or grow context is not loaded yet.",

      testId: `tent-plant-activity-panel-${p.id}`,
    };
  });

  let emptyCopy: string | null = null;
  if (visible.length === 0) {
    emptyCopy = TENT_PLANT_ACTIVITY_EMPTY_NO_PLANTS_COPY;
  } else if (panels.length === 0) {
    emptyCopy = TENT_PLANT_ACTIVITY_EMPTY_SELECTED_PLANT_COPY;
  }

  return {
    panels,
    selectedPlantId: resolvedSelection,
    emptyCopy,
    sharedEnvironmentReminderCopy: TENT_PLANT_ACTIVITY_SHARED_ENV_COPY,
  };
}
