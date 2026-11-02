/**
 * Verifies a Stripe test-mode webhook, then asks the caller to apply one
 * already-decided payload. A bad signature, a live-mode event, or a Founder
 * plan never reaches applyEvent.
 */
import {
  decideStripeWebhookAction,
  type StripeWebhookApplyPayload,
} from "@/lib/stripeWebhookEventRules";
import { verifyStripeWebhookSignature } from "@/lib/stripeWebhookSignatureRules";

export interface StripeWebhookDeps {
  getSecret: () => string | undefined;
  applyEvent: (payload: StripeWebhookApplyPayload) => Promise<{ ok: boolean; reason: string }>;
}

export async function runStripeWebhook(
  input: { rawBody: string; signatureHeader: string | null; nowMs: number },
  deps: StripeWebhookDeps,
): Promise<{ status: number; body: { error: string } | { received: true } }> {
  const verified = await verifyStripeWebhookSignature({
    rawBody: input.rawBody,
    header: input.signatureHeader,
    secret: deps.getSecret() ?? "",
    nowMs: input.nowMs,
  });
  if (!verified.ok) return { status: 400, body: { error: "invalid_signature" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "malformed" } };
  }

  if (
    parsed != null &&
    typeof parsed === "object" &&
    (parsed as { livemode?: unknown }).livemode === true
  ) {
    return { status: 400, body: { error: "live_mode_refused" } };
  }

  const decision = decideStripeWebhookAction(parsed);
  if (decision.kind === "refuse") return { status: 400, body: { error: decision.error } };
  if (decision.kind === "ignore") return { status: 200, body: { received: true } };

  let applied: { ok: boolean; reason: string };
  try {
    applied = await deps.applyEvent(decision.payload);
  } catch {
    return { status: 500, body: { error: "webhook_unavailable" } };
  }
  if (!applied.ok) {
    if (applied.reason === "plan_retired" || applied.reason === "live_mode_refused") {
      return { status: 400, body: { error: applied.reason } };
    }
    return { status: 500, body: { error: "webhook_unavailable" } };
  }
  return { status: 200, body: { received: true } };
}
