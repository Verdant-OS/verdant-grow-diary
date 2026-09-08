/**
 * Pure helper that derives grower-facing tent/plant target copy for an alert.
 *
 * Strict constraints:
 *   - No I/O. No Supabase. No React. No AI. No automation. No device control.
 *   - No alert writes. No Action Queue writes.
 *   - Never returns a raw UUID as a visible label.
 *   - Missing tent/plant is fail-closed copy, never a silent blank.
 */
import { looksLikeUuid } from "@/lib/growDisplayLabel";

export const ALERT_TARGET_PREFIX = "Target:";

export const ALERT_TARGET_UNAVAILABLE_TEXT =
  "Target tent and plant unavailable for this alert.";

export const ALERT_TARGET_LOADING_TEXT = "Loading tent and plant names…";

export const ALERT_TARGET_NAME_UNAVAILABLE_LABEL = "Name unavailable";

export type AlertTargetKind = "located" | "unavailable" | "names_unavailable" | "loading";

export interface AlertTargetContext {
  kind: AlertTargetKind;
  tentId: string | null;
  plantId: string | null;
  tentLabel: string | null;
  plantLabel: string | null;
  /** Compact one-line copy, never empty. */
  text: string;
}

function trimId(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Visible entity label. Blank, missing, and UUID-shaped strings collapse to
 * null so growers never see an internal id as the "name".
 */
export function sanitizeAlertTargetLabel(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (looksLikeUuid(trimmed)) return null;
  return trimmed;
}

function fieldLabel(kind: "Tent" | "Plant", name: string | null): string {
  return `${kind}: ${name ?? ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`;
}

export interface AlertTargetContextInput {
  tentId?: string | null;
  plantId?: string | null;
  tentName?: string | null;
  plantName?: string | null;
  namesLoading?: boolean;
}

/**
 * Derive tent/plant target context for list and detail surfaces.
 *
 * - No tent_id and no plant_id → unavailable copy.
 * - Ids present while names are still loading → loading copy (not a false
 *   unavailable flash).
 * - Ids present with resolved names → "Tent: … · Plant: …".
 * - Ids present but names missing/UUID → per-field "Name unavailable".
 */
export function deriveAlertTargetContext(input: AlertTargetContextInput): AlertTargetContext {
  const tentId = trimId(input.tentId);
  const plantId = trimId(input.plantId);
  const tentLabel = tentId ? sanitizeAlertTargetLabel(input.tentName) : null;
  const plantLabel = plantId ? sanitizeAlertTargetLabel(input.plantName) : null;

  if (!tentId && !plantId) {
    return {
      kind: "unavailable",
      tentId: null,
      plantId: null,
      tentLabel: null,
      plantLabel: null,
      text: ALERT_TARGET_UNAVAILABLE_TEXT,
    };
  }

  if (input.namesLoading && !tentLabel && !plantLabel) {
    return {
      kind: "loading",
      tentId,
      plantId,
      tentLabel: null,
      plantLabel: null,
      text: ALERT_TARGET_LOADING_TEXT,
    };
  }

  const parts: string[] = [];
  if (tentId) parts.push(fieldLabel("Tent", tentLabel));
  if (plantId) parts.push(fieldLabel("Plant", plantLabel));
  const anyNamed = Boolean(tentLabel || plantLabel);

  return {
    kind: anyNamed ? "located" : "names_unavailable",
    tentId,
    plantId,
    tentLabel,
    plantLabel,
    text: parts.join(" · "),
  };
}
