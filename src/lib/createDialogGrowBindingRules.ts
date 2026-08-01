/**
 * createDialogGrowBindingRules — pure resolver for create tent/plant grow binding.
 *
 * Fail closed when no resolvable setup; never optional-omit grow_id on write.
 * Hard-stop CTA uses one-tent activation on /grows (not a new route).
 *
 * Pure: no React, no Supabase.
 */
import {
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
} from "@/constants/growSetupMessages";

export type CreateBindingEntity = "tent" | "plant";

export interface GrowListItem {
  id: string;
  name?: string | null;
}

export interface ResolvedTargetGrow {
  id: string;
  name: string;
}

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function looksLikeOpaqueId(value: string | null | undefined): boolean {
  const trimmed = trimId(value);
  if (!trimmed) return false;
  return UUID_LIKE_RE.test(trimmed);
}

/**
 * Grower-facing setup label — never an opaque id string.
 */
export function formatDisplaySetupName(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): string {
  const raw = resolveSetupName(growId, grows);
  if (!raw) return growSetup.create.genericSetupLabel;
  if (looksLikeOpaqueId(raw)) return growSetup.create.genericSetupLabel;
  return raw;
}

/**
 * Precedence: page/URL default, then active grow — only if present in loaded grows.
 */
export function resolveCreateTargetGrowId(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
}): string | null {
  const page = trimId(input.pageDefaultGrowId);
  if (page && isKnownGrowId(page, input.grows)) return page;
  const active = trimId(input.activeGrowId);
  if (active && isKnownGrowId(active, input.grows)) return active;
  return null;
}

/** Task-spec alias: returns id + display-safe name. */
export function resolveTargetGrow(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
}): ResolvedTargetGrow | null {
  const id = resolveCreateTargetGrowId(input);
  if (!id) return null;
  return {
    id,
    name: formatDisplaySetupName(id, input.grows),
  };
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

export interface CreateGrowBindingHardStopView {
  blockSubmit: boolean;
  showStartRoomHardStop: boolean;
  showPickGrowHint: boolean;
  showLoading: boolean;
  toastMessage: string | null;
  startRoomHref: string;
  hardStopTitle: string;
  hardStopBody: string;
  hardStopCta: string;
  hardStopSecondary: string;
  /** Accessibility label for the hard-stop banner (never a raw id). */
  hardStopAriaLabel: string;
}

export function buildCreateGrowBindingHardStop(
  input: {
    targetGrowId: string | null | undefined;
    growCount: number;
    growsLoading?: boolean;
    grows?: readonly GrowListItem[];
  },
  entity: CreateBindingEntity,
): CreateGrowBindingHardStopView {
  const growCount =
    typeof input.growCount === "number" && Number.isFinite(input.growCount)
      ? Math.max(0, Math.floor(input.growCount))
      : 0;
  const hasTarget = !!trimId(input.targetGrowId);
  const loading = !!input.growsLoading && growCount === 0;
  const grows = input.grows ?? [];

  const baseSecondary = GROW_SETUP_MESSAGES.hardStopSecondary;

  if (loading) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: true,
      toastMessage: GROW_SETUP_MESSAGES.loadingToast,
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: baseSecondary,
      hardStopAriaLabel: "Loading your setups",
    };
  }

  if (growCount === 0) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: true,
      showPickGrowHint: false,
      showLoading: false,
      toastMessage: GROW_SETUP_MESSAGES.hardStopTitle,
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: GROW_SETUP_MESSAGES.hardStopTitle,
      hardStopBody: GROW_SETUP_MESSAGES.hardStopBody,
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: baseSecondary,
      hardStopAriaLabel: GROW_SETUP_MESSAGES.hardStopTitle,
    };
  }

  if (!hasTarget) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: true,
      showLoading: false,
      toastMessage: GROW_SETUP_MESSAGES.pickSetupToast(entity),
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: baseSecondary,
      hardStopAriaLabel: GROW_SETUP_MESSAGES.pickSetupToast(entity),
    };
  }

  const setupLabel = formatDisplaySetupName(input.targetGrowId, grows);
  return {
    blockSubmit: false,
    showStartRoomHardStop: false,
    showPickGrowHint: false,
    showLoading: false,
    toastMessage: null,
    startRoomHref: GROW_SETUP_START_ROOM_HREF,
    hardStopTitle: "",
    hardStopBody: "",
    hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
    hardStopSecondary: baseSecondary,
    hardStopAriaLabel: GROW_SETUP_MESSAGES.addingTo(setupLabel),
  };
}

/** Task-spec alias. */
export function buildHardStopView(
  input: {
    targetGrow: ResolvedTargetGrow | null;
    growCount: number;
    growsLoading?: boolean;
    grows?: readonly GrowListItem[];
  },
  entity: CreateBindingEntity,
): CreateGrowBindingHardStopView {
  return buildCreateGrowBindingHardStop(
    {
      targetGrowId: input.targetGrow?.id ?? null,
      growCount: input.growCount,
      growsLoading: input.growsLoading,
      grows: input.grows,
    },
    entity,
  );
}

/** True only when a non-empty grow id is ready for payload.grow_id. */
export function canWriteCreateGrowId(targetGrowId: string | null | undefined): boolean {
  return !!trimId(targetGrowId);
}

export type TentCompatibilityKind = "ok" | "missing_target" | "missing_setup" | "different_setup";

export interface TentCompatibilityResult {
  kind: TentCompatibilityKind;
  compatible: boolean;
  title: string;
  body: string;
  /** When true, clear tent selection and block submit. */
  clearTentSelection: boolean;
  showFinishSetupCta: boolean;
}

export type TentGrowCompatibilityInput = {
  targetGrowId: string | null | undefined;
  tent?: { grow_id?: string | null } | null;
};

/** Task-spec name: tent object with grow_id. */
export function checkTentGrowCompatibility(
  input: TentGrowCompatibilityInput,
): TentCompatibilityResult {
  if (!input.tent) {
    return evaluateTentGrowCompatibility({
      selectedTentId: "none",
      tentGrowId: null,
      targetGrowId: input.targetGrowId,
    });
  }
  return evaluateTentGrowCompatibility({
    selectedTentId: "selected-tent",
    tentGrowId: input.tent.grow_id,
    targetGrowId: input.targetGrowId,
  });
}

export function evaluateTentGrowCompatibility(input: {
  selectedTentId: string | null | undefined;
  tentGrowId: string | null | undefined;
  targetGrowId: string | null | undefined;
}): TentCompatibilityResult {
  const tentId = trimId(input.selectedTentId);
  if (!tentId || tentId === "none") {
    return {
      kind: "ok",
      compatible: true,
      title: "",
      body: "",
      clearTentSelection: false,
      showFinishSetupCta: false,
    };
  }

  const target = trimId(input.targetGrowId);
  if (!target) {
    return {
      kind: "missing_target",
      compatible: false,
      title: GROW_SETUP_MESSAGES.hardStopTitle,
      body: GROW_SETUP_MESSAGES.hardStopBody,
      clearTentSelection: true,
      showFinishSetupCta: false,
    };
  }

  const tentGrow = trimId(input.tentGrowId);
  if (!tentGrow) {
    return {
      kind: "missing_setup",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      clearTentSelection: true,
      showFinishSetupCta: true,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "different_setup",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      clearTentSelection: true,
      showFinishSetupCta: true,
    };
  }

  return {
    kind: "ok",
    compatible: true,
    title: "",
    body: "",
    clearTentSelection: false,
    showFinishSetupCta: false,
  };
}

/** Initial tent_id for plant form: drop incompatible defaultTentId. */
export function resolveInitialPlantTentId(input: {
  defaultTentId?: string | null;
  tentGrowId?: string | null;
  targetGrowId?: string | null;
}): string {
  const tentId = trimId(input.defaultTentId);
  if (!tentId) return "none";
  const compat = evaluateTentGrowCompatibility({
    selectedTentId: tentId,
    tentGrowId: input.tentGrowId,
    targetGrowId: input.targetGrowId,
  });
  return compat.compatible ? tentId : "none";
}

/** When defaultTentId is supplied, block if that tent does not match target setup. */
export function evaluateDefaultTentBinding(input: {
  defaultTentId?: string | null;
  tentGrowId?: string | null;
  targetGrowId?: string | null;
}): TentCompatibilityResult {
  const tentId = trimId(input.defaultTentId);
  if (!tentId) {
    return {
      kind: "ok",
      compatible: true,
      title: "",
      body: "",
      clearTentSelection: false,
      showFinishSetupCta: false,
    };
  }
  return evaluateTentGrowCompatibility({
    selectedTentId: tentId,
    tentGrowId: input.tentGrowId,
    targetGrowId: input.targetGrowId,
  });
}
