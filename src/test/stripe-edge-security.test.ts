/**
 * Edge entrypoints and config.toml are not importable under Vitest.
 * @source-scan-justified: Deno function entries and the function JWT map are read as deployed text; behavior of the checkout decision lives in the orchestrator tests.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("stripe edge posture", () => {
  it("verifies the caller JWT on checkout and leaves the webhook unsigned at the gateway", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/\[functions\.create-checkout-session\]\s+verify_jwt = true/);
    expect(config).toMatch(/\[functions\.stripe-webhook\]\s+verify_jwt = false/);
  });

  it("wires checkout through the orchestrator and does not embed a live key", () => {
    const checkout = read("supabase/functions/create-checkout-session/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    expect(checkout).toContain("runCreateCheckoutSession");
    expect(checkout).toContain("auth.getUser");
    expect(checkout).not.toContain("sk_live_");
    expect(checkout).not.toContain("sk_test_");
    expect(webhook).toContain("runStripeWebhook");
    expect(webhook).toContain("apply_stripe_test_mode_event");
    expect(webhook).not.toContain("sk_live_");
    expect(webhook).not.toContain("allocate_lovable_founder");
  });
});
