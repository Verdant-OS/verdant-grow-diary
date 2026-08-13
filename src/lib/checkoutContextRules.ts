/**
 * checkoutContextRules — same-device evidence that a checkout was actually
 * started, so /checkout/success can tell "confirming a real checkout" apart
 * from a direct visit with no checkout context.
 *
 * Paddle's overlay redirects back in the same tab, so a sessionStorage
 * timestamp written right before the overlay opens is honest evidence that a
 * checkout began on this device.
 *
 * SAFETY: the marker NEVER grants anything. Entitlement stays resolved
 * server-side (useMyEntitlements); the marker only selects which calm copy
 * the success page shows while that resolution is pending. The page must
 * never claim a completed purchase without server-side confirmation.
 */

export const CHECKOUT_STARTED_STORAGE_KEY = "verdant:checkout-started-at";
/**
 * What KIND of checkout the marker describes, in a separate key so the
 * timestamp key's format (a bare number) never changes shape for existing
 * readers. "plan" = subscription/lifetime SKU, "pack" = one-time credit pack.
 * Consumers that care about kind must treat an absent/legacy marker as
 * unknown and fail toward NOT claiming plan provenance.
 */
export const CHECKOUT_KIND_STORAGE_KEY = "verdant:checkout-started-kind";

export type CheckoutStartKind = "plan" | "pack";

/** How long a started-checkout marker still counts as checkout context. */
export const CHECKOUT_CONTEXT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Record that a checkout overlay is about to open on this device. */
export function markCheckoutStarted(
  nowMs: number,
  kind: CheckoutStartKind = "plan",
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(CHECKOUT_STARTED_STORAGE_KEY, String(nowMs));
    storage?.setItem(CHECKOUT_KIND_STORAGE_KEY, kind);
  } catch {
    // Storage unavailable (private mode / quota). The success page then
    // shows its no-context copy — nothing is granted or lost.
  }
}

/**
 * The kind of the fresh checkout marker, or null when there is no fresh
 * marker or its kind is absent/unrecognized (legacy sessions wrote no kind).
 * Null deliberately reads as "cannot prove plan provenance".
 */
export function readFreshCheckoutKind(
  nowMs: number,
  storage: StorageLike | null = defaultStorage(),
): CheckoutStartKind | null {
  if (!hasFreshCheckoutContext(nowMs, storage)) return null;
  try {
    const raw = storage?.getItem(CHECKOUT_KIND_STORAGE_KEY);
    return raw === "plan" || raw === "pack" ? raw : null;
  } catch {
    return null;
  }
}

/** Timestamp of the last started checkout, or null when absent/invalid. */
export function readCheckoutStartedAt(
  storage: StorageLike | null = defaultStorage(),
): number | null {
  try {
    const raw = storage?.getItem(CHECKOUT_STARTED_STORAGE_KEY);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/** Remove the marker (called once the entitlement resolver confirms). */
export function clearCheckoutStarted(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(CHECKOUT_STARTED_STORAGE_KEY);
    storage?.removeItem(CHECKOUT_KIND_STORAGE_KEY);
  } catch {
    // Best effort — a stale marker only ever softens copy, never grants.
  }
}

/** True when a checkout started on this device recently enough to count. */
export function hasFreshCheckoutContext(
  nowMs: number,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  const at = readCheckoutStartedAt(storage);
  if (at == null) return false;
  const age = nowMs - at;
  return age >= 0 && age <= CHECKOUT_CONTEXT_MAX_AGE_MS;
}

export type CheckoutSuccessView = "confirmed" | "confirming" | "no_context" | "verification_failed";

/**
 * Which state /checkout/success should render:
 *  - "confirmed"  — the server-side resolver confirmed an active paid plan.
 *  - "verification_failed" — the subscription row could not be read; retry
 *                             without inferring Free or showing an upsell.
 *  - "confirming" — checkout context exists (fresh same-device marker or a
 *                   sanitized returnTo handoff) but no confirmation yet.
 *  - "no_context" — a direct visit: nothing to confirm, so the page must
 *                   not imply a checkout happened.
 */
export function resolveCheckoutSuccessView(input: {
  confirmed: boolean;
  lookupFailed?: boolean;
  hasReturnTo: boolean;
  hasCheckoutContext: boolean;
}): CheckoutSuccessView {
  if (input.confirmed) return "confirmed";
  if (input.lookupFailed) return "verification_failed";
  return input.hasReturnTo || input.hasCheckoutContext ? "confirming" : "no_context";
}
