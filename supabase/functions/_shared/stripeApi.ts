/**
 * Minimal Stripe REST client for Edge functions: form-encoded requests with a
 * server-held secret key. No SDK, no retries, no logging of bodies or keys.
 *
 * Callers own every decision; this file only moves bytes. A non-2xx response
 * is returned as { ok: false } with the HTTP status and no upstream text, so
 * nothing from Stripe can leak into a client response by accident.
 */

export const STRIPE_API_BASE = "https://api.stripe.com/v1";

export type StripeApiResult = { ok: true; body: unknown } | { ok: false; status: number };

export async function stripeRequest(input: {
  secretKey: string;
  method: "GET" | "POST";
  path: string;
  form?: ReadonlyArray<readonly [string, string]>;
  /** Stripe Idempotency-Key for a POST, so a repeat returns the first result. */
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<StripeApiResult> {
  const { secretKey, method, path, form, idempotencyKey, fetchImpl = fetch } = input;
  if (!path.startsWith("/") || path.includes("..")) return { ok: false, status: 0 };
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    body = new URLSearchParams(form ? form.map(([k, v]) => [k, v]) : []).toString();
  }
  let response: Response;
  try {
    response = await fetchImpl(`${STRIPE_API_BASE}${path}`, { method, headers, body });
  } catch {
    return { ok: false, status: 0 };
  }
  if (!response.ok) return { ok: false, status: response.status };
  const parsed = await response.json().catch(() => null);
  if (parsed === null) return { ok: false, status: response.status };
  return { ok: true, body: parsed };
}
