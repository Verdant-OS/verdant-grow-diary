/**
 * The Stripe test-mode migration is SQL, so Vitest cannot import it.
 * @source-scan-justified: migration SQL is not a TypeScript module; this test pins the reviewed contract of the new file and the money-migration allowlist.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
} from "../../scripts/required-money-migrations.mjs";

const MIGRATION = "20261101180000_stripe_test_mode_subscription_sink.sql";
const PATH = `supabase/migrations/${MIGRATION}`;

function sql(): string {
  return existsSync(PATH) ? readFileSync(PATH, "utf8") : "";
}

describe("stripe test-mode migration contract", () => {
  it("is known to the money firewall and is not a required production apply", () => {
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
    expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(MIGRATION);
  });

  it("adds stripe columns, sandbox customer reuse, and an idempotent event id", () => {
    const text = sql();
    expect(text).toContain("ADD COLUMN IF NOT EXISTS provider text");
    expect(text).toContain("stripe_customer_id");
    expect(text).toContain("stripe_subscription_id");
    expect(text).toContain("CREATE TABLE public.stripe_test_customers");
    expect(text).toContain("CREATE TABLE public.stripe_webhook_events");
    expect(text).toContain("event_id text NOT NULL UNIQUE");
    expect(text).toContain("ENABLE ROW LEVEL SECURITY");
    expect(text).toContain("environment = 'sandbox'");
  });

  it("grants packs through the existing function and never allocates Founder", () => {
    const text = sql();
    expect(text).toContain("grant_lovable_credit_pack");
    expect(text).toContain("credit_pack_50");
    expect(text).toContain("credit_pack_150");
    expect(text).toContain("founder_lifetime");
    expect(text).toContain("plan_retired");
    expect(text).not.toContain("allocate_lovable_founder");
    expect(text).not.toContain("billing_subscriptions");
    expect(text).toContain("SET search_path = public, pg_temp");
    expect(text).toContain("GRANT EXECUTE ON FUNCTION public.apply_stripe_test_mode_event");
    expect(text).toContain("TO service_role");
    expect(text).toContain("REVOKE ALL ON FUNCTION public.apply_stripe_test_mode_event");
  });
});
