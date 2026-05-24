/**
 * Plant dropdown eligibility rules.
 *
 * Pure, deterministic helpers used by every plant dropdown/selector so the
 * eligibility logic lives in ONE place. Fixes the "Add Existing Plant /
 * Merge target shows 2 of 3 plants" bug where the database-level
 * `.eq("grow_id", X)` filter dropped plants whose `grow_id` is null even
 * when their `tent_id` belongs to a tent in the same grow.
 *
 * Effective grow id = plant.grow_id ?? tent.grow_id (when tent_id resolves
 * to a known tent). This mirrors `plantGrowContextRules.ts` but is kept
 * decoupled so this module stays usable by tests with simple object shapes.
 *
 * No I/O. No Supabase. No React. No writes. No service_role.
 */

export type PlantDropdownContext =
  | "quick_log"
  | "merge_target"
  | "add_existing_to_tent"
  | "move_to_tent"
  | "edit_plant_tent"
  | "logs_filter"
  | "daily_check"
  | "generic_active_plant";

export interface PlantDropdownInput {
  id: string;
  name?: string | null;
  strain?: string | null;
  /** Raw grow id from the plant row, may be null on legacy/orphan rows. */
  grow_id?: string | null;
  growId?: string | null;
  /** Tent assignment. May provide grow context when grow_id is null. */
  tent_id?: string | null;
  tentId?: string | null;
  is_archived?: boolean | null;
  isArchived?: boolean | null;
  last_note?: string | null;
  lastNote?: string | null;
  started_at?: string | null;
  startedAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export interface TentGrowRef {
  id: string;
  grow_id?: string | null;
  growId?: string | null;
}

export interface PlantDropdownContextOptions {
  context: PlantDropdownContext;
  /** Effective grow id for the surface the dropdown belongs to. */
  growId?: string | null;
  /** Tent id when the dropdown is scoped to a tent (add existing, move). */
  tentId?: string | null;
  /** Source plant id when context = "merge_target". Excluded from results. */
  sourcePlantId?: string | null;
  /** When true, include archived/merged plants (logs filter only). */
  includeArchived?: boolean;
}

const MERGE_MARKER_RE = /Merged into ([0-9a-f-]{36})/i;

function readGrowId(p: PlantDropdownInput): string | null {
  return p.grow_id ?? p.growId ?? null;
}

function readTentId(p: PlantDropdownInput): string | null {
  return p.tent_id ?? p.tentId ?? null;
}

function readArchived(p: PlantDropdownInput): boolean {
  return Boolean(p.is_archived ?? p.isArchived ?? false);
}

function readLastNote(p: PlantDropdownInput): string {
  return String(p.last_note ?? p.lastNote ?? "");
}

function readTentGrowId(t: TentGrowRef): string | null {
  return t.grow_id ?? t.growId ?? null;
}

function readSortKey(p: PlantDropdownInput): string {
  const a = (p.name ?? "").trim().toLowerCase();
  const b = (p.created_at ?? p.createdAt ?? "").toString();
  // Stable sort: name first, then created_at, then id.
  return `${a}\u0000${b}\u0000${p.id}`;
}

export function isMergedDropdownPlant(p: PlantDropdownInput): boolean {
  return MERGE_MARKER_RE.test(readLastNote(p));
}

export function isInactiveDropdownPlant(p: PlantDropdownInput): boolean {
  return readArchived(p) || isMergedDropdownPlant(p);
}

/**
 * Resolves the effective grow id for a plant using its raw grow_id first,
 * then falling back to the grow id of its assigned tent (if known).
 */
export function getEffectivePlantGrowId(
  p: PlantDropdownInput,
  tents: readonly TentGrowRef[] = [],
): string | null {
  const raw = readGrowId(p);
  if (raw) return raw;
  const tentId = readTentId(p);
  if (!tentId) return null;
  const tent = tents.find((t) => t.id === tentId);
  return tent ? readTentGrowId(tent) : null;
}

export type ExclusionReason =
  | "archived_or_merged"
  | "missing_grow_context"
  | "cross_grow"
  | "source_plant"
  | "already_in_tent"
  | "no_tent_assigned";

export interface PlantDropdownOption {
  plant: PlantDropdownInput;
  /** Eligible to be the chosen value. Disabled options stay visible. */
  eligible: boolean;
  /** True when the option should render but cannot be selected. */
  disabled: boolean;
  /** Grower-facing reason text when disabled or excluded. */
  reason?: string;
  /** Machine-readable reason for tests / instrumentation. */
  reasonCode?: ExclusionReason;
  /** Effective grow id used for the eligibility decision. */
  effectiveGrowId: string | null;
}

const REASON_TEXT: Record<ExclusionReason, string> = {
  archived_or_merged: "Archived or merged — kept for history.",
  missing_grow_context: "Missing grow context — repair from plant page.",
  cross_grow: "Belongs to a different grow.",
  source_plant: "This is the source plant.",
  already_in_tent: "Already in this tent.",
  no_tent_assigned: "Not yet assigned to a tent.",
};

/**
 * Decides whether a plant should be offered in the dropdown for the given
 * context. Returns null when the plant should be silently excluded, or a
 * PlantDropdownOption describing eligibility (and optional disabled reason).
 */
export function classifyPlantForDropdown(
  plant: PlantDropdownInput,
  tents: readonly TentGrowRef[],
  opts: PlantDropdownContextOptions,
): PlantDropdownOption | null {
  const effectiveGrowId = getEffectivePlantGrowId(plant, tents);
  const archived = isInactiveDropdownPlant(plant);
  const includeArchived =
    opts.includeArchived === true || opts.context === "logs_filter";

  // Source plant is always excluded from merge target picker.
  if (opts.context === "merge_target" && opts.sourcePlantId && plant.id === opts.sourcePlantId) {
    return null;
  }

  if (archived && !includeArchived) return null;

  // Same-grow contexts: require an effective grow id match.
  const sameGrowContexts: PlantDropdownContext[] = [
    "quick_log",
    "merge_target",
    "add_existing_to_tent",
    "move_to_tent",
    "edit_plant_tent",
    "daily_check",
  ];
  if (sameGrowContexts.includes(opts.context) && opts.growId) {
    if (!effectiveGrowId) {
      // Visible but disabled for repair-prone surfaces; silently excluded
      // for narrower pickers where a disabled row only adds noise.
      if (
        opts.context === "merge_target" ||
        opts.context === "add_existing_to_tent" ||
        opts.context === "quick_log"
      ) {
        return {
          plant,
          eligible: false,
          disabled: true,
          reason: REASON_TEXT.missing_grow_context,
          reasonCode: "missing_grow_context",
          effectiveGrowId,
        };
      }
      return null;
    }
    if (effectiveGrowId !== opts.growId) {
      return null;
    }
  }

  // Add-existing-to-tent: surface "already in this tent" as disabled.
  if (opts.context === "add_existing_to_tent" && opts.tentId) {
    if (readTentId(plant) === opts.tentId) {
      return {
        plant,
        eligible: false,
        disabled: true,
        reason: REASON_TEXT.already_in_tent,
        reasonCode: "already_in_tent",
        effectiveGrowId,
      };
    }
  }

  // Archived plants in logs_filter: visible but flagged.
  if (archived && includeArchived) {
    return {
      plant,
      eligible: true,
      disabled: false,
      reason: REASON_TEXT.archived_or_merged,
      reasonCode: "archived_or_merged",
      effectiveGrowId,
    };
  }

  return {
    plant,
    eligible: true,
    disabled: false,
    effectiveGrowId,
  };
}

export function shouldIncludePlantInDropdown(
  plant: PlantDropdownInput,
  tents: readonly TentGrowRef[],
  opts: PlantDropdownContextOptions,
): boolean {
  return classifyPlantForDropdown(plant, tents, opts) !== null;
}

export function getPlantDropdownOptions(
  plants: readonly PlantDropdownInput[],
  tents: readonly TentGrowRef[],
  opts: PlantDropdownContextOptions,
): PlantDropdownOption[] {
  const out: PlantDropdownOption[] = [];
  for (const p of plants) {
    const decision = classifyPlantForDropdown(p, tents, opts);
    if (decision) out.push(decision);
  }
  return sortPlantDropdownOptions(out);
}

export function sortPlantDropdownOptions(
  options: readonly PlantDropdownOption[],
): PlantDropdownOption[] {
  return [...options].sort((a, b) => {
    // Eligible options first, disabled at the bottom.
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    const ak = readSortKey(a.plant);
    const bk = readSortKey(b.plant);
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return 0;
  });
}

export interface PlantDropdownExclusionSummary {
  total: number;
  visible: number;
  hiddenArchived: number;
  hiddenCrossGrow: number;
  hiddenMissingGrow: number;
  hiddenSourcePlant: number;
}

export function summarizePlantDropdown(
  plants: readonly PlantDropdownInput[],
  tents: readonly TentGrowRef[],
  opts: PlantDropdownContextOptions,
): PlantDropdownExclusionSummary {
  const summary: PlantDropdownExclusionSummary = {
    total: plants.length,
    visible: 0,
    hiddenArchived: 0,
    hiddenCrossGrow: 0,
    hiddenMissingGrow: 0,
    hiddenSourcePlant: 0,
  };
  const includeArchived =
    opts.includeArchived === true || opts.context === "logs_filter";
  for (const p of plants) {
    if (opts.context === "merge_target" && opts.sourcePlantId === p.id) {
      summary.hiddenSourcePlant += 1;
      continue;
    }
    const archived = isInactiveDropdownPlant(p);
    if (archived && !includeArchived) {
      summary.hiddenArchived += 1;
      continue;
    }
    const eff = getEffectivePlantGrowId(p, tents);
    if (opts.growId && !eff) {
      summary.hiddenMissingGrow += 1;
      continue;
    }
    if (opts.growId && eff !== opts.growId) {
      summary.hiddenCrossGrow += 1;
      continue;
    }
    summary.visible += 1;
  }
  return summary;
}

/**
 * Renders a short, grower-facing helper line, e.g.
 *   "Showing 2 active plants. 1 archived/merged hidden."
 * Returns "" when there is nothing notable to disclose.
 */
export function formatPlantDropdownHelper(
  summary: PlantDropdownExclusionSummary,
  growName?: string | null,
): string {
  const parts: string[] = [];
  parts.push(`Showing ${summary.visible} plant${summary.visible === 1 ? "" : "s"}`);
  if (growName) parts[parts.length - 1] += ` in ${growName}`;
  parts[parts.length - 1] += ".";
  if (summary.hiddenArchived > 0) {
    parts.push(
      `${summary.hiddenArchived} archived/merged hidden.`,
    );
  }
  if (summary.hiddenMissingGrow > 0) {
    parts.push(
      `${summary.hiddenMissingGrow} plant${summary.hiddenMissingGrow === 1 ? "" : "s"} missing grow context.`,
    );
  }
  if (summary.hiddenCrossGrow > 0) {
    parts.push(
      `${summary.hiddenCrossGrow} in another grow.`,
    );
  }
  return parts.join(" ");
}
