/**
 * sanitizedDbError — shared assertion helper for the DB-backed local
 * security lane.
 *
 * Blocked gamification / RLS / entitlement errors must be *shape-safe*:
 * Postgres error text (message, details, hint, code) MUST NOT expose
 * billing / entitlement internals, provider IDs, tier-like columns from
 * the entitlement resolver, service-role material, JWTs, authorization
 * headers, private env names, SQL function bodies, or stack/file:line
 * traces that would help an attacker probe the schema.
 *
 * Generic "row-level security", "permission denied", "policy for … on
 * profiles" text is allowed — those are legitimate sanitized RLS errors.
 * Sanitized reason codes (like `CANNOT_UPDATE_GAMIFICATION_FIELDS`) are
 * also allowed.
 *
 * NEVER logs the raw error object outside vitest's assertion messages —
 * we only compose a scan buffer from string fields and match regexes.
 */

/**
 * Forbidden leak patterns. Each pattern is matched against the joined
 * error-shape buffer (`message + details + hint + code + status`).
 *
 * Categories (in order): billing internals, provider/payment IDs, tier-like
 * entitlement columns, secrets/auth material, stack/debug leakage.
 */
export const FORBIDDEN_LEAK_PATTERNS: ReadonlyArray<RegExp> = [
  // ── Billing / entitlement tables ────────────────────────────────────
  /\bbilling_subscriptions\b/i,
  /\bpaddle_events\b/i,
  /\blovable_paddle_events\b/i,
  /\bpayment_customers\b/i,
  /\bbilling_subscription_update_audit\b/i,
  /\bbilling_entitlement(s)?\b/i,
  /\bentitlement(s)?\b/i,
  // `user_roles` may legitimately appear in a policy name; only fail if
  // the error also reveals role internals.
  /\buser_roles\b.*\brole\b/i,

  // ── Provider / payment internals ────────────────────────────────────
  /\bpaddle\b/i,
  /\bstripe\b/i,
  /\bprovider_customer_id\b/i,
  /\bprovider_subscription_id\b/i,
  /\bcus_[A-Za-z0-9]+/,
  /\bsub_[A-Za-z0-9]+/,
  /\bpdl_[A-Za-z0-9]+/,
  /\bpri_[A-Za-z0-9]+/,

  // ── Tier / plan / entitlement column leakage ────────────────────────
  /profiles\.tier\b/i,
  /select\s+[^;]*\btier\b[^;]*from\s+(public\.)?profiles/i,
  /\.select\(["'][^"']*\btier\b/i,
  /\bdisplayPlanId\b/,
  /\beffectivePlanId\b/,
  /\bplan_id\b/i,
  /\bcurrent_period_end\b/i,

  // ── Secrets / auth material ─────────────────────────────────────────
  /service[_-]?role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /PAYMENTS?_.*SECRET/i,
  /PADDLE_.*SECRET/i,
  /\bsk_live_[A-Za-z0-9]+/,
  /\bsk_test_[A-Za-z0-9]+/,
  /\bAuthorization\b\s*:/i,
  /\bbearer\s+[A-Za-z0-9._-]+/i,
  /\brefresh[_-]?token\b/i,
  /\baccess[_-]?token\b/i,
  /eyJ[a-zA-Z0-9_-]+\./, // JWT-shaped

  // ── Stack / debug / source leakage ──────────────────────────────────
  /\bat\s+[^\s]+:\d+:\d+/, // "at file.ts:42:11"
  /\/(?:home|Users|var|root|opt|workspace)\/[^\s'"]+:\d+:\d+/,
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i, // SQL function body leaked
  /\bRETURNS\s+(?:trigger|void|boolean|table)\b.*\bAS\s*\$\$/i,
];

/**
 * Assert an unknown Postgres/PostgREST error object contains no sensitive
 * leak. Accepts `null` / `undefined` (caller may want to assert absence
 * separately). Uses only string fields from the error shape — never logs
 * or serializes the raw object outside vitest's assertion messages.
 */
/**
 * Compose the shape buffer scanned for leaks. Exported for direct unit
 * testing without needing vitest's `expect` inside the helper.
 */
export function composeDbErrorShape(err: unknown): string {
  if (err == null) return "";
  const obj = err as Record<string, unknown>;
  return [
    obj.message,
    obj.details,
    obj.hint,
    obj.code,
    typeof obj.status === "number" ? String(obj.status) : obj.status,
  ]
    .filter((v) => typeof v === "string")
    .join("\n");
}

/**
 * Returns the first forbidden pattern that matches, or null if the error
 * shape is sanitized. Pure — no vitest dependency.
 */
export function findDbErrorLeak(err: unknown): RegExp | null {
  const parts = composeDbErrorShape(err);
  if (!parts) return null;
  for (const rx of FORBIDDEN_LEAK_PATTERNS) {
    if (rx.test(parts)) return rx;
  }
  return null;
}

export function expectSanitizedDbError(err: unknown): void {
  const leak = findDbErrorLeak(err);
  if (leak) {
    throw new Error(`DB error leaked forbidden pattern ${leak}`);
  }
}
