/**
 * createGrowBindingRules — pure resolution rules that bind tent/plant
 * creation to a verified current setup (grow) or fail closed.
 *
 * The canonical create dialogs must never build an insert payload from an
 * unverified grow context. This module decides, deterministically and from
 * caller-supplied RLS-loaded rows only, which of the mutually exclusive
 * binding states applies. It never picks a fallback grow, never infers a
 * tent's grow, and never rewrites anything.
 *
 * Ownership note: matching an id against the RLS-loaded grow list is a
 * client-side UX check. Server-side RLS remains the final ownership
 * boundary; this module does not claim to prove ownership by itself.
 *
 * Pure: no React, no Supabase, no browser globals, no side effects.
 */

/** Existing guided activation route. Reused, never duplicated. */
export const START_YOUR_ROOM_HREF = "/grows?intent=one_tent_activation";

/** Where a grower picks (or creates) a setup when none can be verified. */
export const CHOOSE_SETUP_HREF = "/grows";

/**
 * Presenter-safe fallback when a grow row has a blank/missing name.
 * Internal ids must never render as setup names.
 */
export const GENERIC_SETUP_NAME = "your current setup";

export interface CreateGrowOption {
  id?: string | null;
  name?: string | null;
}

export type CreateGrowBindingState =
  | { kind: "loading" }
  | { kind: "read_error" }
  | { kind: "no_setup"; startHref: string }
  | { kind: "requested_setup_unavailable"; chooseHref: string }
  | { kind: "choose_setup"; chooseHref: string }
  | {
      kind: "ready";
      growId: string;
      setupName: string;
      source: "requested" | "current";
    };

export interface ResolveCreateGrowBindingInput {
  /** RLS-loaded grows supplied by the caller (useGrows). */
  grows: ReadonlyArray<CreateGrowOption | null | undefined> | null | undefined;
  /** True while the grow list read is in flight. */
  growsLoading: boolean;
  /** Non-empty/true when the grow list read failed. */
  growsError: string | boolean | null | undefined;
  /** Explicitly requested grow (e.g. a validated URL/prop preselect). */
  requestedGrowId?: string | null;
  /** The grower's current active setup id, if any. */
  activeGrowId?: string | null;
}

function nonBlank(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function setupNameOf(grow: CreateGrowOption): string {
  return nonBlank(grow.name) ?? GENERIC_SETUP_NAME;
}

function findGrow(
  grows: ReadonlyArray<CreateGrowOption | null | undefined>,
  id: string,
): CreateGrowOption | null {
  for (const grow of grows) {
    if (grow && nonBlank(grow.id) === id) return grow;
  }
  return null;
}

/**
 * Resolve the grow binding for a create dialog. Rules apply in order:
 *
 * 1. Grow list loading            → loading
 * 2. Grow list read failed        → read_error (never presented as no setup)
 * 3. Explicit requested grow:
 *    - exact match                → ready (source "requested")
 *    - no match                   → requested_setup_unavailable
 *      (never silently falls back to the active grow)
 * 4. No explicit request:
 *    - active grow matches        → ready (source "current")
 *    - zero grows                 → no_setup
 *    - grows exist, active stale  → choose_setup
 *      (never picks the first grow as an implicit fallback)
 *
 * Deterministic: same input always returns the same output.
 */
export function resolveCreateGrowBinding(
  input: ResolveCreateGrowBindingInput,
): CreateGrowBindingState {
  if (input.growsLoading) return { kind: "loading" };
  if (typeof input.growsError === "string" ? input.growsError.trim().length > 0 : !!input.growsError) {
    return { kind: "read_error" };
  }

  const grows = (input.grows ?? []).filter(
    (grow): grow is CreateGrowOption => !!grow && nonBlank(grow.id) !== null,
  );

  const requestedGrowId = nonBlank(input.requestedGrowId);
  if (requestedGrowId) {
    const match = findGrow(grows, requestedGrowId);
    if (match) {
      return {
        kind: "ready",
        growId: requestedGrowId,
        setupName: setupNameOf(match),
        source: "requested",
      };
    }
    return { kind: "requested_setup_unavailable", chooseHref: CHOOSE_SETUP_HREF };
  }

  const activeGrowId = nonBlank(input.activeGrowId);
  if (activeGrowId) {
    const match = findGrow(grows, activeGrowId);
    if (match) {
      return {
        kind: "ready",
        growId: activeGrowId,
        setupName: setupNameOf(match),
        source: "current",
      };
    }
  }

  if (grows.length === 0) return { kind: "no_setup", startHref: START_YOUR_ROOM_HREF };
  return { kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF };
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

export interface EvaluatePlantTentBindingInput {
  /** The grow id already resolved by resolveCreateGrowBinding. */
  resolvedGrowId: string;
  /** Selected/default tent id; null/blank/"none" means no tent. */
  selectedTentId?: string | null;
  /** Guided activation requires a tent; general creation may not. */
  requireTent: boolean;
  /** RLS-loaded tents supplied by the caller. */
  tents: ReadonlyArray<CreateTentOption | null | undefined> | null | undefined;
}

/**
 * Evaluate whether a tent selection is compatible with the resolved grow.
 * Never infers a tent's grow, never rewrites a tent, never falls back to
 * another tent. Deterministic for the same input regardless of tent order
 * (ids are matched exactly, not positionally).
 */
export function evaluatePlantTentBinding(
  input: EvaluatePlantTentBindingInput,
): PlantTentBindingState {
  const selected = nonBlank(input.selectedTentId);
  if (!selected || selected === "none") {
    if (input.requireTent) return { kind: "tent_required" };
    return { kind: "no_tent", allowed: true };
  }

  const tents = (input.tents ?? []).filter(
    (tent): tent is CreateTentOption => !!tent && nonBlank(tent.id) !== null,
  );
  const tent = tents.find((t) => nonBlank(t.id) === selected) ?? null;
  if (!tent) return { kind: "tent_unavailable" };

  const tentGrowId = nonBlank(tent.grow_id);
  if (!tentGrowId) return { kind: "tent_not_in_setup" };
  if (tentGrowId !== input.resolvedGrowId) return { kind: "different_setup" };
  return { kind: "ready", tentId: selected };
}

export interface TentInsertDraft {
  name: string;
  size: string | null;
  brand: string | null;
  stage: string;
}

export interface GrowBoundTentInsertPayload {
  user_id: string;
  name: string;
  size: string | null;
  brand: string | null;
  stage: string;
  /** Always present: a tent payload without a verified grow is unconstructable here. */
  grow_id: string;
}

export type BuildTentInsertPayloadResult =
  | { ok: true; payload: GrowBoundTentInsertPayload }
  | { ok: false; reason: Exclude<CreateGrowBindingState["kind"], "ready"> };

/**
 * Build the canonical tent insert payload. Only a `ready` binding state can
 * produce a payload, and the payload's `grow_id` is always the verified
 * resolved grow id — the type makes an unbound tent payload unconstructable
 * through this path.
 */
export function buildTentInsertPayload(
  binding: CreateGrowBindingState,
  userId: string,
  draft: TentInsertDraft,
): BuildTentInsertPayloadResult {
  if (binding.kind !== "ready") return { ok: false, reason: binding.kind };
  return {
    ok: true,
    payload: {
      user_id: userId,
      name: draft.name.trim(),
      size: draft.size,
      brand: draft.brand,
      stage: draft.stage,
      grow_id: binding.growId,
    },
  };
}
