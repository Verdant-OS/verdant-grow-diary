/**
 * Slice C (docs/specs/stripe-live-checkout-plan.md): the Stripe subscription
 * webhook's signature check, row mapping and orchestration, run against
 * in-memory ports. No server, Stripe account, key or database is involved.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildStripePriceToPlanMap,
  buildStripeSubscriptionRow,
  mapStripeSubscriptionStatus,
  parseStripeSignatureHeader,
  subscriptionIdFromEvent,
  verifyStripeSignature,
  type StripeSubscriptionRowWrite,
} from "../../supabase/functions/_shared/stripeWebhookRules.ts";
import {
  processStripeWebhook,
  type StripeWebhookPorts,
} from "../../supabase/functions/_shared/stripeWebhookProcessor.ts";

// Built from parts so secret scanners do not mistake fixtures for keys.
const fixtureSecret = (name: string) => ["whsec", name].join("_");
const SECRET = fixtureSecret("fixtureOnly");
const LIVE_KEY = ["rk", "live", "fixture000"].join("_");
const TEST_KEY = ["sk", "test", "fixture000"].join("_");
const NOW = 1_794_500_000;
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_USER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const PRICE_MONTHLY = "price_liveMonthly1";
const PRICE_ANNUAL = "price_liveAnnual1";
const ENV: Record<string, string> = {
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_SECRET_KEY: LIVE_KEY,
  STRIPE_PRICE_PRO_MONTHLY_LIVE: PRICE_MONTHLY,
  STRIPE_PRICE_PRO_ANNUAL_LIVE: PRICE_ANNUAL,
};

function sign(body: string, t = NOW, secret = SECRET): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_A1",
    object: "subscription",
    livemode: true,
    customer: "cus_A1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { user_id: USER, plan_key: "pro_monthly" },
    items: {
      data: [
        {
          price: { id: PRICE_MONTHLY, product: "prod_Pro1" },
          current_period_start: NOW - 100,
          current_period_end: NOW + 30 * 86_400,
        },
      ],
    },
    ...overrides,
  };
}

function event(type: string, object: Record<string, unknown>, livemode = true) {
  return JSON.stringify({ id: "evt_1", type, livemode, data: { object } });
}

const priceToPlan = buildStripePriceToPlanMap("live", (n) => ENV[n]);

describe("Stripe-Signature header", () => {
  it("reads the timestamp and every v1 signature", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(parseStripeSignatureHeader(`t=123,v1=${a},v0=${b},v1=${b}`)).toEqual({
      timestamp: 123,
      signatures: [a, b],
    });
  });

  it("rejects headers without a timestamp or a well-formed v1", () => {
    expect(parseStripeSignatureHeader("v1=" + "a".repeat(64))).toBeNull();
    expect(parseStripeSignatureHeader("t=123,v1=nothex")).toBeNull();
    expect(parseStripeSignatureHeader("")).toBeNull();
    expect(parseStripeSignatureHeader(undefined)).toBeNull();
  });
});

describe("verifyStripeSignature", () => {
  const body = event("customer.subscription.updated", subscription());
  const verify = (rawBody: string, header: string | null, secret = SECRET) =>
    verifyStripeSignature({ rawBody, header, secret, nowSeconds: NOW });

  it("accepts the exact raw body signed with the endpoint secret", async () => {
    await expect(verify(body, sign(body))).resolves.toEqual({ ok: true });
  });

  it("accepts during secret rotation when any v1 matches", async () => {
    const header = `${sign(body, NOW, fixtureSecret("old"))},v1=${sign(body).split("v1=")[1]}`;
    await expect(verify(body, header)).resolves.toEqual({ ok: true });
  });

  it("refuses a body changed after signing", async () => {
    await expect(verify(body + " ", sign(body))).resolves.toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
  });

  it("refuses the wrong secret, a stale timestamp and a future one", async () => {
    await expect(verify(body, sign(body, NOW, fixtureSecret("other")))).resolves.toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
    await expect(verify(body, sign(body, NOW - 301))).resolves.toEqual({
      ok: false,
      reason: "timestamp_too_old",
    });
    await expect(verify(body, sign(body, NOW + 61))).resolves.toEqual({
      ok: false,
      reason: "timestamp_in_future",
    });
  });

  it("fails closed with no secret or no header", async () => {
    await expect(verify(body, sign(body), "")).resolves.toEqual({
      ok: false,
      reason: "secret_missing",
    });
    await expect(verify(body, null)).resolves.toEqual({ ok: false, reason: "header_missing" });
  });
});

describe("event and status mapping", () => {
  const parse = (s: string) => subscriptionIdFromEvent(JSON.parse(s));

  it("finds the subscription for subscription sessions and subscription events only", () => {
    expect(
      parse(event("checkout.session.completed", { mode: "subscription", subscription: "sub_A1" })),
    ).toBe("sub_A1");
    expect(
      parse(event("checkout.session.completed", { mode: "payment", payment_intent: "pi_1" })),
    ).toBeNull();
    expect(parse(event("customer.subscription.deleted", { id: "sub_A1" }))).toBe("sub_A1");
    expect(parse(event("customer.subscription.updated", { id: "not-a-sub" }))).toBeNull();
  });

  it("records only statuses the table allows, and never grants on unpaid", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("expired");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("expired");
    expect(mapStripeSubscriptionStatus("incomplete")).toBeNull();
    expect(mapStripeSubscriptionStatus("something_new")).toBeNull();
  });

  it("maps only server-configured, well-formed price ids", () => {
    expect([...buildStripePriceToPlanMap("live", (n) => ENV[n])]).toEqual([
      [PRICE_MONTHLY, "pro_monthly"],
      [PRICE_ANNUAL, "pro_annual"],
    ]);
    expect(buildStripePriceToPlanMap("sandbox", (n) => ENV[n]).size).toBe(0);
  });
});

describe("buildStripeSubscriptionRow", () => {
  const build = (overrides: Record<string, unknown> = {}) =>
    buildStripeSubscriptionRow({
      subscription: subscription(overrides),
      environment: "live",
      priceToPlan,
    });

  it("writes a Stripe row keyed by readable plan key, with no Paddle identity", () => {
    expect(build()).toEqual({
      ok: true,
      row: {
        user_id: USER,
        billing_provider: "stripe",
        stripe_subscription_id: "sub_A1",
        stripe_customer_id: "cus_A1",
        paddle_subscription_id: null,
        paddle_customer_id: null,
        product_id: "prod_Pro1",
        price_id: "pro_monthly",
        status: "active",
        current_period_start: new Date((NOW - 100) * 1000).toISOString(),
        current_period_end: new Date((NOW + 30 * 86_400) * 1000).toISOString(),
        cancel_at_period_end: false,
        environment: "live",
      },
    });
  });

  it("reads the period from the subscription itself on older API versions", () => {
    const built = build({ current_period_end: NOW + 10 });
    expect(built.ok && built.row.current_period_end).toBe(
      new Date((NOW + 10) * 1000).toISOString(),
    );
  });

  it("ends access when an immediate cancel ended the subscription", () => {
    const built = build({ status: "canceled", ended_at: NOW });
    expect(built.ok && built.row.status).toBe("canceled");
    expect(built.ok && built.row.current_period_end).toBe(new Date(NOW * 1000).toISOString());
  });

  it("skips anything it cannot attribute or price, instead of guessing", () => {
    const skip = (overrides: Record<string, unknown>) => {
      const built = build(overrides);
      return built.ok ? "wrote" : built.reason;
    };
    expect(skip({ metadata: {} })).toBe("user_id_missing");
    expect(skip({ metadata: { user_id: "user-1" } })).toBe("user_id_invalid");
    expect(skip({ customer: null })).toBe("customer_missing");
    expect(
      skip({ items: { data: [{ price: { id: "price_unknown" }, current_period_end: NOW }] } }),
    ).toBe("price_unmapped");
    expect(skip({ items: { data: [] } })).toBe("item_count_unsupported");
    expect(skip({ status: "incomplete" })).toBe("status_not_recorded");
    expect(skip({ items: { data: [{ price: { id: PRICE_MONTHLY } }] } })).toBe(
      "period_end_missing",
    );
    expect(skip({ livemode: false })).toBe("livemode_mismatch");
    expect(skip({ object: "invoice" })).toBe("not_a_subscription");
  });
});

function harness(
  options: {
    stripeState?: unknown;
    existingOwner?: string | null;
    writeOk?: boolean;
    /** Hold the first fetch after it has read Stripe, until release(). */
    holdFirstFetch?: boolean;
  } = {},
) {
  // The subscriptions table, keyed on (environment, stripe_subscription_id),
  // with the same conditional semantics as the real ports.
  const table = new Map<string, StripeSubscriptionRowWrite>();
  const keyOf = (row: StripeSubscriptionRowWrite) =>
    `${row.environment}:${row.stripe_subscription_id}`;
  const writes: StripeSubscriptionRowWrite[] = [];
  const fetches: string[] = [];
  const logs: Record<string, string>[] = [];
  let state: unknown = options.stripeState ?? subscription();
  let held = options.holdFirstFetch === true;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markHeld: () => void = () => {};
  const heldRead = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const store = (row: StripeSubscriptionRowWrite) => {
    table.set(keyOf(row), row);
    writes.push(row);
  };
  const ports: StripeWebhookPorts = {
    getEnv: (n) => ENV[n],
    resolveEnvironment: () => ({ ok: true, environment: "live" }),
    nowSeconds: () => NOW,
    fetchSubscription: async (_key, id) => {
      fetches.push(id);
      const snapshot = typeof state === "function" ? (state as () => unknown)() : state;
      if (held) {
        held = false;
        markHeld();
        await gate;
      }
      return snapshot === "down" ? { ok: false } : { ok: true, body: snapshot };
    },
    findExistingOwner: async (environment, id) => {
      if (options.existingOwner === "down") return { ok: false };
      if (options.existingOwner !== undefined) return { ok: true, userId: options.existingOwner };
      return { ok: true, userId: table.get(`${environment}:${id}`)?.user_id ?? null };
    },
    upsertRow: async (row) => {
      if (options.writeOk === false) return { ok: false };
      store(row);
      return { ok: true };
    },
    updateRowUnlessCanceled: async (row) => {
      if (options.writeOk === false) return { ok: false };
      const existing = table.get(keyOf(row));
      if (!existing || existing.user_id !== row.user_id || existing.status === "canceled") {
        return { ok: true, matched: false };
      }
      store(row);
      return { ok: true, matched: true };
    },
    insertRowIfAbsent: async (row) => {
      if (options.writeOk === false) return { ok: false };
      if (!table.has(keyOf(row))) store(row);
      return { ok: true };
    },
    log: (fields) => logs.push(fields),
  };
  return {
    ports,
    table,
    writes,
    fetches,
    logs,
    release: () => release(),
    /** Resolves once the held delivery has read its (soon stale) snapshot. */
    heldRead,
    setStripeState: (next: unknown) => {
      state = next;
    },
    deliver: (body: string, header = sign(body)) =>
      processStripeWebhook({ rawBody: body, signatureHeader: header }, ports),
  };
}

describe("processStripeWebhook", () => {
  const completed = event("checkout.session.completed", {
    mode: "subscription",
    subscription: "sub_A1",
  });

  it("records the re-read subscription after a valid signed event", async () => {
    const h = harness();
    await expect(h.deliver(completed)).resolves.toEqual({ status: 200, outcome: "recorded" });
    // Read once to build the row, once more after writing to confirm it settled.
    expect(h.fetches).toEqual(["sub_A1", "sub_A1"]);
    expect(h.writes.map((w) => [w.price_id, w.status])).toEqual([["pro_monthly", "active"]]);
  });

  it("writes nothing and calls nothing when the signature is bad", async () => {
    const h = harness();
    const result = await h.deliver(completed, sign(completed, NOW, fixtureSecret("forged")));
    expect(result).toEqual({ status: 400, outcome: "rejected_signature_mismatch" });
    expect(h.fetches).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  it("answers 503 so Stripe retries when the endpoint secret is not configured", async () => {
    const h = harness();
    h.ports.getEnv = (n) => (n === "STRIPE_WEBHOOK_SECRET" ? undefined : ENV[n]);
    await expect(h.deliver(completed)).resolves.toEqual({
      status: 503,
      outcome: "rejected_secret_missing",
    });
  });

  it("refuses a test-mode event on the live endpoint", async () => {
    const h = harness();
    const testEvent = event("customer.subscription.updated", { id: "sub_A1" }, false);
    await expect(h.deliver(testEvent)).resolves.toEqual({
      status: 400,
      outcome: "rejected_livemode_mismatch",
    });
    expect(h.fetches).toEqual([]);
  });

  it("acknowledges unhandled types and one-time payments without writing", async () => {
    const h = harness();
    await expect(h.deliver(event("invoice.paid", { id: "in_1" }))).resolves.toEqual({
      status: 200,
      outcome: "ignored_event_type",
    });
    await expect(
      h.deliver(event("checkout.session.completed", { mode: "payment", payment_intent: "pi_1" })),
    ).resolves.toEqual({ status: 200, outcome: "ignored_not_subscription" });
    expect(h.writes).toEqual([]);
  });

  it("is idempotent: a duplicate delivery writes the same row again", async () => {
    const h = harness();
    await h.deliver(completed);
    await h.deliver(completed);
    expect(h.writes).toHaveLength(2);
    expect(h.writes[0]).toEqual(h.writes[1]);
  });

  it("writes current state when an older event arrives after a newer one", async () => {
    const h = harness();
    h.setStripeState(subscription({ status: "canceled", ended_at: NOW }));
    await h.deliver(event("customer.subscription.deleted", { id: "sub_A1" }));
    // The stale 'created' event arrives late; Stripe still says canceled.
    await h.deliver(event("customer.subscription.created", { id: "sub_A1", status: "active" }));
    expect(h.writes.map((w) => w.status)).toEqual(["canceled", "canceled"]);
  });

  it("never lets an overlapping older delivery restore access after a cancellation", async () => {
    const h = harness({ holdFirstFetch: true });
    // Delivery A reads Stripe while the subscription is still active, then stalls.
    const stale = h.deliver(event("customer.subscription.updated", { id: "sub_A1" }));
    await h.heldRead;
    // Delivery B runs after the grower cancels and records the cancellation.
    h.setStripeState(subscription({ status: "canceled", ended_at: NOW }));
    await expect(
      h.deliver(event("customer.subscription.deleted", { id: "sub_A1" })),
    ).resolves.toEqual({ status: 200, outcome: "recorded" });
    // A resumes with its active snapshot: it must not overwrite the row.
    h.release();
    await expect(stale).resolves.toEqual({ status: 200, outcome: "recorded" });
    const row = h.table.get("live:sub_A1");
    expect(row?.status).toBe("canceled");
    expect(row?.current_period_end).toBe(new Date(NOW * 1000).toISOString());
    expect(h.writes.some((w) => w.status === "active")).toBe(false);
  });

  it("rewrites the newer state when an older non-final snapshot lands last", async () => {
    const h = harness({
      holdFirstFetch: true,
      stripeState: subscription({ status: "past_due" }),
    });
    const stale = h.deliver(event("customer.subscription.updated", { id: "sub_A1" }));
    await h.heldRead;
    h.setStripeState(subscription({ status: "active" }));
    await h.deliver(event("customer.subscription.updated", { id: "sub_A1" }));
    h.release();
    await expect(stale).resolves.toEqual({ status: 200, outcome: "recorded" });
    // A wrote past_due over active, re-read Stripe, and put active back.
    expect(h.writes.map((w) => w.status)).toEqual(["active", "past_due", "active"]);
    expect(h.table.get("live:sub_A1")?.status).toBe("active");
  });

  it("asks Stripe to redeliver when the subscription keeps changing under it", async () => {
    let flip = false;
    const h = harness({
      stripeState: () => {
        flip = !flip;
        return subscription({ status: flip ? "active" : "past_due" });
      },
    });
    await expect(h.deliver(completed)).resolves.toEqual({
      status: 503,
      outcome: "snapshot_unsettled",
    });
    expect(h.writes).toHaveLength(3);
  });

  it("never reassigns a subscription row to another user", async () => {
    const h = harness({ existingOwner: OTHER_USER });
    await expect(h.deliver(completed)).resolves.toEqual({
      status: 200,
      outcome: "skipped_identity_conflict",
    });
    expect(h.writes).toEqual([]);
  });

  it("acknowledges an unmapped price without writing an entitling row", async () => {
    const h = harness({
      stripeState: subscription({
        items: { data: [{ price: { id: "price_other" }, current_period_end: NOW }] },
      }),
    });
    await expect(h.deliver(completed)).resolves.toEqual({
      status: 200,
      outcome: "skipped_price_unmapped",
    });
    expect(h.writes).toEqual([]);
  });

  it("asks Stripe to retry when Stripe, the database or the key is unavailable", async () => {
    await expect(harness({ stripeState: "down" }).deliver(completed)).resolves.toEqual({
      status: 502,
      outcome: "stripe_unavailable",
    });
    await expect(harness({ existingOwner: "down" }).deliver(completed)).resolves.toEqual({
      status: 500,
      outcome: "database_unavailable",
    });
    await expect(harness({ writeOk: false }).deliver(completed)).resolves.toEqual({
      status: 500,
      outcome: "database_unavailable",
    });
    const h = harness();
    h.ports.getEnv = (n) => (n === "STRIPE_SECRET_KEY" ? TEST_KEY : ENV[n]);
    await expect(h.deliver(completed)).resolves.toEqual({
      status: 503,
      outcome: "secret_key_unavailable",
    });
  });

  it("logs a fixed outcome with no ids, keys or user data", async () => {
    const h = harness();
    await h.deliver(completed);
    expect(h.logs).toEqual([{ event: "stripe_webhook", outcome: "recorded", environment: "live" }]);
  });
});
