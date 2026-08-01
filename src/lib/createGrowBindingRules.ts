import {
  CHOOSE_SETUP_HREF,
  ONE_TENT_ACTIVATION_HREF,
} from "@/constants/growSetupMessages";

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
  grows: readonly CreateGrowOption[];
  growsLoading: boolean;
  growsError: string | null | undefined;
  requestedGrowId?: string | null;
  activeGrowId?: string | null;
}

export interface CreateTentOption {
  id: string;
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
  resolvedGrowId: string;
  selectedTentId?: string | null;
  requireTent: boolean;
  tents: readonly CreateTentOption[];
}

export interface TentInsertPayload {
  user_id: string;
  name: string;
  size: string | null;
  brand: string | null;
  stage: string;
  grow_id: string;
}

const GENERIC_SETUP_NAME = "your current setup";

function normalizeGrowName(name: string | null | undefined): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed : GENERIC_SETUP_NAME;
}

function findGrowById(
  grows: readonly CreateGrowOption[],
  growId: string,
): CreateGrowOption | undefined {
  return grows.find((grow) => grow.id === growId);
}

/** Resolve which verified grow context a create dialog may bind to. Pure and deterministic. */
export function resolveCreateGrowBinding(
  input: ResolveCreateGrowBindingInput,
): CreateGrowBindingState {
  const grows = input.grows ?? [];

  if (input.growsLoading) {
    return { kind: "loading" };
  }

  if (input.growsError) {
    return { kind: "read_error" };
  }

  const requestedGrowId =
    typeof input.requestedGrowId === "string" && input.requestedGrowId.trim().length > 0
      ? input.requestedGrowId.trim()
      : null;

  if (requestedGrowId) {
    const requestedGrow = findGrowById(grows, requestedGrowId);
    if (!requestedGrow?.id) {
      return { kind: "requested_setup_unavailable", chooseHref: CHOOSE_SETUP_HREF };
    }
    return {
      kind: "ready",
      growId: requestedGrow.id,
      setupName: normalizeGrowName(requestedGrow.name),
      source: "requested",
    };
  }

  const activeGrowId =
    typeof input.activeGrowId === "string" && input.activeGrowId.trim().length > 0
      ? input.activeGrowId.trim()
      : null;

  if (grows.length === 0) {
    return { kind: "no_setup", startHref: ONE_TENT_ACTIVATION_HREF };
  }

  if (!activeGrowId) {
    return { kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF };
  }

  const activeGrow = findGrowById(grows, activeGrowId);
  if (!activeGrow?.id) {
    return { kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF };
  }

  return {
    kind: "ready",
    growId: activeGrow.id,
    setupName: normalizeGrowName(activeGrow.name),
    source: "current",
  };
}

/** Evaluate whether a selected/default tent is compatible with the resolved grow. */
export function evaluatePlantTentBinding(
  input: EvaluatePlantTentBindingInput,
): PlantTentBindingState {
  const selectedTentId =
    typeof input.selectedTentId === "string" && input.selectedTentId.trim().length > 0
      ? input.selectedTentId.trim()
      : null;

  if (!selectedTentId || selectedTentId === "none") {
    return input.requireTent
      ? { kind: "tent_required" }
      : { kind: "no_tent", allowed: true };
  }

  const tent = input.tents.find((candidate) => candidate.id === selectedTentId);
  if (!tent) {
    return { kind: "tent_unavailable" };
  }

  const tentGrowId =
    typeof tent.grow_id === "string" && tent.grow_id.trim().length > 0
      ? tent.grow_id.trim()
      : null;

  if (!tentGrowId) {
    return { kind: "tent_not_in_setup" };
  }

  if (tentGrowId !== input.resolvedGrowId) {
    return { kind: "different_setup" };
  }

  return { kind: "ready", tentId: tent.id };
}

/** Build a grow-bound tent insert payload only when binding is ready. */
export function buildTentInsertPayload(
  binding: CreateGrowBindingState,
  fields: Omit<TentInsertPayload, "grow_id">,
): TentInsertPayload | null {
  if (binding.kind !== "ready") return null;
  return { ...fields, grow_id: binding.growId };
}

/** Derive the safe initial tent selection when a dialog opens. */
export function resolveInitialTentSelection(input: {
  binding: CreateGrowBindingState;
  defaultTentId?: string | null;
  requireTent: boolean;
  tents: readonly CreateTentOption[];
}): {
  tentId: string;
  conflict: PlantTentBindingState | null;
} {
  if (input.binding.kind !== "ready") {
    return { tentId: "none", conflict: null };
  }

  const evaluation = evaluatePlantTentBinding({
    resolvedGrowId: input.binding.growId,
    selectedTentId: input.defaultTentId,
    requireTent: input.requireTent,
    tents: input.tents,
  });

  if (evaluation.kind === "ready") {
    return { tentId: evaluation.tentId, conflict: null };
  }

  if (
    evaluation.kind === "different_setup" ||
    evaluation.kind === "tent_not_in_setup" ||
    evaluation.kind === "tent_unavailable"
  ) {
    return { tentId: "none", conflict: evaluation };
  }

  if (evaluation.kind === "no_tent" && evaluation.allowed) {
    return { tentId: "none", conflict: null };
  }

  return { tentId: "none", conflict: evaluation };
}

/** Whether a plant insert may proceed given grow binding and tent compatibility. */
export function canSubmitPlantCreate(input: {
  binding: CreateGrowBindingState;
  tentBinding: PlantTentBindingState;
}): boolean {
  if (input.binding.kind !== "ready") return false;
  if (input.tentBinding.kind === "ready") return true;
  if (input.tentBinding.kind === "no_tent" && input.tentBinding.allowed) return true;
  return false;
}
