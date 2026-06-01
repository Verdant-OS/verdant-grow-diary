/**
 * plantDetailDataSourceView — pure view-model for the Plant Detail
 * data-source disclosure.
 *
 * Deterministic. No React, no I/O, no fetch, no privileged keys. Takes the
 * already-classified record meta from useGrowData (combineGrowDataMeta)
 * plus an optional sensor `snapshotSource` and optional `isStale` flag
 * (both already produced elsewhere in the app — this helper never queries
 * them) and produces a single honest disclosure label drawn from:
 *
 *   Live | Manual | Demo | Stale | Unavailable
 *
 * Safety contract:
 *   - "Live" is reserved for a sensor snapshot whose source is explicitly
 *     "live" AND whose underlying record store is real (supabase). Demo,
 *     manual, simulated, diary, or unknown snapshots NEVER produce "Live".
 *   - "Demo" overrides any other label whenever the record store or
 *     snapshot source is mock / simulated — never imply demo is live.
 *   - "Stale" is produced when the caller passes `isStale: true` for an
 *     otherwise-live or otherwise-manual reading. Stale is never promoted
 *     to Live.
 *   - "Unavailable" is the safe default when no source/status is known.
 *
 * No id / token / raw payload / provenance information is included in the
 * returned strings — only the label, badge text, helper title/body, and
 * one-line description.
 */

import type { GrowDataSource } from "@/hooks/useGrowData";
import type { SnapshotSource } from "@/lib/sensorSnapshot";

export type PlantDetailDataSourceLabel =
  | "Live"
  | "Manual"
  | "Demo"
  | "Stale"
  | "Unavailable";

export type PlantDetailDataSourceBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive";

export interface PlantDetailDataSourceInput {
  /** Combined record-store source from combineGrowDataMeta. */
  recordSource: GrowDataSource;
  /** Optional sensor snapshot source — when omitted, only records are described. */
  snapshotSource?: SnapshotSource | null;
  /** Optional caller-computed stale flag for the latest sensor reading. */
  isStale?: boolean;
}

export interface PlantDetailDataSourceView {
  label: PlantDetailDataSourceLabel;
  badgeText: string;
  description: string;
  helpTitle: string;
  helpBody: string;
  variant: PlantDetailDataSourceBadgeVariant;
}

const BADGE_TEXT: Record<PlantDetailDataSourceLabel, string> = {
  Live: "Live",
  Manual: "Manual",
  Demo: "Demo",
  Stale: "Stale",
  Unavailable: "Unavailable",
};

const VARIANT_BY_LABEL: Record<
  PlantDetailDataSourceLabel,
  PlantDetailDataSourceBadgeVariant
> = {
  Live: "default",
  Manual: "secondary",
  Demo: "outline",
  Stale: "secondary",
  Unavailable: "destructive",
};

const HELP: Record<
  PlantDetailDataSourceLabel,
  { description: string; helpTitle: string; helpBody: string }
> = {
  Live: {
    description: "Live sensor data from your tent.",
    helpTitle: "Live data",
    helpBody:
      "These readings are coming from a live sensor or bridge connected to this tent. Verdant still asks for grower approval before acting on them.",
  },
  Manual: {
    description: "Manually entered by you. Not a live sensor reading.",
    helpTitle: "Manual data",
    helpBody:
      "These values were entered by the grower in a diary or manual snapshot. They are honest grow-room observations but they are not a live sensor feed.",
  },
  Demo: {
    description: "Demo / sample data — not live tent data.",
    helpTitle: "Demo data",
    helpBody:
      "This is sample or simulated data so you can explore Verdant. It is not live tent data, not a real reading, and never drives persisted alerts or grow decisions.",
  },
  Stale: {
    description:
      "Readings may be outdated. Latest reading is older than the freshness window.",
    helpTitle: "Stale data",
    helpBody:
      "The latest sensor or manual reading for this plant is older than Verdant's freshness window, so it may not reflect current tent conditions. Capture a fresh reading before acting on it.",
  },
  Unavailable: {
    description: "No current sensor or source data is available yet.",
    helpTitle: "Unavailable",
    helpBody:
      "Verdant has no current sensor reading or trusted source for this plant. Add a manual snapshot or connect a sensor to start tracking live data.",
  },
};

/** Build the honest disclosure view. Pure, deterministic. */
export function buildPlantDetailDataSourceView(
  input: PlantDetailDataSourceInput,
): PlantDetailDataSourceView {
  const label = resolveLabel(input);
  const help = HELP[label];
  return {
    label,
    badgeText: BADGE_TEXT[label],
    description: help.description,
    helpTitle: help.helpTitle,
    helpBody: help.helpBody,
    variant: VARIANT_BY_LABEL[label],
  };
}

function resolveLabel(
  input: PlantDetailDataSourceInput,
): PlantDetailDataSourceLabel {
  const { recordSource, snapshotSource, isStale } = input;

  // 1. Demo / sample always wins — never let demo look live.
  if (recordSource === "mock") return "Demo";
  if (snapshotSource === "sim") return "Demo";
  // "Mixed" record store still includes demo data — disclose as Demo so
  // the grower never mistakes blended data for live tent data.
  if (recordSource === "mixed") return "Demo";

  // 2. Unavailable when nothing trustworthy is known.
  if (
    recordSource === "unavailable" &&
    (!snapshotSource || snapshotSource === "unavailable")
  ) {
    return "Unavailable";
  }

  // 3. Snapshot source drives the sensor-side label when present.
  if (snapshotSource === "live") {
    // Never call a snapshot "Live" if the underlying record store isn't real.
    if (recordSource !== "supabase") return "Unavailable";
    return isStale ? "Stale" : "Live";
  }
  if (snapshotSource === "manual" || snapshotSource === "diary") {
    return isStale ? "Stale" : "Manual";
  }
  if (snapshotSource === "unavailable") return "Unavailable";

  // 4. No snapshot source provided — fall back to record store classification.
  if (recordSource === "supabase") {
    // Plant/tent records are entered by the grower in Verdant. They are
    // honest grower data but not a live sensor feed.
    return isStale ? "Stale" : "Manual";
  }

  return "Unavailable";
}
