/**
 * createDialogGrowBindingRules — pure fail-closed contract for create tent/plant.
 *
 * States: loading | read_error | no_setup | requested_setup_unavailable |
 * choose_setup | ready.
 *
 * Explicit requested setup that cannot be verified NEVER falls back to active.
 * Any grow-list load or refresh blocks writes, even when cached rows exist.
 * Supplied tent + loading/error/conflict NEVER degrades into a tentless write.
 *
 * Pure: no React, no Supabase.
 */
import {
  GROW_SETUP_CHOOSE_SETUP_HREF,
  GROW_SETUP_FINISH_SETUP_HREF,
  GROW_SETUP_GENERIC_NAME,
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
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

const UUID_LIKE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function exactlyOneById<T extends { id: string }>(id: string, rows: readonly T[]): T | null {
  const matches = rows.filter((row) => trimId(row.id) === id);
  return matches.length === 1 ? matches[0] : null;
}

export function isKnownGrowId(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): boolean {
  const id = trimId(growId);
  if (!id) return false;
  return exactlyOneById(id, grows) !== null;
}

export interface ResolveCreateTargetGrowResult {
  targetGrowId: string | null;
  requestedSetupUnavailable: boolean;
  explicitRequest: boolean;
}

/**
 * Resolve write target:
 * - loading/error → unresolved; cached rows are not write-authoritative
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
  const hit = exactlyOneById(id, grows);
  if (!hit) return null;
  const name = hit?.name?.trim();
  if (!name || name === id || UUID_LIKE.test(name)) return GROW_SETUP_GENERIC_NAME;
  return name;
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
  chooseSetupHref: string;
  chooseSetupLabel: string;
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
    chooseSetupHref: GROW_SETUP_CHOOSE_SETUP_HREF,
    chooseSetupLabel: GROW_SETUP_MESSAGES.chooseSetupCta,
    primaryCta: GROW_SETUP_MESSAGES.hardStopCta,
    secondaryCta: GROW_SETUP_MESSAGES.hardStopSecondary,
    retryLabel: GROW_SETUP_MESSAGES.readErrorRetry,
  };

  // An active initial load or retry is the current truth, even when a prior
  // settled read error is still present in provider state during revalidation.
  if (input.growsLoading) {
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

  if (growCount === 0) {
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

export type SuppliedTentKind = "none" | "pending" | "unavailable" | "orphan" | "mismatch" | "ready";

export interface SuppliedTentView {
  kind: SuppliedTentKind;
  tentId: string | null;
  blockSubmit: boolean;
  requireCompatibleTentSelection: boolean;
  /**
   * When true, an explicit grower pick of a different tent that matches the
   * target setup may clear the supplied-tent submit block.
   * Read errors stay false — Retry only, never write on stale/error tent data.
   */
  allowCompatibleReplacement: boolean;
  title: string;
  body: string;
  showRetry: boolean;
  /** Present for orphan/mismatch — Finish setup → /grow-lineage. */
  finishSetupHref: string | null;
  finishSetupLabel: string;
}

const SUPPLIED_TENT_NONE: SuppliedTentView = {
  kind: "none",
  tentId: null,
  blockSubmit: false,
  requireCompatibleTentSelection: false,
  allowCompatibleReplacement: false,
  title: "",
  body: "",
  showRetry: false,
  finishSetupHref: null,
  finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
};

/**
 * Contract for a tent supplied by the page (e.g. TentDetail "Add plant to this tent").
 * Never degrades a supplied tent into an unrestricted tentless create.
 */
export function evaluateSuppliedTentBinding(input: {
  suppliedTentId?: string | null;
  tentsLoading?: boolean;
  /** Background refetch must stay pending — cached rows are not yet revalidated. */
  tentsFetching?: boolean;
  tentsError?: boolean;
  suppliedTentRow?: { id: string; grow_id?: string | null } | null;
  targetGrowId?: string | null;
  tentsLoaded?: boolean;
}): SuppliedTentView {
  const supplied = trimId(input.suppliedTentId);
  if (!supplied) {
    return SUPPLIED_TENT_NONE;
  }

  if (input.tentsError) {
    return {
      kind: "unavailable",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      // Fail closed on tent read failure — Retry only, no replacement write path.
      allowCompatibleReplacement: false,
      title: GROW_SETUP_MESSAGES.tentUnavailableTitle,
      body: GROW_SETUP_MESSAGES.tentUnavailableBody,
      showRetry: true,
      finishSetupHref: null,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
    };
  }

  // Initial load OR background refetch: never treat cached rows as verified.
  if (input.tentsLoading || input.tentsFetching || !input.tentsLoaded) {
    return {
      kind: "pending",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      allowCompatibleReplacement: false,
      title: GROW_SETUP_MESSAGES.tentPendingTitle,
      body: GROW_SETUP_MESSAGES.tentPendingBody,
      showRetry: false,
      finishSetupHref: null,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
    };
  }

  const row = input.suppliedTentRow;
  if (!row || row.id !== supplied) {
    return {
      kind: "unavailable",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      // Successful load proved the supplied tent is gone — grower may pick another
      // compatible tent for this setup. Still never tentless-escape.
      allowCompatibleReplacement: true,
      title: GROW_SETUP_MESSAGES.tentUnavailableTitle,
      body: GROW_SETUP_MESSAGES.tentUnavailableBody,
      showRetry: true,
      finishSetupHref: null,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
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
      allowCompatibleReplacement: false,
      title: GROW_SETUP_MESSAGES.tentPendingTitle,
      body: GROW_SETUP_MESSAGES.tentPendingBody,
      showRetry: false,
      finishSetupHref: null,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
    };
  }

  if (!tentGrow) {
    return {
      kind: "orphan",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      allowCompatibleReplacement: true,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      showRetry: false,
      finishSetupHref: GROW_SETUP_FINISH_SETUP_HREF,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "mismatch",
      tentId: supplied,
      blockSubmit: true,
      requireCompatibleTentSelection: true,
      allowCompatibleReplacement: true,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      showRetry: false,
      finishSetupHref: GROW_SETUP_FINISH_SETUP_HREF,
      finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
    };
  }

  return {
    kind: "ready",
    tentId: supplied,
    blockSubmit: false,
    requireCompatibleTentSelection: false,
    allowCompatibleReplacement: false,
    title: "",
    body: "",
    showRetry: false,
    finishSetupHref: null,
    finishSetupLabel: GROW_SETUP_MESSAGES.finishSetup,
  };
}

/**
 * Whether the supplied-tent contract still blocks submit.
 * An explicit, verified compatible replacement clears the block only when the
 * pure view allows it (orphan/mismatch/missing-after-load). A locally verified
 * nested tent may also replace a supplied tent while the remote list is still
 * pending. Tent read errors remain Retry-only and never clear through a pick.
 */
export function suppliedTentBlocksWrite(
  supplied: SuppliedTentView,
  hasVerifiedCompatibleReplacement: boolean,
  options: { replacementIsLocallyVerified?: boolean } = {},
): boolean {
  if (!supplied.blockSubmit) return false;
  if (supplied.kind === "pending") {
    return !(hasVerifiedCompatibleReplacement && options.replacementIsLocallyVerified === true);
  }
  if (
    hasVerifiedCompatibleReplacement &&
    supplied.allowCompatibleReplacement &&
    (supplied.kind === "orphan" || supplied.kind === "mismatch" || supplied.kind === "unavailable")
  ) {
    return false;
  }
  return true;
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
  tentsFetching?: boolean;
}): TentCompatibilityResult {
  const tentId = trimId(input.selectedTentId);

  if ((input.tentsLoading || input.tentsFetching) && tentId && tentId !== "none") {
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
 * Initial tent form value. Only a verified compatible tent may survive into
 * form state; presenter conflict state remains responsible for blocking an
 * unsafe supplied tent until the grower picks a compatible replacement.
 */
export function resolveInitialPlantTentId(input: {
  defaultTentId?: string | null;
  tentGrowId?: string | null;
  targetGrowId?: string | null;
  tentsLoading?: boolean;
  tentsFetching?: boolean;
  tentsError?: boolean;
  tentsLoaded?: boolean;
}): string {
  const tentId = trimId(input.defaultTentId);
  if (!tentId) return "none";

  const tentsSettled = !!input.tentsLoaded && !input.tentsLoading && !input.tentsFetching;

  const supplied = evaluateSuppliedTentBinding({
    suppliedTentId: tentId,
    tentsLoading: input.tentsLoading,
    tentsFetching: input.tentsFetching,
    tentsError: input.tentsError,
    tentsLoaded: input.tentsLoaded,
    suppliedTentRow: tentsSettled ? { id: tentId, grow_id: input.tentGrowId ?? null } : null,
    targetGrowId: input.targetGrowId,
  });

  return supplied.kind === "ready" ? tentId : "none";
}

export function plantCreateAllowsTentless(input: {
  suppliedTentId?: string | null;
  requireTent?: boolean;
}): boolean {
  if (input.requireTent) return false;
  if (trimId(input.suppliedTentId)) return false;
  return true;
}

/** Never render an opaque id as the setup display name. */
export function sanitizeSetupDisplayName(
  rawName: string | null | undefined,
  growId: string | null | undefined,
): string {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  const id = trimId(growId);
  if (!name) return growSetup.create.genericSetupLabel;
  if (id && name === id) return growSetup.create.genericSetupLabel;
  if (UUID_LIKE.test(name)) return growSetup.create.genericSetupLabel;
  if (name.length > 80) return `${name.slice(0, 77)}…`;
  return name;
}

export interface ResolvedTargetGrow {
  id: string;
  name: string;
}

/**
 * Task API: pageDefaultGrowId wins when known; otherwise activeGrowId.
 * Display name never leaks a raw UUID.
 */
export function resolveTargetGrow(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
  growsLoading?: boolean;
  growsError?: boolean;
}): ResolvedTargetGrow | null {
  const resolved = resolveCreateTargetGrowId(input);
  const id = trimId(resolved.targetGrowId);
  if (!id) return null;
  const hit = input.grows.find((g) => g.id === id);
  return { id, name: sanitizeSetupDisplayName(hit?.name, id) };
}

/** Task API wrapper around buildCreateGrowBindingView. */
export function buildHardStopView(input: {
  targetGrow: ResolvedTargetGrow | null;
  growCount: number;
  growsLoading?: boolean;
  growsError?: boolean;
  entity?: CreateBindingEntity;
}): CreateGrowBindingView {
  return buildCreateGrowBindingView(
    {
      pageDefaultGrowId: input.targetGrow?.id ?? null,
      activeGrowId: null,
      grows: input.targetGrow
        ? [{ id: input.targetGrow.id, name: input.targetGrow.name }]
        : Array.from({ length: Math.max(0, input.growCount) }, (_, i) => ({
            id: `grow-placeholder-${i}`,
            name: `Setup ${i + 1}`,
          })),
      growsLoading: input.growsLoading,
      growsError: input.growsError,
    },
    input.entity ?? "tent",
  );
}

export type TentGrowCompatibilityCheck =
  | { ok: true }
  | { ok: false; reason: "missing_target" | "missing_setup" | "different_setup" };

/**
 * Task API: tent must share the resolved target grow.
 * Null tent grow + known target → missing_setup; mismatched → different_setup.
 */
export function checkTentGrowCompatibility(input: {
  targetGrowId: string | null | undefined;
  tent:
    | {
        id?: string | null;
        grow_id?: string | null;
        growId?: string | null;
      }
    | null
    | undefined;
}): TentGrowCompatibilityCheck {
  const tentId = trimId(input.tent?.id);
  if (!tentId) return { ok: true };
  const tentGrow = trimId(input.tent?.grow_id) ?? trimId(input.tent?.growId);
  const result = evaluateTentGrowCompatibility({
    selectedTentId: tentId,
    tentGrowId: tentGrow,
    targetGrowId: input.targetGrowId,
  });
  if (result.compatible) return { ok: true };
  if (result.kind === "missing_target") return { ok: false, reason: "missing_target" };
  if (result.kind === "orphan_tent") return { ok: false, reason: "missing_setup" };
  if (result.kind === "mismatch") return { ok: false, reason: "different_setup" };
  return { ok: false, reason: "missing_target" };
}