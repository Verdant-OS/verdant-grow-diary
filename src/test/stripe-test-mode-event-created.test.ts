/**
 * Pins Stripe event.created on the test-mode sink.
 * @source-scan-justified: the migration and the Deno webhook entry are not Vitest modules; this file pins event time storage and the older non-cancel guard.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261101180000_stripe_test_mode_subscription_sink.sql";
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";

function between(text: string, start: string, end: string | null): string {
  const from = text.indexOf(start);
  if (from < 0) return "";
  if (end === null) return text.slice(from);
  const to = text.indexOf(end, from + start.length);
  return to < 0 ? "" : text.slice(from, to);
}

describe("stripe test-mode event.created", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const webhook = readFileSync(WEBHOOK, "utf8");
  const audit = between(
    sql,
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_subscription_with_audit(",
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_event(",
  );
  const event = between(
    sql,
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_event(",
    null,
  );

  it("reads event.created from the verified webhook body", () => {
    expect(webhook).toContain("function stripeEventCreatedIso(rawBody: string, eventId: string)");
    expect(webhook).toContain("record.id !== eventId");
    expect(webhook).toContain("p_event_created: stripeEventCreatedIso(rawBody, payload.eventId)");
  });

  it("stores event.created and ignores an older non-cancel event", () => {
    expect(sql).toContain("event_created timestamptz");
    expect(sql).toContain("CREATE TABLE public.stripe_test_mode_subscription_clock");
    expect(event).toContain("p_event_created timestamptz");
    expect(event).toContain(
      "INSERT INTO public.stripe_webhook_events (event_id, event_type, action, result, details, environment, event_created)",
    );
    expect(audit).toContain("p_action IS DISTINCT FROM 'cancel_subscription'");
    expect(audit).toContain("p_event_created < v_latest");
    expect(audit).toContain("v_reason := 'stale_event'");
    expect(event).toContain("'reason', 'stale_event'");
  });

  it("still applies an older cancel", () => {
    expect(audit).toContain("INSERT INTO public.stripe_test_mode_canceled_subscriptions");
    expect(audit).toContain("p_action = 'cancel_subscription'");
    expect(audit).not.toContain("p_action = 'cancel_subscription' AND p_event_created < v_latest");
  });
});
