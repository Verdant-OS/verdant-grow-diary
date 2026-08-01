/**
 * createDialogGrowBindingRules — pure fail-closed contract for create tent/plant.
 *
 * States: loading | read_error | no_setup | requested_setup_unavailable |
 * choose_setup | ready.
 *
 * Explicit requested setup that cannot be verified NEVER falls back to active.
 * Supplied tent + loading/error/conflict NEVER degrades into a tentless write.
 *
 * Pure: no React, no Supabase.
 */
import {
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
} from "@/constants/growSetupMessages";

export type CreateBindingEntity = "tent" | "plant";

export type CreateGrowBindingKind =
  | "loading"
  | "read_error"
  | "no_setup"
  | "requested_setup_unavailable"
  | "choose_setup"
  | "ready";

export interface GrowListItem {
  id: string;
  name?: string | null;
}

function trimId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function isKnownGrowId(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): boolean {
  const id = trimId(growId);
  if (!id) return false;
  return grows.some((g) => g.id === id);
}

export interface ResolveCreateTargetGrowResult {
  targetGrowId: string | null;
  requestedSetupUnavailable: boolean;
  explicitRequest: boolean;
}

/**
 * Resolve write target:
 * - explicit pageDefaultGrowId present + known → use it
 * - explicit present + unknown after successful load → unavailable (no active fallback)
 * - no explicit → active grow if known
 */
export function resolveCreateTargetGrowId(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
  growsLoading?: boolean;
  growsError?: boolean;
}): ResolveCreateTargetGrowResult {
  const page = trimId(input.pageDefaultGrowId);
  const active = trimId(input.activeGrowId);
  const explicitRequest = !!page;

  if (input.growsLoading || input.growsError) {
    if (page && isKnownGrowId(page, input.grows)) {
      return { targetGrowId: page, requestedSetupUnavailable: false, explicitRequest };
    }
    if (!page && active && isKnownGrowId(active, input.grows)) {
      return { targetGrowId: active, requestedSetupUnavailable: false, explicitRequest };
    }
    return { targetGrowId: null, requestedSetupUnavailable: false, explicitRequest };
  }

  if (page) {
    if (isKnownGrowId(page, input.grows)) {
      return { targetGrowId: page, requestedSetupUnavailable: false, explicitRequest };
    }
    return { targetGrowId: null, requestedSetupUnavailable: true, explicitRequest };
  }

  if (active && isKnownGrowId(active, input.grows)) {
    return { targetGrowId: active, requestedSetupUnavailable: false, explicitRequest };
  }
  return { targetGrowId: null, requestedSetupUnavailable: false, explicitRequest };
}

export function resolveSetupName(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): string | null {
  const id = trimId(growId);
  if (!id) return null;
  const hit = grows.find((g) => g.id === id);
  const name = hit?.name?.trim();
  return name && name.length > 0 ? name : null;
}

export interface CreateGrowBindingView {
  kind: CreateGrowBindingKind;
  blockSubmit: boolean;
  targetGrowId: string | null;
  showStartRoomHardStop: boolean;
  showPickGrowHint: boolean;
  showLoading: boolean;
  showReadError: boolean;
  showRequestedUnavailable: boolean;
  toastMessage: string | null;
  startRoomHref: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  retryLabel: string;
}

export function buildCreateGrowBindingView(
  input: {
    pageDefaultGrowId?: string | null;
    activeGrowId?: string | null;
    grows: readonly GrowListItem[];
    growsLoading?: boolean;
    growsError?: boolean;
  },
  entity: CreateBindingEntity,
): CreateGrowBindingView {
  const growCount = input.grows.length;
  const resolved = resolveCreateTargetGrowId(input);
  const base = {
    targetGrowId: resolved.targetGrowId,
    startRoomHref: GROW_SETUP_START_ROOM_HREF,
    primaryCta: GROW_SETUP_MESSAGES.hardStopCta,
    secondaryCta: GROW_SETUP_MESSAGES.hardStopSecondary,
    retryLabel: GROW_SETUP_MESSAGES.readErrorRetry,
  };

  if (input.growsError) {
    return {
      ...base,
      kind: "read_error",
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: false,
      showReadError: true,
      showRequestedUnavailable: false,
      toastMessage: GROW_SETUP_MESSAGES.readErrorTitle,
      title: GROW_SETUP_MESSAGES.readErrorTitle,
      body: GROW_SETUP_MESSAGES.readErrorBody,
    };
  }

  if (input.growsLoading && growCount === 0) {
    return {
      ...base,
      kind: "loading",
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: true,
      showReadError: false,
      showRequestedUnavailable: false,
      toastMessage: GROW_SETUP_MESSAGES.loadingToast,
      title: GROW_SETUP_MESSAGES.loadingTitle,
      body: GROW_SETUP_MESSAGES.loadingBody,
    };
  }

  if (resolved.requestedSetupUnavailable) {
    return {
      ...base,
      kind: "requested_setup_unavailable",
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: false,
      showReadError: false,
      showRequestedUnavailable: true,
      toastMessage: GROW_SETUP_MESSAGES.requestedUnavailableTitle,
      title: GROW_SETUP_MESSAGES.requestedUnavailableTitle,
      body: GROW_SETUP_MESSAGES.requestedUnavailableBody,
    };
  }

  if (!input.growsLoading && growCount === 0) {
    return {
      ...base,
      kind: "no_setup",
      blockSubmit: true,
      showStartRoomHardStop: true,
      showPickGrowHint: false,
      showLoading: false,
      showReadError: false,
      showRequestedUnavailable: false,
      toastMessage: GROW_SETUP_MESSAGES.hardStopTitle,
      title: GROW_SETUP_MESSAGES.hardStopTitle,
      body: GROW_SETUP_MESSAGES.hardStopBody,
    };
  }

  if (!resolved.targetGrowId) {
    return {
      ...base,
      kind: "choose_setup",
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: true,
      showLoading: false,
      showReadError: false,
      showRequestedUnavailable: false,
      toastMessage: GROW_SETUP_MESSAGES.pickSetupToast(entity),
      title: "",
      body: GROW_SETUP_MESSAGES.pickSetupToast(entity),
    };
  }

  return {
    ...base,
    kind: "ready",
    blockSubmit: false,
    showStartRoomHardStop: false,
    showPickGrowHint: false,
    showLoading: false,
    showReadError: false,
    showRequestedUnavailable: false,
    toastMessage: null,
    title: "",
    body: "",
  };
}

export function canWriteCreateGrowId(targetGrowId: string | null | undefined): boolean {
  return !!trimId(targetGrowId);
}

// --- Supplied / selected tent contract ------------------------------------

export type SuppliedTentKind =
  | "none"
  | "pending"
  | "unavailable"
  | "orphan"
  | "mismatch"
  | "ready";

export interface SuppliedTentView {
  kind: SuppliedTentKind;
  tentId: string | null;
  blockSubmit: boolean;
  requireCompatibleTentSelection: boolean;
  title: string;
  body: string;
  showRetry: boolean;
}

/**
 * Contract for a tent supplied by the page (e.g. TentDetail "Add plant to this tent").
 * Never degrades a supplied tent into an unrestricted tentless create.
 */
export function evaluateSuppliedTentBinding(input: {
  suppliedTentId?: string | null;
  tentsLoading?: boolean;
  tentsError?: boolean;
  suppliedTentRow?: { id: string; grow_id?: string | null } | null;
  targetGrowId?: string | null;
  tentsLoaded?: boolean;
}): SuppliedTentView {
  const supplied = trimId(input.suppliedTentId);
  if (!supplied) {
    return {
      kind: "none",
      tentId: null,
      blockSubmit: false,
      requireCompatibleTentSelection: false,
      title: "",
      body: "",
      showRetry: false,
    };
  }

  if (input.tentsError) {
    return {
      kind: "unavailable",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentUnavailableTitle,
      body: GROW_SETUP_MESSAGES.tentUnavailableBody,
      showRetry: true,
    };
  }

  if (input.tentsLoading || !input.tentsLoaded) {
    return {
      kind: "pending",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentPendingTitle,
      body: GROW_SETUP_MESSAGES.tentPendingBody,
      showRetry: false,
    };
  }

  const row = input.suppliedTentRow;
  if (!row || row.id !== supplied) {
    return {
      kind: "unavailable",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentUnavailableTitle,
      body: GROW_SETUP_MESSAGES.tentUnavailableBody,
      showRetry: true,
    };
  }

  const target = trimId(input.targetGrowId);
  const tentGrow = trimId(row.grow_id);

  if (!target) {
    return {
      kind: "pending",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentPendingTitle,
      body: GROW_SETUP_MESSAGES.tentPendingBody,
      showRetry: false,
    };
  }

  if (!tentGrow) {
    return {
      kind: "orphan",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      showRetry: false,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "mismatch",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      showRetry: false,
    };
  }

  return {
    kind: "ready",
    tentId: supplied,
    blockSubmit: false,
    requireCompatibleTentSelection: false,
    title: "",
    body: "",
    showRetry: false,
  };
}

export type TentCompatibilityKind =
  | "ok"
  | "missing_target"
  | "orphan_tent"
  | "mismatch"
  | "pending"
  | "unavailable"
  | "required_missing";

export interface TentCompatibilityResult {
  kind: TentCompatibilityKind;
  compatible: boolean;
  title: string;
  body: string;
  /** Never true for a still-supplied tent — callers must not tentless-escape. */
  clearTentSelection: boolean;
  blockSubmit: boolean;
}

export function evaluateTentGrowCompatibility(input: {
  selectedTentId: string | null | undefined;
  tentGrowId: string | null | undefined;
  targetGrowId: string | null | undefined;
  /** When true (Add Plant to This Tent), "none" is not an allowed escape. */
  requireTentForWrite?: boolean;
  tentsLoading?: boolean;
}): TentCompatibilityResult {
  const tentId = trimId(input.selectedTentId);

  if (input.tentsLoading && tentId && tentId !== "none") {
    return {
      kind: "pending",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentPendingTitle,
      body: GROW_SETUP_MESSAGES.tentPendingBody,
      clearTentSelection: false,
      blockSubmit: true,
    };
  }

  if (!tentId || tentId === "none") {
    if (input.requireTentForWrite) {
      return {
        kind: "required_missing",
        compatible: false,
        title: GROW_SETUP_MESSAGES.tentRequiredTitle,
        body: GROW_SETUP_MESSAGES.tentRequiredBody,
        clearTentSelection: false,
        blockSubmit: true,
      };
    }
    return {
      kind: "ok",
      compatible: true,
      title: "",
      body: "",
      clearTentSelection: false,
      blockSubmit: false,
    };
  }

  const target = trimId(input.targetGrowId);
  if (!target) {
    return {
      kind: "missing_target",
      compatible: false,
      title: GROW_SETUP_MESSAGES.hardStopTitle,
      body: GROW_SETUP_MESSAGES.hardStopBody,
      clearTentSelection: false,
      blockSubmit: true,
    };
  }

  const tentGrow = trimId(input.tentGrowId);
  if (!tentGrow) {
    return {
      kind: "orphan_tent",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      clearTentSelection: false,
      blockSubmit: true,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "mismatch",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      clearTentSelection: false,
      blockSubmit: true,
    };
  }

  return {
    kind: "ok",
    compatible: true,
    title: "",
    body: "",
    clearTentSelection: false,
    blockSubmit: false,
  };
}

/**
 * Initial tent form value. Supplied tent is preserved until known-compatible;
 * never silent "none" while a supplied tent is still required.
 */
export function resolveInitialPlantTentId(input: {
  defaultTentId?: string | null;
  tentGrowId?: string | null;
  targetGrowId?: string | null;
  tentsLoading?: boolean;
  tentsError?: boolean;
  tentsLoaded?: boolean;
}): string {
  const tentId = trimId(input.defaultTentId);
  if (!tentId) return "none";

  const supplied = evaluateSuppliedTentBinding({
    suppliedTentId: tentId,
    tentsLoading: input.tentsLoading,
    tentsError: input.tentsError,
    tentsLoaded: input.tentsLoaded,
    suppliedTentRow:
      input.tentsLoaded && !input.tentsLoading
        ? { id: tentId, grow_id: input.tentGrowId ?? null }
        : null,
    targetGrowId: input.targetGrowId,
  });

  if (supplied.kind === "ready") return tentId;
  if (supplied.kind !== "none") return tentId;
  return "none";
}

export function plantCreateAllowsTentless(input: {
  suppliedTentId?: string | null;
  requireTent?: boolean;
}): boolean {
  if (input.requireTent) return false;
  if (trimId(input.suppliedTentId)) return false;
  return true;
}
