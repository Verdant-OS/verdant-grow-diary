/**
 * breedingSubmissionRecoveryRules — what to do with the idempotency key after
 * `breeding_log_save_event` refuses a save.
 *
 * Pure: no I/O, no React, no Supabase, no time, no randomness.
 *
 * ## The bug this closes
 *
 * `resolveBreedingSubmissionAttempt` returns the previous attempt verbatim when
 * the form fingerprint is unchanged (`breedingSubmissionIdempotencyRules.ts:38`),
 * and `BreedingLogContainer` clears its ref only after a success. So when the
 * RPC refuses with `idempotency_key_conflict`, pressing Save again re-presents
 * the very key that was just rejected and receives a byte-identical refusal.
 * The copy told the grower to review and save again — the one action that
 * provably cannot work.
 *
 * ## Why "just rotate the key on failure" is wrong
 *
 * A conflict means the server FOUND a ledger row for that key
 * (`...reconciliation.sql:1415`). That row is written only at `:1511-1522`,
 * immediately before `RETURN ok=true` at `:1524`, and no path writes it and
 * returns `ok=false`. So a conflict is positive evidence that an earlier call
 * COMMITTED. Minting a fresh key would sail past the ledger lookup and write a
 * SECOND breeding event — trading a visible dead end for a silent duplicate in
 * a breeding record, which is worse.
 *
 * Conversely, blanket key reuse is what protects the grower from duplicates
 * after a dropped response, so it must stay the default.
 *
 * ## The rule
 *
 * Every reason except `idempotency_key_conflict` returns BEFORE or BELOW the
 * ledger write, so only that reason proves the key is spent. That single
 * structural fact — not case-by-case intuition — generates the table below.
 */
import {
  BREEDING_LOG_SAVE_EVENT_REASONS,
  type BreedingLogSaveEventReason,
} from "@/lib/genetics/breedingLogSaveEventRpc";

export type BreedingSubmissionKeyDisposition =
  /** Transient. Keep the key — retrying with it is what prevents a duplicate. */
  | "reuse_key"
  /** Key unusable, but provably never wrote anything. Rotate silently. */
  | "retire_key"
  /** Key spent by a committed write. Rotate AND warn about a possible duplicate. */
  | "retire_key_warn_duplicate";

/**
 * Exhaustive by construction. `satisfies Record<BreedingLogSaveEventReason, …>`
 * means a reason added to the union (which `breeding-log-save-event-reasons.test.ts`
 * forces to happen whenever the RPC gains one) fails to COMPILE here rather
 * than silently falling through a `default:` branch to some guessed behaviour.
 */
const DISPOSITION_BY_REASON = {
  // --- Pre-ledger refusals. The key was never accepted, so no row can exist
  // under it and reuse is both safe and duplicate-protective.
  not_authenticated: "reuse_key",
  invalid_event_type: "reuse_key",
  invalid_details: "reuse_key",
  grow_not_owned: "reuse_key",
  plant_required: "reuse_key",
  plant_not_in_grow: "reuse_key",
  plant_tent_not_owned: "reuse_key",
  plant_cross_grow: "reuse_key",
  tent_not_in_grow: "reuse_key",
  plant_not_in_tent: "reuse_key",

  // Both `save_failed` sites are inside the `unique_violation` handler, a
  // nested subtransaction whose tentative grow_events + breeding_events inserts
  // Postgres has already rolled back. Nothing committed, so the existing
  // "Nothing was recorded" copy is literally true and reuse is protective.
  // This is the case a flaky network produces most often, and the reason blind
  // rotation would be actively dangerous.
  save_failed: "reuse_key",

  // Definitive for the key, and provably duplicate-free: the key string is
  // constant in the ref, so if it fails the server's length gate now it failed
  // on every prior call and was never accepted. Rotation cannot duplicate.
  // Unreachable from this client today (`breeding-event-` + a UUID is 51 chars,
  // inside the accepted window) — defense in depth, not a live path.
  invalid_idempotency_key: "retire_key",

  // The wedged case. A ledger row exists, which proves a prior call committed.
  // Branch 1 recomputes an identical hash on an unchanged retry; branch 2
  // matches the hash but fails the replay predicate against drifted stored
  // state. Both refuse identically and forever — nothing frees the row (no TTL,
  // no cron, and no foreign key on grow_event_id). Retire AND warn.
  idempotency_key_conflict: "retire_key_warn_duplicate",
} satisfies Record<BreedingLogSaveEventReason, BreedingSubmissionKeyDisposition>;

/**
 * Decide the key's fate after a refusal.
 *
 * An unrecognized, null, or undefined reason resolves to `"reuse_key"`. A
 * response this client cannot interpret may correspond to a commit it cannot
 * see, and reuse is the duplicate-safe stance under ambiguity.
 */
export function resolveBreedingSubmissionKeyDisposition(
  reason: BreedingLogSaveEventReason | string | null | undefined,
): BreedingSubmissionKeyDisposition {
  if (typeof reason !== "string") return "reuse_key";
  // Deliberately not `DISPOSITION_BY_REASON[reason] ?? "reuse_key"` on an
  // unchecked index: a missing entry must resolve to reuse, never be coerced
  // into a rotation by a falsy lookup.
  const known = (BREEDING_LOG_SAVE_EVENT_REASONS as ReadonlyArray<string>).includes(reason);
  if (!known) return "reuse_key";
  return DISPOSITION_BY_REASON[reason as BreedingLogSaveEventReason];
}

/** True when the grower must be warned that an earlier attempt may have saved. */
export function shouldWarnPossibleDuplicate(
  disposition: BreedingSubmissionKeyDisposition,
): boolean {
  return disposition === "retire_key_warn_duplicate";
}

/** True when the stored attempt must be dropped so the next press mints a new key. */
export function shouldRetireSubmissionKey(disposition: BreedingSubmissionKeyDisposition): boolean {
  return disposition !== "reuse_key";
}
