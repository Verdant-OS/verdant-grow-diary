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

export const START_YOUR_ROOM_HREF = GROW_SETUP_START_ROOM_HREF;
export const FINISH_SETUP_HREF = "/grow-lineage" as const;

export type CreateBindingEntity = "tent" | "plant";

export interface GrowListItem {
  id: string;
  name?: string | null;
}

export interface ResolvedTargetGrow {
  id: string;
  name: string;
}

const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function formatSetupDisplayName(rawName: string | null | undefined): string {
  const name = rawName?.trim();
  if (!name) return "Current setup";
  if (UUID_LIKE_RE.test(name)) return "Current setup";
  return name.length > 80 ? `${name.slice(0, 77)}…` : name;
}

export function resolveSetupName(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): string | null {
  const id = trimId(growId);
  if (!id) return null;
  const hit = grows.find((g) => g.id === id);
  const name = hit?.name?.trim();
  if (!name) return null;
  return formatSetupDisplayName(name);
}

/**
 * Spec resolver: page default when known, else active grow — returns id + display name.
 */
export function resolveTargetGrow(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows?: ReadonlyArray<GrowListItem | null | undefined> | null;
}): ResolvedTargetGrow | null {
  const grows = (input.grows ?? []).filter((g): g is GrowListItem => !!g?.id);
  const page = trimId(input.pageDefaultGrowId);
  if (page && isKnownGrowId(page, grows)) {
    const hit = grows.find((g) => g.id === page);
    return { id: page, name: formatSetupDisplayName(hit?.name) };
  }
  const active = trimId(input.activeGrowId);
  if (active && isKnownGrowId(active, grows)) {
    const hit = grows.find((g) => g.id === active);
    return { id: active, name: formatSetupDisplayName(hit?.name) };
  }
  return null;
}

/**
 * Precedence: page/URL default, then active grow — only if present in loaded grows.
 */
export function resolveCreateTargetGrowId(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
}): string | null {
  return resolveTargetGrow(input)?.id ?? null;
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
}

export function buildCreateGrowBindingHardStop(
  input: {
    targetGrowId: string | null | undefined;
    growCount: number;
    growsLoading?: boolean;
  },
  entity: CreateBindingEntity,
): CreateGrowBindingHardStopView {
  const growCount =
    typeof input.growCount === "number" && Number.isFinite(input.growCount)
      ? Math.max(0, Math.floor(input.growCount))
      : 0;
  const hasTarget = !!trimId(input.targetGrowId);
  const loading = !!input.growsLoading && growCount === 0;

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
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
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
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
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
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
    };
  }

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
    hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
  };
}

export interface HardStopView {
  blockSubmit: boolean;
  showLoading: boolean;
  showStartRoomHardStop: boolean;
  showPickSetupHint: boolean;
  startRoomHref: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  setupName: string | null;
}

/** Spec view-model builder — never surfaces opaque ids as display names. */
export function buildHardStopView(input: {
  targetGrow: ResolvedTargetGrow | null;
  growCount: number;
  growsLoading: boolean;
}): HardStopView {
  const entity: CreateBindingEntity = "plant";
  const legacy = buildCreateGrowBindingHardStop(
    { targetGrowId: input.targetGrow?.id ?? null, growCount: input.growCount, growsLoading: input.growsLoading },
    entity,
  );
  return {
    blockSubmit: legacy.blockSubmit,
    showLoading: legacy.showLoading,
    showStartRoomHardStop: legacy.showStartRoomHardStop,
    showPickSetupHint: legacy.showPickGrowHint,
    startRoomHref: legacy.startRoomHref,
    title: legacy.showLoading
      ? growSetup.create.loadingTitle
      : legacy.showStartRoomHardStop
        ? growSetup.noSetup.title
        : legacy.showPickGrowHint
          ? growSetup.create.chooseTitle
          : "",
    body: legacy.showLoading
      ? growSetup.create.loadingBody
      : legacy.showStartRoomHardStop
        ? growSetup.noSetup.body
        : legacy.showPickGrowHint
          ? growSetup.create.chooseBody
          : "",
    primaryLabel: legacy.showStartRoomHardStop || legacy.showPickGrowHint ? growSetup.noSetup.ctaStart : "",
    secondaryLabel: growSetup.noSetup.ctaDismiss,
    setupName: input.targetGrow?.name ?? null,
  };
}

export type TentGrowCompatibility =
  | { ok: true }
  | { ok: false; reason: "missing_target" | "missing_setup" | "different_setup" };

/** Spec tent/grow guard for default tent + target grow pairing. */
export function checkTentGrowCompatibility(input: {
  targetGrowId: string | null | undefined;
  tent: { grow_id?: string | null } | null | undefined;
}): TentGrowCompatibility {
  const result = evaluateTentGrowCompatibility({
    selectedTentId: input.tent ? "selected" : "none",
    tentGrowId: input.tent?.grow_id ?? null,
    targetGrowId: input.targetGrowId,
  });
  if (result.compatible) return { ok: true };
  if (result.kind === "missing_target") return { ok: false, reason: "missing_target" };
  if (result.kind === "orphan_tent") return { ok: false, reason: "missing_setup" };
  return { ok: false, reason: "different_setup" };
}

/** True only when a non-empty grow id is ready for payload.grow_id. */
export function canWriteCreateGrowId(targetGrowId: string | null | undefined): boolean {
  return !!trimId(targetGrowId);
}

export type TentCompatibilityKind = "ok" | "missing_target" | "orphan_tent" | "mismatch";

export interface TentCompatibilityResult {
  kind: TentCompatibilityKind;
  compatible: boolean;
  title: string;
  body: string;
  /** When true, clear tent selection and block submit. */
  clearTentSelection: boolean;
}

/**
 * Selected tent must match target setup when a tent is chosen.
 * "none" / empty tent is compatible for generic plant create (unless requireTent elsewhere).
 */
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
    };
  }

  const tentGrow = trimId(input.tentGrowId);
  if (!tentGrow) {
    return {
      kind: "orphan_tent",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      clearTentSelection: true,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "mismatch",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      clearTentSelection: true,
    };
  }

  return {
    kind: "ok",
    compatible: true,
    title: "",
    body: "",
    clearTentSelection: false,
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
