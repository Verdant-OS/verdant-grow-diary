/**
 * quickLogTargetPanelViewModel — pure view-model for the Quick Log
 * target panel.
 *
 * Purpose: when a grower opens Quick Log, they need to know exactly
 * WHAT record the log will attach to. Historically the target selector
 * flattened plant/grow/strain context into one string (e.g. "Plant ·
 * Bruce Banner"). This module derives four DISTINCT fields —
 * Grow, Tent, Plant, Strain — so the presenter can render them as
 * separate labeled rows.
 *
 * Hard rules:
 *   - Pure. No React, no Supabase, no I/O, no time, no randomness.
 *   - Never invents context. Missing tent → explicit "No tent assigned".
 *   - Never leaks strain into the plant field or vice versa.
 *   - Never leaks grow name into the plant field.
 *   - Whitespace-only / empty values are treated as missing.
 *   - Selection changes drive the panel, but this module does NOT
 *     mutate selection or save state.
 */
import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";

export interface QuickLogTargetPanelPlant {
  id: string;
  name: string;
  strain?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}
export interface QuickLogTargetPanelTent {
  id: string;
  name: string;
  grow_id?: string | null;
}
export interface QuickLogTargetPanelGrow {
  id: string;
  name?: string | null;
}

export interface QuickLogTargetPanelInput {
  resolved: ResolvedQuickLogV2Target | null | undefined;
  plants: readonly QuickLogTargetPanelPlant[];
  tents: readonly QuickLogTargetPanelTent[];
  grows: readonly QuickLogTargetPanelGrow[];
}

export type QuickLogTargetPanelLabel = "Grow" | "Tent" | "Plant" | "Strain";
export type QuickLogTargetPanelEmphasis = "value" | "muted" | "warning";

export interface QuickLogTargetPanelField {
  label: QuickLogTargetPanelLabel;
  value: string;
  /** True when the field carries a real record value (not a placeholder). */
  present: boolean;
  emphasis: QuickLogTargetPanelEmphasis;
  /** Stable dom id fragment for the presenter. */
  testId: string;
}

export interface QuickLogTargetPanel {
  visible: boolean;
  scope: "plant" | "tent" | "none";
  fields: QuickLogTargetPanelField[];
}

export const QUICK_LOG_TARGET_NO_TENT_LABEL = "No tent assigned" as const;
export const QUICK_LOG_TARGET_NO_STRAIN_LABEL = "No strain recorded" as const;
export const QUICK_LOG_TARGET_NO_GROW_LABEL = "No grow linked" as const;
export const QUICK_LOG_TARGET_WHOLE_TENT_LABEL = "Whole tent" as const;
export const QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL = "—" as const;

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const HIDDEN: QuickLogTargetPanel = { visible: false, scope: "none", fields: [] };

/**
 * Build the target panel view-model. Never throws. When the selected
 * target is unresolved or missing, returns a hidden panel so the
 * presenter can simply short-circuit.
 */
export function buildQuickLogTargetPanel(
  input: QuickLogTargetPanelInput,
): QuickLogTargetPanel {
  const resolved = input.resolved;
  if (!resolved || !resolved.ok || !resolved.targetType) return HIDDEN;

  const plants = input.plants ?? [];
  const tents = input.tents ?? [];
  const grows = input.grows ?? [];

  if (resolved.targetType === "plant") {
    const plant = plants.find((p) => p?.id === resolved.plantId) ?? null;
    const plantName = trimOrNull(plant?.name);
    const strainRaw = trimOrNull(plant?.strain ?? null);
    // Never let strain sneak in as the plant name. If strain equals
    // the plant name we still surface it in the Strain row, but the
    // plant row keeps the plant name — the presenter shows both,
    // clearly labeled.
    const tentId = resolved.tentId ?? plant?.tent_id ?? null;
    const tent = tentId ? tents.find((t) => t?.id === tentId) ?? null : null;
    const tentName = trimOrNull(tent?.name);
    const growId = resolved.growId ?? plant?.grow_id ?? tent?.grow_id ?? null;
    const grow = growId ? grows.find((g) => g?.id === growId) ?? null : null;
    const growName = trimOrNull(grow?.name ?? null);

    return {
      visible: true,
      scope: "plant",
      fields: [
        growField(growName),
        tentField(tentName, /* whole */ false),
        plantField(plantName ?? "Unnamed plant", true),
        strainField(strainRaw),
      ],
    };
  }

  // tent scope
  const tent = tents.find((t) => t?.id === resolved.targetId) ?? null;
  const tentName = trimOrNull(tent?.name) ?? "Unnamed tent";
  const growId = resolved.growId ?? tent?.grow_id ?? null;
  const grow = growId ? grows.find((g) => g?.id === growId) ?? null : null;
  const growName = trimOrNull(grow?.name ?? null);

  return {
    visible: true,
    scope: "tent",
    fields: [
      growField(growName),
      { label: "Tent", value: tentName, present: true, emphasis: "value", testId: "tent" },
      {
        label: "Plant",
        value: QUICK_LOG_TARGET_WHOLE_TENT_LABEL,
        present: false,
        emphasis: "muted",
        testId: "plant",
      },
      {
        label: "Strain",
        value: QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL,
        present: false,
        emphasis: "muted",
        testId: "strain",
      },
    ],
  };
}

function growField(name: string | null): QuickLogTargetPanelField {
  if (name) {
    return { label: "Grow", value: name, present: true, emphasis: "value", testId: "grow" };
  }
  return {
    label: "Grow",
    value: QUICK_LOG_TARGET_NO_GROW_LABEL,
    present: false,
    emphasis: "muted",
    testId: "grow",
  };
}

function tentField(name: string | null, whole: boolean): QuickLogTargetPanelField {
  if (name) {
    return { label: "Tent", value: name, present: true, emphasis: "value", testId: "tent" };
  }
  if (whole) {
    return {
      label: "Tent",
      value: QUICK_LOG_TARGET_WHOLE_TENT_LABEL,
      present: true,
      emphasis: "value",
      testId: "tent",
    };
  }
  return {
    label: "Tent",
    value: QUICK_LOG_TARGET_NO_TENT_LABEL,
    present: false,
    emphasis: "warning",
    testId: "tent",
  };
}

function plantField(name: string, present: boolean): QuickLogTargetPanelField {
  return { label: "Plant", value: name, present, emphasis: "value", testId: "plant" };
}

function strainField(strain: string | null): QuickLogTargetPanelField {
  if (strain) {
    return { label: "Strain", value: strain, present: true, emphasis: "value", testId: "strain" };
  }
  return {
    label: "Strain",
    value: QUICK_LOG_TARGET_NO_STRAIN_LABEL,
    present: false,
    emphasis: "muted",
    testId: "strain",
  };
}
