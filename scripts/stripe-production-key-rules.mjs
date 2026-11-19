// Pure rules for the production payments client key. Production accepts exactly
// one well-formed live Stripe publishable key. Results carry fixed reason codes
// only; key bytes never appear in a reason.

export const PAYMENTS_KEY_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";

const ASSIGNMENT = /^(?:export\s+)?VITE_PAYMENTS_CLIENT_TOKEN\s*=(.*)$/u;
const LIVE_STRIPE_KEY = /^pk_live_[A-Za-z0-9]{24,247}$/u;
const TEST_STRIPE_KEY = /^pk_test_[A-Za-z0-9]+$/u;
const PADDLE_TOKEN = /^(?:live|test)_[A-Za-z0-9]+$/u;

function unquote(raw) {
  const value = raw.trim();
  if (value.length === 0) return { ok: false };
  const first = value[0];
  if (first === '"' || first === "'") {
    if (value.length < 2 || value[value.length - 1] !== first) return { ok: false };
    return { ok: true, value: value.slice(1, -1) };
  }
  if (/[\s"'#]/u.test(value)) return { ok: false };
  return { ok: true, value };
}

/** Classify a single key value (already unquoted). */
export function classifyStripeProductionKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: "stripe_key_invalid" };
  }
  if (LIVE_STRIPE_KEY.test(value)) return { ok: true, key: value };
  if (TEST_STRIPE_KEY.test(value)) return { ok: false, reason: "stripe_key_not_live" };
  if (PADDLE_TOKEN.test(value)) return { ok: false, reason: "stripe_key_not_stripe" };
  return { ok: false, reason: "stripe_key_invalid" };
}

/** Resolve the one canonical assignment from .env.production text. */
export function resolveCanonicalStripeLiveKey(text) {
  if (typeof text !== "string") return { ok: false, reason: "canonical_stripe_key_invalid" };
  const values = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = ASSIGNMENT.exec(line.trim());
    if (match) values.push(match[1]);
  }
  if (values.length !== 1) return { ok: false, reason: "canonical_stripe_key_count_invalid" };
  const unquoted = unquote(values[0]);
  if (!unquoted.ok) return { ok: false, reason: "canonical_stripe_key_invalid" };
  const classified = classifyStripeProductionKey(unquoted.value);
  if (!classified.ok) return { ok: false, reason: `canonical_${classified.reason}` };
  return classified;
}
