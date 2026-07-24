/**
 * checkoutPlanIntent — pure helper for a **typed, allowlisted, one-shot**
 * plan intent that survives the /auth round-trip.
 *
 * Problem shape:
 *   1. Signed-out user clicks "Upgrade to Pro (annual)" on /pricing.
 *   2. usePaddleCheckout redirects to /auth?redirectTo=/pricing.
 *   3. After sign-in they land back on /pricing — historically they had to
 *      click the same CTA again, and there was no guarantee the same
 *      billing cadence would be re-selected.
 *
 * Slice C fix:
 *   - Before the /auth detour we save a small, typed plan intent to
 *     sessionStorage.
 *   - After sign-in, the hook consumes it EXACTLY ONCE and re-opens the
 *     Paddle overlay with the same plan.
 *
 * SAFETY:
 *   - Never grants entitlement — this is intent only, real billing state
 *     is server-authoritative via the Paddle webhook.
 *   - Plan values are validated against a hard allowlist so a tampered
 *     sessionStorage cannot force checkout of an arbitrary price id.
 *   - Freshness cap (default 15 min) guards against stale intents from
 *     a much earlier session.
 *   - Consume is destructive: read + delete atomically, so a listener /
 *     StrictMode double-invoke cannot re-open checkout twice.
 *   - All storage access is wrapped — private-mode / disabled-storage
 *     browsers get graceful no-ops, never exceptions.
 */

import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";

export type PlanIntentId = "pro_monthly" | "pro_annual" | "founder_lifetime";

const KNOWN_PLAN_INTENTS: ReadonlyArray<PlanIntentId> = [
  "pro_monthly",
  "pro_annual",
  "founder_lifetime",
];

export function isKnownPlanIntent(value: unknown): value is PlanIntentId {
  return typeof value === "string" && (KNOWN_PLAN_INTENTS as ReadonlyArray<string>).includes(value);
}

/**
 * Preserve the selected plan in the signed-in return URL as well as
 * sessionStorage. Email confirmation commonly opens a new tab, where the
 * original tab's sessionStorage is unavailable; the allowlisted `?plan=`
 * value keeps Pricing preselected without auto-opening checkout.
 */
export function buildCheckoutPlanReturnPath(input: {
  pathname: unknown;
  search: unknown;
  plan: unknown;
}): string {
  const pathname = typeof input.pathname === "string" ? input.pathname : "/pricing";
  const search = typeof input.search === "string" ? input.search : "";
  const safeCurrentPath = sanitizeAuthRedirect(`${pathname}${search}`, "/pricing");
  const queryIndex = safeCurrentPath.indexOf("?");
  const safePath = queryIndex >= 0 ? safeCurrentPath.slice(0, queryIndex) : safeCurrentPath;
  const params = new URLSearchParams(queryIndex >= 0 ? safeCurrentPath.slice(queryIndex + 1) : "");

  if (isKnownPlanIntent(input.plan)) params.set("plan", input.plan);
  else params.delete("plan");

  const query = params.toString();
  return query ? `${safePath}?${query}` : safePath;
}

export interface PlanIntentRecord {
  plan: PlanIntentId;
  /** ms since epoch when the intent was saved. */
  savedAt: number;
}

export const CHECKOUT_PLAN_INTENT_STORAGE_KEY = "verdant.checkout.planIntent.v1";

/** Default freshness window — 15 minutes is long enough for email verify
 * / password reset, short enough that a stale tab cannot resurrect a plan
 * intent hours later. */
export const DEFAULT_PLAN_INTENT_MAX_AGE_MS = 15 * 60 * 1000;

/** Minimal Storage-shaped interface so tests can inject a fake without
 * needing jsdom's sessionStorage. */
export interface PlanIntentStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function safeStorage(): PlanIntentStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.sessionStorage;
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Save a plan intent. Unknown plan ids are silently rejected — the allowlist
 * is the security boundary; callers should not need to pre-validate.
 * Returns true when persisted, false otherwise.
 */
export function savePlanIntent(
  plan: unknown,
  opts?: { storage?: PlanIntentStorage | null; now?: number },
): boolean {
  if (!isKnownPlanIntent(plan)) return false;
  const storage = opts && "storage" in opts ? opts.storage : safeStorage();
  if (!storage) return false;
  const record: PlanIntentRecord = {
    plan,
    savedAt: typeof opts?.now === "number" ? opts.now : Date.now(),
  };
  try {
    storage.setItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically read + delete the plan intent. Returns null when:
 *   - no intent stored
 *   - storage read/parse fails
 *   - stored plan is not in the allowlist (tampered / stale schema)
 *   - stored intent is older than `maxAgeMs`
 * The stored entry is ALWAYS removed on any read attempt, even when the
 * result is null — so a corrupt record cannot linger and block future saves.
 */
export function consumePlanIntent(opts?: {
  storage?: PlanIntentStorage | null;
  now?: number;
  maxAgeMs?: number;
}): PlanIntentId | null {
  const storage = opts && "storage" in opts ? opts.storage : safeStorage();
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY);
  } catch {
    return null;
  }
  // Always attempt removal — one-shot semantics.
  try {
    storage.removeItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<PlanIntentRecord>;
  if (!isKnownPlanIntent(record.plan)) return null;
  if (typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) {
    return null;
  }
  const now = typeof opts?.now === "number" ? opts.now : Date.now();
  const maxAge = opts?.maxAgeMs ?? DEFAULT_PLAN_INTENT_MAX_AGE_MS;
  if (now - record.savedAt > maxAge) return null;
  if (now - record.savedAt < 0) return null; // clock skew / future timestamp — reject
  return record.plan;
}

/** Read-only helper. Not used in production paths; kept for diagnostics/tests. */
export function peekPlanIntent(opts?: { storage?: PlanIntentStorage | null }): PlanIntentId | null {
  const storage = opts?.storage ?? safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanIntentRecord>;
    return isKnownPlanIntent(parsed?.plan) ? parsed.plan : null;
  } catch {
    return null;
  }
}

/** Explicit clear — used when the user cancels or leaves the checkout flow. */
export function clearPlanIntent(opts?: { storage?: PlanIntentStorage | null }): void {
  const storage = opts?.storage ?? safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
