/**
 * `/doctor` context consumer — validation rules (Tranche B+ slice B4a, D-B6).
 *
 * The Sensors loop card provably holds only `{ growId, tentId }`, so the
 * back-half carry into `/doctor` is `?growId=&tentId=` and nothing more — a
 * plant is not derivable from that producer. This module is the CONSUMING
 * half of that contract.
 *
 * Two properties matter more than convenience:
 *
 *  1. **Fail closed.** Threading a raw id through a URL grants no trust. A
 *     grow or tent that does not resolve against rows the grower actually
 *     owns is discarded and reported as invalid — never rendered, never used
 *     to scope a query. Normalization happens in the producing rules;
 *     validation happens here, mirroring `useScopedGrow`'s pattern.
 *
 *  2. **Annotate, never remove.** Carried scope may reorder and label the
 *     plant options, but every plant the grower could choose before is still
 *     choosable after. "Verdant will not guess which plant you mean"
 *     (`AiDoctorStart.tsx`) is doctrine; silently shortening the list is a
 *     softer form of guessing.
 *
 * Pure: no storage, no clock, no I/O, no network. Never throws.
 */
import type { AiDoctorEntryOption, AiDoctorEntryPlant } from "@/lib/aiDoctorEntryRules";

export interface DoctorScopeGrowLike {
  id?: string | null;
  name?: string | null;
}

export interface DoctorScopeTentLike {
  id?: string | null;
  name?: string | null;
  grow_id?: string | null;
  growId?: string | null;
}

export interface ResolveDoctorStartScopeInput {
  urlGrowId?: string | null;
  urlTentId?: string | null;
  visibleGrows?: readonly DoctorScopeGrowLike[] | null;
  visibleTents?: readonly DoctorScopeTentLike[] | null;
}

export interface DoctorStartScope {
  /** Validated grow id, or null. Never a raw URL value. */
  growId: string | null;
  growName: string | null;
  /** Validated tent id, or null. Belongs to `growId` whenever both are set. */
  tentId: string | null;
  tentName: string | null;
  /**
   * True when a parameter was supplied but did not resolve to something the
   * grower owns. Lets the page say so calmly instead of silently ignoring it.
   */
  hasInvalidScope: boolean;
}

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function tentGrowId(tent: DoctorScopeTentLike): string | null {
  return trimmed(tent.grow_id) ?? trimmed(tent.growId);
}

/**
 * Validate carried `?growId=&tentId=` against the grower's own rows.
 *
 * Absent parameters are not an error — they mean "no scope", which is the
 * normal unscoped entry. Only a *supplied* parameter that fails to resolve
 * sets `hasInvalidScope`.
 */
export function resolveDoctorStartScope(input: ResolveDoctorStartScopeInput): DoctorStartScope {
  const requestedGrowId = trimmed(input?.urlGrowId);
  const requestedTentId = trimmed(input?.urlTentId);
  const grows = Array.isArray(input?.visibleGrows) ? input.visibleGrows : [];
  const tents = Array.isArray(input?.visibleTents) ? input.visibleTents : [];

  let invalid = false;

  const grow = requestedGrowId
    ? (grows.find((row) => row && trimmed(row.id) === requestedGrowId) ?? null)
    : null;
  /** A grow was explicitly carried and did not resolve to one the grower owns. */
  const growRejected = !!requestedGrowId && !grow;
  if (growRejected) invalid = true;

  let tent = requestedTentId
    ? (tents.find((row) => row && trimmed(row.id) === requestedTentId) ?? null)
    : null;
  if (requestedTentId && !tent) invalid = true;

  // A rejected grow taints the whole tuple. `?growId=&tentId=` arrives from ONE
  // producer, so a bad half is evidence the pair cannot be trusted — keeping the
  // tent would let the page promote and badge that tent while simultaneously
  // telling the grower no tent context was applied. Note this is narrower than
  // "no grow": an ABSENT grow is fine and lets a valid tent supply one below.
  if (growRejected) tent = null;

  // A tent that resolves but sits in a different grow than the one carried is
  // rejected rather than reconciled — annotating the page with another grow's
  // tent would be a quiet lie about where the grower is.
  if (tent && grow) {
    const owner = tentGrowId(tent);
    // `!owner` is deliberate, not an oversight: the schema permits a null
    // grow_id on legacy tents, and accepting one here would apply an
    // UNVERIFIED pair — a fail-open in a fail-closed function. When a grow is
    // carried, an unknown relationship is treated exactly like a wrong one.
    // (With no grow carried there is nothing to contradict, so an owner-less
    // tent still stands — that case never reaches this branch.)
    if (!owner || owner !== trimmed(grow.id)) {
      tent = null;
      invalid = true;
    }
  }

  // When NO grow was carried, a valid tent supplies one — a derivation from
  // an owned row, not a widening of trust. But when a grow WAS carried and
  // failed to resolve, deriving a replacement would render a different grow
  // than the URL named. That is the same quiet lie the cross-grow check above
  // rejects, so a bogus grow id yields no grow at all.
  const derivedGrow =
    !requestedGrowId && tent
      ? (grows.find((row) => row && trimmed(row.id) === tentGrowId(tent!)) ?? null)
      : null;
  const effectiveGrow = grow ?? derivedGrow;

  return {
    growId: effectiveGrow ? trimmed(effectiveGrow.id) : null,
    growName: effectiveGrow ? trimmed(effectiveGrow.name) : null,
    tentId: tent ? trimmed(tent.id) : null,
    tentName: tent ? trimmed(tent.name) : null,
    hasInvalidScope: invalid,
  };
}

export interface PartitionDoctorEntryOptionsInput {
  options?: readonly AiDoctorEntryOption[] | null;
  plants?: readonly AiDoctorEntryPlant[] | null;
  tentId?: string | null;
  /**
   * Plant carried from Timeline through Sensors (D-B6 handoff). Untrusted:
   * it is honoured only when it names a plant the grower actually owns AND
   * that plant sits in the carried tent. It reorders and labels; it NEVER
   * selects. "Verdant will not guess which plant you mean" is doctrine, and
   * a carried intent is still the grower's to confirm.
   */
  carriedPlantId?: string | null;
}

export interface PartitionedDoctorEntryOptions {
  /** Options whose plant sits in the carried tent, in builder order. */
  inScope: readonly AiDoctorEntryOption[];
  /** Every other option, in builder order. Never a dropped choice. */
  others: readonly AiDoctorEntryOption[];
  /**
   * The validated carried plant's option id, or null. Presenters may label
   * and order by it. It is NOT a selection and must never be applied as one.
   */
  carriedPlantOptionId: string | null;
}

/**
 * Split the option list by carried tent scope, losslessly.
 *
 * `inScope ∪ others` always equals the input, so this reorders and labels the
 * grower's choices without ever narrowing them.
 */
export function partitionDoctorEntryOptionsByTent(
  input: PartitionDoctorEntryOptionsInput,
): PartitionedDoctorEntryOptions {
  const options = Array.isArray(input?.options) ? input.options : [];
  const tentId = trimmed(input?.tentId);
  if (!tentId || options.length === 0) {
    return { inScope: [], others: options, carriedPlantOptionId: null };
  }

  const plants = Array.isArray(input?.plants) ? input.plants : [];
  const plantTentById = new Map<string, string | null>();
  for (const plant of plants) {
    if (!plant) continue;
    const id = trimmed(plant.id);
    if (!id) continue;
    plantTentById.set(id, trimmed(plant.tent_id) ?? trimmed(plant.tentId));
  }

  const inScope: AiDoctorEntryOption[] = [];
  const others: AiDoctorEntryOption[] = [];
  for (const option of options) {
    if (option && plantTentById.get(option.id) === tentId) inScope.push(option);
    else others.push(option);
  }

  // Honour the carried plant only if it is BOTH one of the grower's own
  // options AND in the carried tent. A plant from another tent, another
  // account, or no longer present fails closed to null rather than being
  // surfaced as "where you came from".
  const requestedPlantId = trimmed(input?.carriedPlantId);
  const carriedPlantOptionId =
    requestedPlantId && inScope.some((option) => option.id === requestedPlantId)
      ? requestedPlantId
      : null;

  // Order the carried plant first WITHIN its tent group. Nothing is removed:
  // inScope ∪ others still equals the input.
  const orderedInScope = carriedPlantOptionId
    ? [
        ...inScope.filter((option) => option.id === carriedPlantOptionId),
        ...inScope.filter((option) => option.id !== carriedPlantOptionId),
      ]
    : inScope;

  return { inScope: orderedInScope, others, carriedPlantOptionId };
}
