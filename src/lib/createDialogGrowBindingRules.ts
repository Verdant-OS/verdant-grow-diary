import { GROW_SETUP_START_ROOM_HREF, growSetup } from "@/constants/growSetupMessages";

export const START_YOUR_ROOM_HREF = GROW_SETUP_START_ROOM_HREF;

export interface CreateGrowOption {
  id?: string | null;
  name?: string | null;
}

export interface ResolvedTargetGrow {
  id: string;
  name: string;
}

export interface ResolveTargetGrowInput {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows?: ReadonlyArray<CreateGrowOption | null | undefined> | null;
}

export type HardStopKind = "loading" | "zero_grow" | "choose_setup" | "ok";

export interface HardStopView {
  kind: HardStopKind;
  blockSubmit: boolean;
  showLoading: boolean;
  showStartRoomHardStop: boolean;
  showPickSetupHint: boolean;
  startRoomHref: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  ariaLabel: string;
  setupName: string | null;
}

export type TentGrowCompatibility =
  { ok: true } | { ok: false; reason: "missing_target" | "missing_setup" | "different_setup" };

export interface TentGrowRef {
  grow_id?: string | null;
  growId?: string | null;
}

const MAX_SETUP_NAME_LENGTH = 80;
const OPAQUE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_HEX_RE = /^[0-9a-f]{32}$/i;

function nonBlank(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeOpaqueId(value: string): boolean {
  return OPAQUE_UUID_RE.test(value) || OPAQUE_HEX_RE.test(value);
}

export function formatSetupDisplayName(rawName: string | null | undefined): string {
  const trimmed = nonBlank(rawName);
  if (!trimmed || looksLikeOpaqueId(trimmed)) {
    return growSetup.create.fallbackName;
  }
  if (trimmed.length <= MAX_SETUP_NAME_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_SETUP_NAME_LENGTH - 1)}…`;
}

/**
 * pageDefaultGrowId wins when it matches a loaded grow; otherwise activeGrowId;
 * otherwise null. Never returns an opaque id as the display name.
 */
export function resolveTargetGrow(input: ResolveTargetGrowInput): ResolvedTargetGrow | null {
  const grows = input.grows ?? [];
  const candidates = [nonBlank(input.pageDefaultGrowId), nonBlank(input.activeGrowId)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const grow = grows.find((row) => nonBlank(row?.id) === candidate);
    const id = nonBlank(grow?.id);
    if (!id) continue;
    return {
      id,
      name: formatSetupDisplayName(grow?.name),
    };
  }

  return null;
}

export function buildHardStopView(input: {
  targetGrow: ResolvedTargetGrow | null;
  growCount: number;
  growsLoading: boolean;
}): HardStopView {
  const growCount = Number.isFinite(input.growCount) ? Math.max(0, Math.floor(input.growCount)) : 0;

  if (input.growsLoading) {
    return {
      kind: "loading",
      blockSubmit: true,
      showLoading: true,
      showStartRoomHardStop: false,
      showPickSetupHint: false,
      startRoomHref: START_YOUR_ROOM_HREF,
      title: growSetup.create.loadingTitle,
      body: growSetup.create.loadingBody,
      primaryLabel: "",
      secondaryLabel: growSetup.noSetup.ctaDismiss,
      ariaLabel: growSetup.create.loadingAriaLabel,
      setupName: null,
    };
  }

  if (growCount === 0) {
    return {
      kind: "zero_grow",
      blockSubmit: true,
      showLoading: false,
      showStartRoomHardStop: true,
      showPickSetupHint: false,
      startRoomHref: START_YOUR_ROOM_HREF,
      title: growSetup.noSetup.title,
      body: growSetup.noSetup.body,
      primaryLabel: growSetup.noSetup.ctaStart,
      secondaryLabel: growSetup.noSetup.ctaDismiss,
      ariaLabel: growSetup.noSetup.bannerAriaLabel,
      setupName: null,
    };
  }

  if (!input.targetGrow) {
    return {
      kind: "choose_setup",
      blockSubmit: true,
      showLoading: false,
      showStartRoomHardStop: false,
      showPickSetupHint: true,
      startRoomHref: START_YOUR_ROOM_HREF,
      title: growSetup.create.chooseTitle,
      body: growSetup.create.chooseBody,
      primaryLabel: growSetup.noSetup.ctaStart,
      secondaryLabel: growSetup.noSetup.ctaDismiss,
      ariaLabel: growSetup.create.chooseAriaLabel,
      setupName: null,
    };
  }

  return {
    kind: "ok",
    blockSubmit: false,
    showLoading: false,
    showStartRoomHardStop: false,
    showPickSetupHint: false,
    startRoomHref: START_YOUR_ROOM_HREF,
    title: "",
    body: "",
    primaryLabel: "",
    secondaryLabel: "",
    ariaLabel: "",
    setupName: input.targetGrow.name,
  };
}

/**
 * Never combine a known target grow with a tent whose grow is null or different.
 */
export function checkTentGrowCompatibility(input: {
  targetGrowId: string | null | undefined;
  tent: TentGrowRef | null | undefined;
}): TentGrowCompatibility {
  const target = nonBlank(input.targetGrowId);
  if (!target) return { ok: false, reason: "missing_target" };

  const tentGrow = nonBlank(input.tent?.grow_id) ?? nonBlank(input.tent?.growId);
  if (!tentGrow) return { ok: false, reason: "missing_setup" };
  if (tentGrow !== target) return { ok: false, reason: "different_setup" };

  return { ok: true };
}
