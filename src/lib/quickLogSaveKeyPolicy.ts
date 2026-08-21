/**
 * The one Quick Log idempotency-key policy (Tranche B+ slice B2a, D-B2).
 *
 * A key identifies one LOGICAL submission. `quicklog_save_manual` returns the
 * original row with `reused=true` when it sees a key again, so this module
 * decides exactly one thing: for the payload about to be sent, do we mint,
 * reuse, or rotate?
 *
 * Both mistakes are data defects, in opposite directions:
 *  - **over-rotating** (a fresh key per attempt) turns a lost-response retry
 *    into a second diary row;
 *  - **over-reusing** (never rotating) makes a genuinely new submission come
 *    back as the previous row, so the grower's log silently does not save.
 *
 * The rule extracted from the legacy dialog — the strongest of the three
 * shipped policies — is signature-aware: a *pure* retry reuses, an *edited*
 * retry rotates. `occurred_at` is normalized out of the signature because it
 * is re-stamped per attempt and is not a grower edit.
 *
 * Note on naming: this governs the **server** idempotency key (a string sent
 * as `p_idempotency_key`). It is unrelated to `rotateQuickLogIdempotencyKey`
 * in `quickLogSaveGuardRules.ts`, which advances a numeric attempt counter.
 *
 * Deviation from the D-B2 wording, recorded rather than glossed: the design
 * says "mint on open". This module mints lazily, at the first save, because a
 * key minted at open has no signature yet — `resolve` would see a mismatch and
 * rotate it away on that very first save, so the open-time mint would be dead
 * weight unless a pre-signature state were added for it. The two are
 * observationally identical at the server: the key is only ever USED at save
 * time, so both send a fresh key for the first save, reuse it on a pure retry,
 * and rotate it on an edit. `rotate on success/reset` is honored by the caller
 * clearing its stored state on reset AND on close.
 *
 * RATIFIED by Cheek 2026-08-20: the D-B2 wording relaxes to "mint at first
 * save", and the pre-signature key state is explicitly NOT required. This is
 * the sanctioned reading, not an unreviewed deviation. The design document
 * still carries the original "mint on open" phrasing; it is the owner's text
 * to amend, so it is not edited from here.
 *
 * Pure: no storage, no clock, no I/O. `mint` is injected. Never throws.
 */

export const QUICK_LOG_SAVE_KEY_DECISIONS = ["mint", "reuse", "rotate"] as const;
export type QuickLogSaveKeyDecision = (typeof QUICK_LOG_SAVE_KEY_DECISIONS)[number];

export interface QuickLogSaveKeyState {
  /** The key to send as `p_idempotency_key`. */
  key: string;
  /** Signature of the payload this key was last issued for. */
  signature: string;
}

export interface ResolveQuickLogSaveKeyInput {
  /** Stored state from a previous attempt, or null on a fresh submission. */
  current: QuickLogSaveKeyState | null | undefined;
  /** Signature of the payload about to be sent. */
  signature: string;
  /** Key factory (injected so this module stays pure). */
  mint: () => string;
}

export interface ResolveQuickLogSaveKeyResult {
  /** State the caller MUST store — minting without storing defeats the point. */
  state: QuickLogSaveKeyState;
  decision: QuickLogSaveKeyDecision;
}

/**
 * The fields that identify a chosen photo for signature purposes.
 *
 * Structural, not `File`, so this module keeps no DOM dependency — a `File`
 * satisfies it by shape.
 */
export interface QuickLogPhotoIdentity {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * Identity of the grower's photo CHOICE.
 *
 * All four fields, matching the shipped precedent in
 * `aiCoachRequestRecoveryRules.ts:38`. Name and size alone do not identify a
 * file: two different photos can share both (same camera filename after a
 * re-take, same byte count), and swapping one for the other is a real edit
 * that must rotate the key rather than silently reuse it.
 *
 * Every field is stable across retries of one submission — they describe the
 * File the grower picked, not the attempt — so widening the identity cannot
 * introduce per-attempt churn.
 */
export function buildQuickLogPhotoIdentity(
  file: QuickLogPhotoIdentity | null | undefined,
): QuickLogPhotoIdentity | null {
  if (!file) return null;
  return {
    name: typeof file.name === "string" ? file.name : "",
    size: typeof file.size === "number" ? file.size : 0,
    type: typeof file.type === "string" ? file.type : "",
    lastModified: typeof file.lastModified === "number" ? file.lastModified : 0,
  };
}

/** Timestamp fields re-stamped per attempt; never a grower edit. */
const VOLATILE_KEYS = new Set(["occurred_at", "p_occurred_at"]);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !VOLATILE_KEYS.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * Deterministic signature of a submission payload.
 *
 * Stable across key order (reordering fields is not an edit) and blind to
 * `occurred_at` (re-stamping is not an edit), but sensitive to every other
 * value the grower can change.
 */
export function buildQuickLogSaveSignature(payload: unknown): string {
  try {
    return stableStringify(payload);
  } catch {
    // Cyclic or otherwise unserializable: fall back to a constant so the
    // caller degrades to "always reuse within this submission" rather than
    // throwing mid-save. Rotation still happens on close/reset.
    return "__unserializable__";
  }
}

function usableKey(state: QuickLogSaveKeyState | null | undefined): boolean {
  return !!state && typeof state.key === "string" && state.key.trim().length > 0;
}

/**
 * Decide the key for the submission described by `signature`.
 *
 * Always returns state the caller stores. A minted key that is not stored is
 * the exact defect this replaces: every retry mints again, so the server sees
 * a new key each time and writes a duplicate row.
 */
export function resolveQuickLogSaveKey(
  input: ResolveQuickLogSaveKeyInput,
): ResolveQuickLogSaveKeyResult {
  const signature = typeof input?.signature === "string" ? input.signature : "";
  const mint = typeof input?.mint === "function" ? input.mint : () => "";
  const current = input?.current;

  if (!usableKey(current)) {
    return { state: { key: mint(), signature }, decision: "mint" };
  }
  if (current!.signature === signature) {
    return { state: { key: current!.key, signature }, decision: "reuse" };
  }
  return { state: { key: mint(), signature }, decision: "rotate" };
}
