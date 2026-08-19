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
