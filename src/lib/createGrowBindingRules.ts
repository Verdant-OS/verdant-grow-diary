/**
 * createGrowBindingRules — pure grow/tent binding for create dialogs.
 *
 * No React, Supabase, browser globals, or side effects.
 * Callers supply RLS-loaded grows/tents; this module only resolves state.
 *
 * Client matching against RLS-loaded rows is not ownership proof —
 * server RLS remains the final boundary.
 */

import { growSetupMessages } from "@/constants/growSetupMessages";
import { ONE_TENT_ACTIVATION_INTENT } from "@/lib/connectedOneTentActivationRules";

export const CREATE_NO_SETUP_START_HREF =
  `/grows?intent=${ONE_TENT_ACTIVATION_INTENT}` as const;
export const CREATE_CHOOSE_SETUP_HREF = "/grows" as const;

export interface CreateGrowOption {
  id?: string | null;
  name?: string | null;
}

export type CreateGrowBindingState =
  | { kind: "loading" }
  | { kind: "read_error" }
  | { kind: "no_setup"; startHref: typeof CREATE_NO_SETUP_START_HREF }
  | { kind: "requested_setup_unavailable"; chooseHref: typeof CREATE_CHOOSE_SETUP_HREF }
  | { kind: "choose_setup"; chooseHref: typeof CREATE_CHOOSE_SETUP_HREF }
  | {
      kind: "ready";
      growId: string;
      setupName: string;
      source: "requested" | "current";
    };

export interface ResolveCreateGrowBindingInput {
  grows: readonly CreateGrowOption[];
  growsLoading: boolean;
  growsError: string | null | undefined;
  requestedGrowId?: string | null;
  activeGrowId?: string | null;
}

export interface CreateTentOption {
  id?: string | null;
  grow_id?: string | null;
}

export type PlantTentBindingState =
  | { kind: "no_tent"; allowed: boolean }
  | { kind: "ready"; tentId: string }
  | { kind: "tent_required" }
  | { kind: "tent_unavailable" }
  | { kind: "tent_not_in_setup" }
  | { kind: "different_setup" };

export interface ResolvePlantTentBindingInput {
  resolvedGrowId: string;
  selectedTentId: string | null | undefined;
  requireTent: boolean;
  tents: readonly CreateTentOption[];
}

export type PlantTentConflictKind =
  | "tent_unavailable"
  | "tent_not_in_setup"
  | "different_setup"
  | null;

export interface SafeInitialPlantTentSelection {
  tentId: string | null;
  conflict: PlantTentConflictKind;
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function displaySetupName(name: string | null | undefined): string {
  if (typeof name !== "string") return growSetupMessages.genericSetupName;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : growSetupMessages.genericSetupName;
}

function findGrowById(
  grows: readonly CreateGrowOption[],
  growId: string,
): CreateGrowOption | undefined {
  return grows.find((g) => normalizeId(g.id) === growId);
}

/**
 * Resolve the verified grow binding for a create dialog.
 * Order: loading → read_error → requested match/block → active match →
 * no_setup → choose_setup. Never picks the first grow as a fallback.
 */
export function resolveCreateGrowBinding(
  input: ResolveCreateGrowBindingInput,
): CreateGrowBindingState {
  if (input.growsLoading) return { kind: "loading" };
  if (input.growsError) return { kind: "read_error" };

  const grows = input.grows ?? [];
  const requested = normalizeId(input.requestedGrowId ?? null);

  if (requested) {
    const match = findGrowById(grows, requested);
    if (match) {
      return {
        kind: "ready",
        growId: requested,
        setupName: displaySetupName(match.name),
        source: "requested",
      };
    }
    return {
      kind: "requested_setup_unavailable",
      chooseHref: CREATE_CHOOSE_SETUP_HREF,
    };
  }

  const active = normalizeId(input.activeGrowId ?? null);
  if (active) {
    const match = findGrowById(grows, active);
    if (match) {
      return {
        kind: "ready",
        growId: active,
        setupName: displaySetupName(match.name),
        source: "current",
      };
    }
  }

  if (grows.length === 0) {
    return { kind: "no_setup", startHref: CREATE_NO_SETUP_START_HREF };
  }

  return { kind: "choose_setup", chooseHref: CREATE_CHOOSE_SETUP_HREF };
}

/**
 * Evaluate whether a selected tent is compatible with a resolved grow.
 * Never infers or rewrites a tent's grow binding.
 */
export function resolvePlantTentBinding(
  input: ResolvePlantTentBindingInput,
): PlantTentBindingState {
  const selected = normalizeId(input.selectedTentId ?? null);
  if (!selected || selected === "none") {
    return input.requireTent
      ? { kind: "tent_required" }
      : { kind: "no_tent", allowed: true };
  }

  const tent = input.tents.find((t) => normalizeId(t.id) === selected);
  if (!tent) return { kind: "tent_unavailable" };

  const tentGrow = normalizeId(tent.grow_id ?? null);
  if (!tentGrow) return { kind: "tent_not_in_setup" };
  if (tentGrow !== input.resolvedGrowId) return { kind: "different_setup" };

  return { kind: "ready", tentId: selected };
}

/**
 * Derive a safe initial tent selection from a defaultTentId.
 * Incompatible defaults are cleared; conflict is retained for the presenter.
 */
export function resolveSafeInitialPlantTentSelection(input: {
  resolvedGrowId: string;
  defaultTentId?: string | null;
  tents: readonly CreateTentOption[];
}): SafeInitialPlantTentSelection {
  const defaultId = normalizeId(input.defaultTentId ?? null);
  if (!defaultId) return { tentId: null, conflict: null };

  const binding = resolvePlantTentBinding({
    resolvedGrowId: input.resolvedGrowId,
    selectedTentId: defaultId,
    requireTent: false,
    tents: input.tents,
  });

  switch (binding.kind) {
    case "ready":
      return { tentId: binding.tentId, conflict: null };
    case "tent_unavailable":
      return { tentId: null, conflict: "tent_unavailable" };
    case "tent_not_in_setup":
      return { tentId: null, conflict: "tent_not_in_setup" };
    case "different_setup":
      return { tentId: null, conflict: "different_setup" };
    case "no_tent":
    case "tent_required":
      return { tentId: null, conflict: null };
    default: {
      const _exhaustive: never = binding;
      return _exhaustive;
    }
  }
}

/** Filter tents to those whose grow_id exactly matches the resolved grow. */
export function filterTentsForResolvedGrow<T extends CreateTentOption>(
  tents: readonly T[],
  resolvedGrowId: string,
): T[] {
  const growId = normalizeId(resolvedGrowId);
  if (!growId) return [];
  return tents.filter((t) => normalizeId(t.grow_id ?? null) === growId);
}

export interface GrowBoundTentInsertFields {
  user_id: string;
  name: string;
  size: string | null;
  brand: string | null;
  stage: string;
  grow_id: string;
}

/**
 * Build a tent insert payload only from a ready binding.
 * A payload without grow_id is unconstructable through this helper.
 */
export function buildGrowBoundTentInsertPayload(input: {
  binding: CreateGrowBindingState;
  userId: string;
  name: string;
  size: string;
  brand: string;
  stage: string;
}): GrowBoundTentInsertFields | null {
  if (input.binding.kind !== "ready") return null;
  const name = input.name.trim();
  if (!name) return null;
  return {
    user_id: input.userId,
    name,
    size: input.size.trim() || null,
    brand: input.brand.trim() || null,
    stage: input.stage,
    grow_id: input.binding.growId,
  };
}

/** Whether the create form may render and submit. */
export function isCreateGrowBindingReady(
  binding: CreateGrowBindingState,
): binding is Extract<CreateGrowBindingState, { kind: "ready" }> {
  return binding.kind === "ready";
}
