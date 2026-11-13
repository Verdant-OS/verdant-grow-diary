/**
 * Pure rules for starting a Stripe hosted Checkout for Verdant Pro.
 *
 * No I/O, no clock, no Deno globals: callers pass env readers and inputs.
 * Used by supabase/functions/stripe-checkout/index.ts and pinned by
 * src/test/stripe-checkout-rules.test.ts.
 *
 * Contract (docs/specs/stripe-live-checkout-plan.md, Slice B):
 *  - Only the Pro plan keys can start a Stripe checkout. Free, Craft and
 *    founder_lifetime (no longer sold) are refused before any Stripe call.
 *  - The Stripe price id comes from server env per environment
 *    (STRIPE_PRICE_PRO_MONTHLY_LIVE, ..._SANDBOX). An unset price env turns
 *    that plan's Stripe checkout off: the interlock, like paddlePriceId null.
 *  - The secret key's own mode must match the server-resolved environment:
 *    a test key never runs a live checkout and a live key never runs sandbox.
 *  - The user id is a parameter supplied by the caller from a verified JWT.
 *    Nothing here reads a user id from a request body.
 *  - Redirect URLs are built from a fixed origin, never from request headers.
 */

export type StripeBillingEnvironment = "sandbox" | "live";

/** Plan keys a Stripe checkout may sell. Readable keys, stored as price_id. */
export const STRIPE_CHECKOUT_PLAN_KEYS = ["pro_monthly", "pro_annual"] as const;
export type StripeCheckoutPlanKey = (typeof STRIPE_CHECKOUT_PLAN_KEYS)[number];

/** Fixed public origin for Checkout redirects (production-only host). */
export const STRIPE_CHECKOUT_SITE_ORIGIN = "https://verdantgrowdiary.com";
export const STRIPE_CHECKOUT_SUCCESS_PATH = "/checkout/success";
export const STRIPE_CHECKOUT_CANCEL_PATH = "/pricing";

/** The only host a Checkout Session URL may point at before we hand it out. */
export const STRIPE_HOSTED_CHECKOUT_ORIGIN = "https://checkout.stripe.com";

export type StripeCheckoutRefusal =
  | "unknown_plan"
  | "plan_not_sold"
  | "secret_key_missing"
  | "secret_key_mode_mismatch"
  | "price_not_configured";

export type StripeCheckoutConfig =
  | { ok: true; plan: StripeCheckoutPlanKey; priceId: string; secretKey: string }
  | { ok: false; reason: StripeCheckoutRefusal };

/** Plan keys that exist in Verdant but are not sold through Stripe checkout. */
const NOT_SOLD_PLAN_KEYS: ReadonlySet<string> = new Set([
  "free",
  "founder_lifetime",
  "craft_monthly",
  "craft_annual",
]);

const STRIPE_PRICE_ID_RE = /^price_[A-Za-z0-9]+$/;

export function isStripeCheckoutPlanKey(value: unknown): value is StripeCheckoutPlanKey {
  return (
    typeof value === "string" && (STRIPE_CHECKOUT_PLAN_KEYS as readonly string[]).includes(value)
  );
}

/** Env var that holds the Stripe price id for one plan in one environment. */
export function stripePriceEnvName(
  plan: StripeCheckoutPlanKey,
  environment: StripeBillingEnvironment,
): string {
  return `STRIPE_PRICE_${plan.toUpperCase()}_${environment.toUpperCase()}`;
}

/**
 * The mode a Stripe secret or restricted key belongs to, read from its
 * documented prefix. Anything else (publishable keys, junk) is null.
 */
export function stripeKeyMode(key: unknown): "live" | "test" | null {
  if (typeof key !== "string") return null;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return null;
}

export function keyModeMatchesEnvironment(
  key: unknown,
  environment: StripeBillingEnvironment,
): boolean {
  const mode = stripeKeyMode(key);
  if (mode === null) return false;
  return environment === "live" ? mode === "live" : mode === "test";
}

/**
 * Decide whether a Stripe checkout may start for `requestedPlan`, and with
 * which price and key. Refuses before any network call.
 */
export function resolveStripeCheckoutConfig(input: {
  requestedPlan: unknown;
  environment: StripeBillingEnvironment;
  getEnv: (name: string) => string | undefined;
}): StripeCheckoutConfig {
  const { requestedPlan, environment, getEnv } = input;
  if (typeof requestedPlan === "string" && NOT_SOLD_PLAN_KEYS.has(requestedPlan)) {
    return { ok: false, reason: "plan_not_sold" };
  }
  if (!isStripeCheckoutPlanKey(requestedPlan)) {
    return { ok: false, reason: "unknown_plan" };
  }
  const secretKey = (getEnv("STRIPE_SECRET_KEY") ?? "").trim();
  if (secretKey === "") return { ok: false, reason: "secret_key_missing" };
  if (!keyModeMatchesEnvironment(secretKey, environment)) {
    return { ok: false, reason: "secret_key_mode_mismatch" };
  }
  const priceId = (getEnv(stripePriceEnvName(requestedPlan, environment)) ?? "").trim();
  if (!STRIPE_PRICE_ID_RE.test(priceId)) return { ok: false, reason: "price_not_configured" };
  return { ok: true, plan: requestedPlan, priceId, secretKey };
}

/**
 * Form fields for POST /v1/checkout/sessions, in a fixed order.
 * `userId` must be the verified caller's id.
 */
export function buildCheckoutSessionForm(input: {
  priceId: string;
  plan: StripeCheckoutPlanKey;
  userId: string;
  customerId: string;
  /** Unix seconds; from checkoutSessionExpiresAt, so repeats send the same value. */
  expiresAt: number;
}): Array<[string, string]> {
  const { priceId, plan, userId, customerId, expiresAt } = input;
  const fields: Array<[string, string]> = [
    ["mode", "subscription"],
    // Cards only (Apple Pay and Google Pay are card wallets here). A card is
    // settled before the subscription turns active; a delayed method such as
    // a bank debit can fail days after Checkout completes, after Pro unlocked.
    ["payment_method_types[0]", "card"],
    ["customer", customerId],
    ["expires_at", String(expiresAt)],
    ["line_items[0][price]", priceId],
    ["line_items[0][quantity]", "1"],
    ["client_reference_id", userId],
    ["metadata[user_id]", userId],
    ["metadata[plan_key]", plan],
    ["subscription_data[metadata][user_id]", userId],
    ["subscription_data[metadata][plan_key]", plan],
    ["success_url", `${STRIPE_CHECKOUT_SITE_ORIGIN}${STRIPE_CHECKOUT_SUCCESS_PATH}`],
    [
      "cancel_url",
      `${STRIPE_CHECKOUT_SITE_ORIGIN}${STRIPE_CHECKOUT_CANCEL_PATH}?checkout=canceled`,
    ],
  ];
  return fields;
}

/**
 * Form fields for POST /v1/customers: one Stripe customer per Verdant user.
 * Only the user id, so the request is identical every time and its
 * idempotency key can never clash (an email change used to make it 502).
 * Checkout collects the email on Stripe's page.
 */
export function buildCustomerForm(input: { userId: string }): Array<[string, string]> {
  return [["metadata[user_id]", input.userId]];
}

/**
 * The amount and interval each Pro plan must have in Stripe, in cents. They
 * mirror src/constants/pricing.ts (Pro $12/mo, $99/yr, Cheek 2026-11-12);
 * src/test/stripe-checkout-rules.test.ts fails if the two drift apart.
 */
export const STRIPE_PRO_EXPECTED_PRICES: Readonly<
  Record<StripeCheckoutPlanKey, { unitAmount: number; interval: "month" | "year" }>
> = Object.freeze({
  pro_monthly: { unitAmount: 1200, interval: "month" },
  pro_annual: { unitAmount: 9900, interval: "year" },
});

/**
 * True only when a Stripe Price object is the active, recurring, single-period
 * USD price this plan sells at, in the right mode. Anything else fails closed,
 * so a mistyped price id in env never charges a grower the wrong amount.
 */
export function stripePriceMatchesPlan(
  price: unknown,
  plan: StripeCheckoutPlanKey,
  environment: StripeBillingEnvironment,
): boolean {
  if (price === null || typeof price !== "object") return false;
  const p = price as Record<string, unknown>;
  const recurring = p.recurring as Record<string, unknown> | null | undefined;
  const expected = STRIPE_PRO_EXPECTED_PRICES[plan];
  return (
    p.object === "price" &&
    p.active === true &&
    p.livemode === (environment === "live") &&
    p.currency === "usd" &&
    p.type === "recurring" &&
    p.unit_amount === expected.unitAmount &&
    recurring != null &&
    typeof recurring === "object" &&
    recurring.interval === expected.interval &&
    recurring.interval_count === 1
  );
}

/** Stripe subscription statuses that mean "already buying or bought". */
const BLOCKING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

/**
 * True when a GET /v1/subscriptions list for the customer holds a
 * subscription that is live or still paying. This closes the window where a
 * checkout completed but the webhook has not written our row yet. An
 * unreadable body counts as blocking (fail closed).
 */
export function hasBlockingStripeSubscription(list: unknown): boolean {
  const data = (list as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return true;
  return data.some(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      BLOCKING_SUBSCRIPTION_STATUSES.has(String((item as { status?: unknown }).status)),
  );
}

const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9]+$/;

export function isStripeCustomerId(value: unknown): value is string {
  return typeof value === "string" && CUSTOMER_ID_RE.test(value);
}

/**
 * The caller's customer from a GET /v1/customers/search result, matched on
 * the metadata our own function wrote, never on email.
 */
export function pickCustomerFromSearch(body: unknown, userId: string): string | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const c = item as { id?: unknown; deleted?: unknown; metadata?: { user_id?: unknown } };
    if (c.deleted === true) continue;
    if (c.metadata?.user_id === userId && isStripeCustomerId(c.id)) return c.id;
  }
  return null;
}

/** Search query for the caller's customer. userId is a verified UUID. */
export function customerSearchQuery(userId: string): string {
  return `metadata['user_id']:'${userId.replace(/[^0-9a-fA-F-]/g, "")}'`;
}

/** Stripe idempotency window for a checkout start: repeat starts share one session. */
export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

/** FNV-1a 32-bit, hex. Deterministic and short; not a security hash. */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Idempotency key for creating a Checkout Session. It names the customer,
 * not the plan: two tabs starting monthly and annual at the same moment send
 * one key with different parameters, so Stripe creates the first session and
 * refuses the second, and the grower never holds two payable sessions.
 * `supersedes` lists the open sessions this start just expired: a start that
 * expired another session (a plan switch) gets a fresh key, so Stripe never
 * hands back a session that an earlier start already expired, while two
 * simultaneous starts that expired the same sessions still share one key.
 */
export function checkoutIdempotencyKey(input: {
  userId: string;
  environment: StripeBillingEnvironment;
  customerId: string;
  nowMs: number;
  supersedes?: readonly string[];
}): string {
  const window = Math.floor(input.nowMs / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  const base = `verdant-checkout-${input.environment}-${input.userId}-${input.customerId}-${window}`;
  const superseded = [...(input.supersedes ?? [])].sort();
  return superseded.length === 0 ? base : `${base}-${fnv1aHex(superseded.join(","))}`;
}

/**
 * When a Checkout Session expires, in unix seconds. Fixed per idempotency
 * window (window start + 42 minutes), so a repeat start sends identical
 * parameters, and every session lives 32 to 42 minutes: above Stripe's
 * 30-minute minimum with room for clock skew, and far below the 24-hour
 * default that let two open sessions turn into two subscriptions.
 */
export function checkoutSessionExpiresAt(nowMs: number): number {
  const windowStartMs =
    Math.floor(nowMs / CHECKOUT_IDEMPOTENCY_WINDOW_MS) * CHECKOUT_IDEMPOTENCY_WINDOW_MS;
  return Math.floor((windowStartMs + 42 * 60 * 1000) / 1000);
}

/** An open session must still have this long to run to be handed out again. */
export const OPEN_SESSION_MIN_REMAINING_SECONDS = 5 * 60;

/**
 * Decide what to do with the customer's open Checkout Sessions (GET
 * /v1/checkout/sessions?customer=...&status=open) before starting a new one:
 * hand back an open session for the same plan and user that still has time,
 * and expire every other open one, so a grower never holds two payable
 * sessions at once. An unreadable list returns null (fail closed).
 */
export function planOpenCheckoutSessions(
  list: unknown,
  input: { plan: StripeCheckoutPlanKey; userId: string; nowSeconds: number },
): { reuseUrl: string | null; expireIds: string[] } | null {
  const data = (list as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  let reuseUrl: string | null = null;
  const expireIds: string[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const session = item as {
      id?: unknown;
      status?: unknown;
      url?: unknown;
      expires_at?: unknown;
      metadata?: { plan_key?: unknown; user_id?: unknown } | null;
    };
    if (session.status !== "open") continue;
    if (typeof session.id !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(session.id)) continue;
    const url = parseCheckoutSessionUrl(session);
    const reusable =
      reuseUrl === null &&
      url !== null &&
      session.metadata?.plan_key === input.plan &&
      session.metadata?.user_id === input.userId &&
      typeof session.expires_at === "number" &&
      session.expires_at - input.nowSeconds >= OPEN_SESSION_MIN_REMAINING_SECONDS;
    if (reusable) reuseUrl = url;
    else expireIds.push(session.id);
  }
  return { reuseUrl, expireIds };
}

/**
 * After creating a session, decide whether it may be handed out. Reads the
 * customer's open sessions again: when another open session also exists (a
 * second tab that raced past the idempotency window), the one created first
 * wins, ties broken by id, so every racing start agrees on one keeper. Ours is
 * kept only when it is listed and ranks first; otherwise it is expired and
 * the start is refused. An unreadable list returns null (fail closed).
 */
export function keepCreatedCheckoutSession(list: unknown, sessionId: string): boolean | null {
  const data = (list as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  const open: Array<{ id: string; created: number }> = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const session = item as { id?: unknown; status?: unknown; created?: unknown };
    if (session.status !== "open") continue;
    if (typeof session.id !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(session.id)) continue;
    const created = typeof session.created === "number" ? session.created : Number.MAX_SAFE_INTEGER;
    open.push({ id: session.id, created });
  }
  if (!open.some((session) => session.id === sessionId)) return false;
  open.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return open[0].id === sessionId;
}

/** The id and hosted URL of a created Checkout Session, or null. */
export function parseCreatedCheckoutSession(body: unknown): { id: string; url: string } | null {
  const url = parseCheckoutSessionUrl(body);
  const id = (body as { id?: unknown } | null)?.id;
  if (url === null || typeof id !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(id)) return null;
  return { id, url };
}

export function customerIdempotencyKey(
  userId: string,
  environment: StripeBillingEnvironment,
): string {
  return `verdant-customer-${environment}-${userId}`;
}

/**
 * The hosted Checkout URL from a Checkout Session response, or null when the
 * body is not a usable session. Only a checkout.stripe.com https URL passes,
 * so the client never redirects anywhere else on our say-so.
 */
export function parseCheckoutSessionUrl(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const url = (body as { url?: unknown }).url;
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== STRIPE_HOSTED_CHECKOUT_ORIGIN) return null;
  return parsed.toString();
}
