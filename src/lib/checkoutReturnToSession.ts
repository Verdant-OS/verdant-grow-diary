/**
 * checkoutReturnToSession — one-shot return-to persistence across the
 * Paddle overlay lifecycle.
 *
 * L5 (audit fix): before this helper, `usePaddleCheckout` handed the raw
 * `returnTo` through the Paddle `successUrl` only. When a buyer dismissed
 * the overlay (cancel path), `/checkout/cancel` was reached with no
 * knowledge of where they had been trying to go, so "Back to pricing"
 * dropped them on generic /pricing instead of the gated surface they
 * came from (e.g. /pheno-hunts/new).
 *
 * SAFETY:
 *   - Every stored value is re-run through `sanitizeCheckoutReturnTo`
 *     before it leaves this module — same allowlist as the success URL
 *     builder, no bypass.
 *   - Consume is destructive (read + delete) so a stale return-to from
 *     an earlier session cannot resurrect a later navigation.
 *   - Storage failures are swallowed. This is UX plumbing, never a
 *     security boundary.
 */

import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";

export const CHECKOUT_RETURN_TO_STORAGE_KEY =
  "verdant.checkout.returnTo.v1";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function safeStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function saveCheckoutReturnTo(
  raw: string | null | undefined,
  opts?: { storage?: StorageLike | null },
): void {
  const safe = sanitizeCheckoutReturnTo(raw);
  const storage =
    opts && "storage" in opts ? opts.storage : safeStorage();
  if (!storage) return;
  try {
    if (safe) {
      storage.setItem(CHECKOUT_RETURN_TO_STORAGE_KEY, safe);
    } else {
      storage.removeItem(CHECKOUT_RETURN_TO_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Read + delete the stored return-to. Always removes on read so a
 * follow-up navigation cannot re-use the same intent. Returns a
 * sanitized path or `null`.
 */
export function consumeCheckoutReturnTo(
  opts?: { storage?: StorageLike | null },
): string | null {
  const storage =
    opts && "storage" in opts ? opts.storage : safeStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY);
  } catch {
    return null;
  }
  try {
    storage.removeItem(CHECKOUT_RETURN_TO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return sanitizeCheckoutReturnTo(raw);
}
