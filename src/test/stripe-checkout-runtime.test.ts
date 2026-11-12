/**
 * Slice B (docs/specs/stripe-live-checkout-plan.md): runs the real
 * stripe-checkout Edge entry point. TypeScript transpiles the Deno module and
 * the loader substitutes only external IO (Supabase client, fetch), the same
 * approach as get-paddle-price-founder-retired-runtime.test.ts. No server,
 * credential, Stripe request or database is involved.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

type Row = Record<string, unknown>;
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
// Built from parts so secret scanners do not mistake the fixture for a key.
const LIVE_KEY = ["rk", "live", "fixture000"].join("_");

function loadHandler(options: { subscriptionRows?: Row[]; env?: Record<string, string> } = {}) {
  const stripeCalls: Array<{ url: string; body: string }> = [];
  const warnings: Row[] = [];
  const env = new Map(
    Object.entries({
      SUPABASE_URL: "https://fixture.invalid",
      SUPABASE_ANON_KEY: "fixture-anon",
      PAYMENTS_ENVIRONMENT: "live",
      STRIPE_SECRET_KEY: LIVE_KEY,
      STRIPE_PRICE_PRO_MONTHLY_LIVE: "price_liveMonthly1",
      ...options.env,
    }),
  );
  const rows = options.subscriptionRows ?? [];
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER, email: "grower@example.com" } },
        error: null,
      }),
    },
    from: () => query,
  };
  const fetchFixture = async (url: string, init: { body?: string }) => {
    stripeCalls.push({ url, body: init.body ?? "" });
    return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_live_fx1" }), {
      status: 200,
    });
  };
  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    Request,
    Response,
    URL,
    URLSearchParams,
    JSON,
    Date,
    fetch: fetchFixture,
    console: { log() {}, error() {}, warn: (line: string) => warnings.push(JSON.parse(line)) },
    Deno: {
      env: { get: (key: string) => env.get(key) },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
  });
  const modules = new Map<string, { exports: Row }>();
  function load(file: string): Row {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    const mod = { exports: {} as Row };
    modules.set(file, mod);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const requireFixture = (name: string) => {
      if (name === "npm:@supabase/supabase-js@2/cors") return { corsHeaders: {} };
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      return load(resolve(dirname(file), name));
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  }
  load(resolve(process.cwd(), "supabase/functions/stripe-checkout/index.ts"));

  async function request(body: unknown, headers: Record<string, string> = {}) {
    const res = await handler(
      new Request("https://fixture.invalid/functions/v1/stripe-checkout", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-jwt",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Row };
  }
  return { request, stripeCalls, warnings };
}

describe("stripe-checkout Edge function", () => {
  it("starts a live Pro checkout bound to the verified user, not the body", async () => {
    const h = loadHandler();
    const res = await h.request({ plan: "pro_monthly", user_id: "attacker-chosen" });
    expect(res).toEqual({
      status: 200,
      body: { url: "https://checkout.stripe.com/c/pay/cs_live_fx1" },
    });
    expect(h.stripeCalls).toHaveLength(1);
    expect(h.stripeCalls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const form = new URLSearchParams(h.stripeCalls[0].body);
    expect(form.get("client_reference_id")).toBe(USER);
    expect(form.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(h.stripeCalls[0].body).not.toContain("attacker-chosen");
  });

  it("refuses an unsigned caller before any Stripe call", async () => {
    const h = loadHandler();
    const res = await h.request({ plan: "pro_monthly" }, { Authorization: "" });
    expect(res).toEqual({ status: 401, body: { error: "auth_required" } });
    expect(h.stripeCalls).toEqual([]);
  });

  it("refuses Founder Lifetime and Craft before any Stripe call", async () => {
    const h = loadHandler();
    for (const plan of ["founder_lifetime", "craft_monthly"]) {
      expect(await h.request({ plan })).toEqual({ status: 400, body: { error: "plan_not_sold" } });
    }
    expect(h.stripeCalls).toEqual([]);
  });

  it("stays off when the plan's price env is unset, without naming the cause", async () => {
    const h = loadHandler();
    expect(await h.request({ plan: "pro_annual" })).toEqual({
      status: 503,
      body: { error: "checkout_unavailable" },
    });
    expect(h.stripeCalls).toEqual([]);
    expect(h.warnings).toEqual([
      { event: "stripe_checkout_refused", reason: "price_not_configured", environment: "live" },
    ]);
  });

  it("refuses when PAYMENTS_ENVIRONMENT is not explicitly set", async () => {
    const h = loadHandler({ env: { PAYMENTS_ENVIRONMENT: "" } });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 503,
      body: { error: "checkout_unavailable" },
    });
    expect(h.stripeCalls).toEqual([]);
  });

  it("refuses a second Pro checkout for a caller who already has active Pro", async () => {
    const h = loadHandler({
      subscriptionRows: [
        {
          id: "row-1",
          user_id: USER,
          billing_provider: "stripe",
          stripe_subscription_id: "sub_A1",
          stripe_customer_id: "cus_A1",
          paddle_subscription_id: null,
          paddle_customer_id: null,
          product_id: "prod_Pro1",
          price_id: "pro_monthly",
          status: "active",
          current_period_end: "2099-01-01T00:00:00.000Z",
          environment: "live",
          created_at: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 409,
      body: { error: "already_subscribed" },
    });
    expect(h.stripeCalls).toEqual([]);
  });
});
