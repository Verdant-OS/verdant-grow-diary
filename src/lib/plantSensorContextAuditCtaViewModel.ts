/**
 * plantSensorContextAuditCtaViewModel — pure helper that decides whether
 * the Sensor Context Audit panel should render a Quick Log manual-sensor
 * CTA, and produces only safe identity context (plant/tent/grow + manual
 * source label). Never fabricates sensor readings.
 *
 * No I/O. No React. No Supabase. No fetch. No model calls.
 */
import type { PlantSensorContextStatus } from "@/lib/plantSensorContextAuditViewModel";
import {
  buildPlantQuickLogPrefill,
  type PlantQuickLogPrefill,
  type PlantQuickLogPrefillInput,
} from "@/lib/plantQuickLogPrefillRules";
import { plantDetailPath, plantsPath } from "@/lib/routes";
import { PLANT_DETAIL_SECTION_ANCHORS } from "@/lib/plantDetailSectionAnchors";

export type PlantSensorContextCtaKind = "none" | "add" | "refresh" | "recovery";

export interface PlantSensorContextCtaView {
  kind: PlantSensorContextCtaKind;
  /** Visible button label. Empty for "none". */
  label: string;
  /** Honest next step when identity or the mounted handler is incomplete. */
  recoveryMessage: string | null;
  /** Existing internal route that can resolve the missing context. */
  recoveryHref: string | null;
  /** Identity-only prefill — never any sensor values. null when no CTA. */
  prefill: (PlantQuickLogPrefill & { source: "manual" }) | null;
}

export interface PlantSensorContextCtaInput {
  status: PlantSensorContextStatus;
  identity: PlantQuickLogPrefillInput | null | undefined;
  /** True when a Quick Log open-handler/route is wired on this screen. */
  hasOpenHandler: boolean;
}

const NO_CTA: PlantSensorContextCtaView = {
  kind: "none",
  label: "",
  recoveryMessage: null,
  recoveryHref: null,
  prefill: null,
};

function plantOverviewPath(plantId: string): string {
  return `${plantDetailPath(plantId)}#${PLANT_DETAIL_SECTION_ANCHORS.overview}`;
}

function manualSnapshotNoun(status: PlantSensorContextStatus): string {
  return status === "stale" ? "a fresh manual sensor snapshot" : "a manual sensor snapshot";
}

function buildRecovery(
  status: PlantSensorContextStatus,
  identity: PlantQuickLogPrefillInput | null | undefined,
  hasOpenHandler: boolean,
): PlantSensorContextCtaView {
  const snapshot = manualSnapshotNoun(status);
  const plantId = identity?.plantId ?? null;
  const growId = identity?.growId ?? null;
  const tentId = identity?.tentId ?? null;

  if (!plantId) {
    return {
      kind: "recovery",
      label: "Choose a plant",
      recoveryMessage: `Choose a plant before adding ${snapshot}.`,
      recoveryHref: plantsPath(growId),
      prefill: null,
    };
  }

  if (!growId) {
    return {
      kind: "recovery",
      label: "Review grow setup",
      recoveryMessage: `This plant needs a grow assignment before you can add ${snapshot}.`,
      recoveryHref: "/grows",
      prefill: null,
    };
  }

  if (!tentId) {
    return {
      kind: "recovery",
      label: "Assign plant to a tent",
      recoveryMessage: `Assign this plant to a tent before adding ${snapshot}.`,
      recoveryHref: plantOverviewPath(plantId),
      prefill: null,
    };
  }

  if (!hasOpenHandler) {
    return {
      kind: "recovery",
      label: "Open plant Quick Log",
      recoveryMessage: `Open the plant overview and use Quick Log to add ${snapshot}.`,
      recoveryHref: plantOverviewPath(plantId),
      prefill: null,
    };
  }

  // Defensive fallback: buildPlantQuickLogPrefill rejects any identity that
  // cannot safely target the existing Quick Log surface.
  return {
    kind: "recovery",
    label: "Review plant setup",
    recoveryMessage: `Review this plant's grow and tent assignments before adding ${snapshot}.`,
    recoveryHref: plantOverviewPath(plantId),
    prefill: null,
  };
}

export function buildPlantSensorContextAuditCta(
  input: PlantSensorContextCtaInput,
): PlantSensorContextCtaView {
  const { status } = input;
  if (status !== "missing" && status !== "stale") return NO_CTA;

  const label = status === "missing" ? "Add manual sensor snapshot" : "Add fresh sensor snapshot";

  const prefill = buildPlantQuickLogPrefill(input.identity ?? null);
  if (!input.hasOpenHandler || !prefill) {
    return buildRecovery(status, input.identity, input.hasOpenHandler);
  }

  return {
    kind: status === "missing" ? "add" : "refresh",
    label,
    recoveryMessage: null,
    recoveryHref: null,
    // Identity + manual source label only. No sensor values.
    prefill: { ...prefill, source: "manual" },
  };
}
