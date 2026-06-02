/**
 * QuickLog v2 — pure target/scope derivation.
 * No I/O, no JSX, deterministic.
 */

export type QuickLogV2TargetType = "tent" | "plant";
export type QuickLogV2Action = "water" | "note" | "photo";

export interface QuickLogV2TargetOption {
  type: QuickLogV2TargetType;
  id: string;
  label: string;
  tentId: string | null;
  growId: string | null;
}

export interface PlantLike {
  id: string;
  name: string;
  tent_id: string | null;
  grow_id: string | null;
  is_archived?: boolean;
}
export interface TentLike {
  id: string;
  name: string;
  grow_id: string | null;
  is_archived?: boolean;
}

export function buildQuickLogV2TargetOptions(
  tents: TentLike[],
  plants: PlantLike[],
): QuickLogV2TargetOption[] {
  const out: QuickLogV2TargetOption[] = [];
  for (const t of tents) {
    if (t?.is_archived) continue;
    if (!t?.id) continue;
    out.push({
      type: "tent",
      id: t.id,
      label: t.name || "Tent",
      tentId: t.id,
      growId: t.grow_id ?? null,
    });
  }
  for (const p of plants) {
    if (p?.is_archived) continue;
    if (!p?.id) continue;
    out.push({
      type: "plant",
      id: p.id,
      label: p.name || "Plant",
      tentId: p.tent_id ?? null,
      growId: p.grow_id ?? null,
    });
  }
  return out;
}

export interface ResolvedQuickLogV2Target {
  ok: boolean;
  reason?: string;
  targetType?: QuickLogV2TargetType;
  targetId?: string;
  tentId?: string | null;
  plantId?: string | null;
}

/**
 * Resolve the target the user actually selected. NEVER fall back to the
 * first loaded plant/tent.
 */
export function resolveQuickLogV2Target(
  options: QuickLogV2TargetOption[],
  selectedKey: string | null | undefined,
): ResolvedQuickLogV2Target {
  if (!selectedKey) return { ok: false, reason: "no_selection" };
  const match = options.find((o) => `${o.type}:${o.id}` === selectedKey);
  if (!match) return { ok: false, reason: "selection_not_found" };
  if (match.type === "plant") {
    return {
      ok: true,
      targetType: "plant",
      targetId: match.id,
      tentId: match.tentId ?? null,
      plantId: match.id,
    };
  }
  return {
    ok: true,
    targetType: "tent",
    targetId: match.id,
    tentId: match.id,
    plantId: null,
  };
}

export interface QuickLogV2FormState {
  selectedKey: string | null;
  action: QuickLogV2Action;
  volumeMl: string;
  note: string;
  temperatureC: string;
  humidityPct: string;
  vpdKpa: string;
}

export const EMPTY_QUICKLOG_V2_FORM: QuickLogV2FormState = {
  selectedKey: null,
  action: "note",
  volumeMl: "",
  note: "",
  temperatureC: "",
  humidityPct: "",
  vpdKpa: "",
};

export function shouldShowVolumeField(action: QuickLogV2Action): boolean {
  return action === "water";
}

export function isPhotoSavingSupported(): boolean {
  // Photo persistence not enabled in Gate 1 (out of atomic-RPC scope).
  return false;
}
