/**
 * PlantDetail blocked-state view model.
 *
 * Pure helpers. No JSX, no network, no side effects.
 *
 * Centralizes the navigation/copy decisions for every "non-ready" plant
 * detail state so the presenter stays a thin renderer:
 *
 *   - loading      : early skeleton (handled directly in the page)
 *   - loading-slow : bounded retryable surface after the load timeout
 *   - error        : explicit fetch failure
 *   - archived     : plant resolved but archived/merged (not active)
 *   - not-found    : plant query settled with no row
 *
 * "Back to tent" is offered whenever a safe tent route can be resolved
 * (either from the loaded plant or from a caller-supplied context tent id),
 * with "Back to plants" always available as a fallback.
 *
 * Layering: src/lib/* only depends on other pure helpers
 * (routes + archivedPlantVisibilityRules). It does NOT import React.
 */

import {
  getArchivedPlantLabel,
  isActivePlant,
  type ArchivedPlantLike,
} from "@/lib/archivedPlantVisibilityRules";
import { plantsPath, tentDetailPath } from "@/lib/routes";
import type { PlantDetailLoadState } from "@/lib/plantDetailLoadTimeoutRules";

export type PlantDetailBlockedStateKind =
  | "loading-slow"
  | "error"
  | "archived"
  | "not-found";

export interface PlantDetailBlockedStateAction {
  /** Stable test id for the link element. */
  testId: string;
  label: string;
  /** Client-side route path (already URL-encoded by route helpers). */
  path: string;
  kind: "tent" | "plants";
}

export interface PlantDetailBlockedStateView {
  kind: PlantDetailBlockedStateKind;
  /** Top-level `data-testid` for the wrapper. */
  testId: string;
  title: string;
  description: string;
  /** True when the surface should render a Retry button. */
  showRetry: boolean;
  /**
   * Preferred back action. Tent-scoped when a safe tent route resolves,
   * otherwise the global plants list.
   */
  primaryBack: PlantDetailBlockedStateAction;
  /**
   * Always-present fallback (the plants list). Omitted when primaryBack
   * already targets the plants list — UI may dedupe with `secondaryBack`.
   */
  secondaryBack: PlantDetailBlockedStateAction | null;
}

export interface DerivePlantDetailBlockedStateInput {
  loadState: PlantDetailLoadState;
  /** Resolved plant row, if any. */
  plant?: ArchivedPlantLike | null;
  /**
   * Tent context supplied by the caller for states where `plant` is null
   * (e.g. loading-slow / error). Ignored when the loaded plant already
   * carries a tent id. Non-string values are coerced away defensively.
   */
  contextTentId?: string | null;
}

const PLANTS_FALLBACK: PlantDetailBlockedStateAction = {
  testId: "plant-detail-back-to-plants",
  label: "Back to plants",
  path: plantsPath(),
  kind: "plants",
};

function readPlantTentId(p?: ArchivedPlantLike | null): string | null {
  if (!p) return null;
  const candidate =
    (p as { tentId?: unknown }).tentId ?? (p as { tent_id?: unknown }).tent_id;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function tentBack(tentId: string): PlantDetailBlockedStateAction {
  return {
    testId: "plant-detail-back-to-tent",
    label: "Back to tent",
    path: tentDetailPath(tentId),
    kind: "tent",
  };
}

export function resolveBackContext(
  input: DerivePlantDetailBlockedStateInput,
): { primary: PlantDetailBlockedStateAction; secondary: PlantDetailBlockedStateAction | null } {
  const plantTentId = readPlantTentId(input.plant);
  const ctxTentId =
    typeof input.contextTentId === "string" && input.contextTentId.length > 0
      ? input.contextTentId
      : null;
  const tentId = plantTentId ?? ctxTentId;
  if (tentId) {
    return { primary: tentBack(tentId), secondary: PLANTS_FALLBACK };
  }
  return { primary: PLANTS_FALLBACK, secondary: null };
}

/**
 * Deterministic blocked-state view derivation.
 *
 * Returns `null` for non-blocked load states (`loading` and `ready`) so
 * the presenter can fall through to its existing skeleton / full render.
 */
export function derivePlantDetailBlockedStateView(
  input: DerivePlantDetailBlockedStateInput,
): PlantDetailBlockedStateView | null {
  const { loadState, plant } = input;
  const { primary, secondary } = resolveBackContext(input);

  switch (loadState) {
    case "loading-slow":
      return {
        kind: "loading-slow",
        testId: "plant-detail-loading-slow",
        title: "Still loading this plant",
        description:
          "Loading is taking longer than expected. Check your connection and retry, or head back to your tent.",
        showRetry: true,
        primaryBack: primary,
        secondaryBack: secondary,
      };
    case "error":
      return {
        kind: "error",
        testId: "plant-detail-error",
        title: "Couldn't load this plant",
        description:
          "Something went wrong while loading plant details. Check your connection and retry.",
        showRetry: true,
        primaryBack: primary,
        secondaryBack: secondary,
      };
    case "not-found":
      return {
        kind: "not-found",
        testId: "plant-detail-not-found",
        title: "Plant not found",
        description: "This plant isn't in your tracked plants yet.",
        showRetry: false,
        primaryBack: primary,
        secondaryBack: secondary,
      };
    case "ready": {
      // "Ready" usually means the page renders the full plant detail.
      // The presenter intercepts this only when the plant is archived/merged,
      // which we surface as a dedicated, non-missing blocked state.
      if (!plant || isActivePlant(plant)) return null;
      const label = getArchivedPlantLabel(plant);
      const merged = label.kind === "merged";
      return {
        kind: "archived",
        testId: "plant-detail-archived",
        title: merged ? "Plant merged" : "Plant archived",
        description: merged
          ? "This plant exists but was merged into another plant and is no longer active."
          : "This plant exists but is no longer active. Its history is preserved.",
        showRetry: false,
        primaryBack: primary,
        secondaryBack: secondary,
      };
    }
    case "loading":
    default:
      return null;
  }
}
