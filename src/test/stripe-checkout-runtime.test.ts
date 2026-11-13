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

type StripeCall = { method: string; path: string; body: string; idempotencyKey: string | null };

function loadHandler(
  options: {
    subscriptionRows?: Row[];
    env?: Record<string, string>;
    price?: Row;
    searchCustomers?: Row[];
    stripeSubscriptions?: Row[];
    openSessions?: Row[];
    /** Another tab's session that appears right after ours is created. */
    racingSession?: Row;
  } = {},
) {
  const stripeCalls: StripeCall[] = [];
  const warnings: Row[] = [];
  const errors: Row[] = [];
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
  const price = options.price ?? {
    object: "price",
    active: true,
    livemode: true,
    currency: "usd",
    type: "recurring",
    unit_amount: 1200,
    recurring: { interval: "month", interval_count: 1 },
  };
  // Checkout Sessions as Stripe holds them; `created` counts up from 100.
  const sessions: Row[] = (options.openSessions ?? []).map((session) => ({ ...session }));
  const idempotency = new Map<string, { body: string; session: Row }>();
  let clock = 100;
  const fetchFixture = async (
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> },
  ) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v1/, "");
    const method = init.method ?? "GET";
    stripeCalls.push({
      method,
      path: `${path}${parsed.search}`,
      body: init.body ?? "",
      idempotencyKey: init.headers?.["Idempotency-Key"] ?? null,
    });
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method === "GET" && path === "/prices/price_liveAnnual1") {
      return reply({
        ...price,
        unit_amount: 9900,
        recurring: { interval: "year", interval_count: 1 },
      });
    }
    if (method === "GET" && path.startsWith("/prices/")) return reply(price);
    if (method === "GET" && path === "/customers/search") {
      return reply({ data: options.searchCustomers ?? [] });
    }
    if (method === "POST" && path === "/customers") return reply({ id: "cus_new1" });
    if (method === "GET" && path === "/subscriptions") {
      return reply({ data: options.stripeSubscriptions ?? [] });
    }
    if (method === "GET" && path === "/checkout/sessions") {
      return reply({ data: sessions.filter((session) => session.status === "open") });
    }
    const expire = /^\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)\/expire$/.exec(path);
    if (method === "POST" && expire) {
      const session = sessions.find((candidate) => candidate.id === expire[1]);
      if (session) session.status = "expired";
      return reply({ status: "expired" });
    }
    if (method === "POST" && path === "/checkout/sessions") {
      // Stripe's idempotency: same key and body replays the session, same
      // key with a different body is refused.
      const key = init.headers?.["Idempotency-Key"] ?? "";
      const seen = idempotency.get(key);
      if (seen) {
        if (seen.body !== (init.body ?? "")) {
          return new Response(JSON.stringify({ error: { type: "idempotency_error" } }), {
            status: 400,
          });
        }
        return reply(seen.session);
      }
      const form = new URLSearchParams(init.body ?? "");
      clock += 1;
      const id = `cs_live_fx${clock}`;
      const session: Row = {
        id,
        object: "checkout.session",
        status: "open",
        created: clock,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        expires_at: Number(form.get("expires_at")),
        metadata: {
          plan_key: form.get("metadata[plan_key]"),
          user_id: form.get("metadata[user_id]"),
        },
      };
      sessions.push(session);
      idempotency.set(key, { body: init.body ?? "", session });
      if (options.racingSession) sessions.push({ status: "open", ...options.racingSession });
      return reply(session);
    }
    return new Response("{}", { status: 404 });
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
    console: {
      log() {},
      error: (line: string) => errors.push(JSON.parse(line)),
      warn: (line: string) => warnings.push(JSON.parse(line)),
    },
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
  const openSessionIds = () =>
    sessions.filter((session) => session.status === "open").map((session) => session.id);
  return { request, stripeCalls, warnings, errors, openSessionIds };
}

describe("stripe-checkout Edge function", () => {
  it("starts a live Pro checkout bound to the verified user, not the body", async () => {
    const h = loadHandler();
    const res = await h.request({ plan: "pro_monthly", user_id: "attacker-chosen" });
    expect(res).toEqual({
      status: 200,
      body: { url: "https://checkout.stripe.com/c/pay/cs_live_fx101" },
    });
    const session = h.stripeCalls.find((c) => c.path === "/checkout/sessions");
    expect(session).toBeDefined();
    const form = new URLSearchParams(session!.body);
    expect(form.get("client_reference_id")).toBe(USER);
    expect(form.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(form.get("customer")).toBe("cus_new1");
    for (const call of h.stripeCalls) expect(call.body).not.toContain("attacker-chosen");
  });

  it("checks the price, finds or creates one customer, then checks for a live subscription", async () => {
    const h = loadHandler();
    await h.request({ plan: "pro_monthly" });
    expect(h.stripeCalls.map((c) => `${c.method} ${c.path.split("?")[0]}`)).toEqual([
      "GET /prices/price_liveMonthly1",
      "GET /customers/search",
      "POST /customers",
      "GET /subscriptions",
      "GET /checkout/sessions",
      "POST /checkout/sessions",
      "GET /checkout/sessions",
    ]);
    const create = h.stripeCalls.find((c) => c.path === "/customers")!;
    expect(new URLSearchParams(create.body).get("metadata[user_id]")).toBe(USER);
    // No email in the create, so an email change cannot clash with the key.
    expect(new URLSearchParams(create.body).has("email")).toBe(false);
    const session = h.stripeCalls.find(
      (c) => c.method === "POST" && c.path === "/checkout/sessions",
    )!;
    const expiresAt = Number(new URLSearchParams(session.body).get("expires_at"));
    const lifetime = expiresAt - Math.floor(Date.now() / 1000);
    expect(lifetime).toBeGreaterThanOrEqual(31 * 60);
    expect(lifetime).toBeLessThanOrEqual(42 * 60);
    expect(create.idempotencyKey).toBe(`verdant-customer-live-${USER}`);
  });

  it("gives two quick starts the same Stripe idempotency key, so one session", async () => {
    const h = loadHandler();
    const [first, second] = await Promise.all([
      h.request({ plan: "pro_monthly" }),
      h.request({ plan: "pro_monthly" }),
    ]);
    const keys = h.stripeCalls
      .filter((c) => c.method === "POST" && c.path === "/checkout/sessions")
      .map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^verdant-checkout-live-/);
    expect(keys[0]).toBe(keys[1]);
    expect(first).toEqual(second);
    expect(first.status).toBe(200);
  });

  it("lets monthly and annual started together open only one payable checkout", async () => {
    const h = loadHandler({ env: { STRIPE_PRICE_PRO_ANNUAL_LIVE: "price_liveAnnual1" } });
    const results = await Promise.all([
      h.request({ plan: "pro_monthly" }),
      h.request({ plan: "pro_annual" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 502]);
    expect(h.openSessionIds()).toHaveLength(1);
  });

  it("expires its own session and refuses when another tab's session came first", async () => {
    const h = loadHandler({
      racingSession: {
        id: "cs_live_othertab",
        created: 50,
        url: "https://checkout.stripe.com/c/pay/cs_live_othertab",
        metadata: { plan_key: "pro_annual", user_id: USER },
      },
    });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 409,
      body: { error: "checkout_in_progress" },
    });
    expect(h.openSessionIds()).toEqual(["cs_live_othertab"]);
  });

  it("keeps its own session when another tab's session came later", async () => {
    const h = loadHandler({
      racingSession: {
        id: "cs_live_othertab",
        created: 999,
        url: "https://checkout.stripe.com/c/pay/cs_live_othertab",
        metadata: { plan_key: "pro_annual", user_id: USER },
      },
    });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 200,
      body: { url: "https://checkout.stripe.com/c/pay/cs_live_fx101" },
    });
  });

  it("reuses the customer on the grower's own Stripe row without searching Stripe", async () => {
    const h = loadHandler({
      subscriptionRows: [
        {
          id: "row-0",
          user_id: USER,
          billing_provider: "stripe",
          stripe_subscription_id: "sub_old",
          stripe_customer_id: "cus_A1",
          paddle_subscription_id: null,
          paddle_customer_id: null,
          product_id: "prod_Pro1",
          price_id: "pro_monthly",
          status: "canceled",
          current_period_end: "2026-01-01T00:00:00.000Z",
          environment: "live",
          created_at: "2025-12-01T00:00:00.000Z",
        },
      ],
    });
    expect((await h.request({ plan: "pro_monthly" })).status).toBe(200);
    const paths = h.stripeCalls.map((c) => c.path.split("?")[0]);
    expect(paths).not.toContain("/customers/search");
    expect(paths).not.toContain("/customers");
    const session = h.stripeCalls.find((c) => c.path === "/checkout/sessions")!;
    expect(new URLSearchParams(session.body).get("customer")).toBe("cus_A1");
  });

  it("reuses a customer found by our metadata in Stripe instead of creating one", async () => {
    const h = loadHandler({ searchCustomers: [{ id: "cus_found1", metadata: { user_id: USER } }] });
    expect((await h.request({ plan: "pro_monthly" })).status).toBe(200);
    expect(h.stripeCalls.some((c) => c.method === "POST" && c.path === "/customers")).toBe(false);
    const session = h.stripeCalls.find((c) => c.path === "/checkout/sessions")!;
    expect(new URLSearchParams(session.body).get("customer")).toBe("cus_found1");
  });

  it("refuses a second checkout when Stripe already has a live subscription the webhook has not recorded", async () => {
    const h = loadHandler({ stripeSubscriptions: [{ id: "sub_new", status: "active" }] });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 409,
      body: { error: "already_subscribed" },
    });
    expect(h.stripeCalls.some((c) => c.path === "/checkout/sessions")).toBe(false);
  });

  it("fails closed when the Stripe price is not the $12 monthly price the site shows", async () => {
    const h = loadHandler({
      price: {
        object: "price",
        active: true,
        livemode: true,
        currency: "usd",
        type: "recurring",
        unit_amount: 1999,
        recurring: { interval: "month", interval_count: 1 },
      },
    });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 503,
      body: { error: "stripe_price_mismatch" },
    });
    expect(h.stripeCalls.map((c) => c.path.split("?")[0])).toEqual(["/prices/price_liveMonthly1"]);
    // Logged as an error under its own event, not as "not configured".
    expect(h.errors).toEqual([
      { event: "stripe_checkout_misconfigured", reason: "price_mismatch", environment: "live" },
    ]);
  });

  it("hands back the grower's open session for the same plan instead of opening another", async () => {
    const h = loadHandler({
      openSessions: [
        {
          id: "cs_live_open1",
          status: "open",
          url: "https://checkout.stripe.com/c/pay/cs_live_open1",
          expires_at: Math.floor(Date.now() / 1000) + 20 * 60,
          metadata: { plan_key: "pro_monthly", user_id: USER },
        },
      ],
    });
    expect(await h.request({ plan: "pro_monthly" })).toEqual({
      status: 200,
      body: { url: "https://checkout.stripe.com/c/pay/cs_live_open1" },
    });
    expect(h.stripeCalls.some((c) => c.method === "POST" && c.path === "/checkout/sessions")).toBe(
      false,
    );
  });

  it("expires an open session for the other plan before opening a new one, with a fresh key", async () => {
    const h = loadHandler({
      openSessions: [
        {
          id: "cs_live_annual1",
          status: "open",
          url: "https://checkout.stripe.com/c/pay/cs_live_annual1",
          expires_at: Math.floor(Date.now() / 1000) + 20 * 60,
          metadata: { plan_key: "pro_annual", user_id: USER },
        },
      ],
    });
    expect((await h.request({ plan: "pro_monthly" })).status).toBe(200);
    const posts = h.stripeCalls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(posts).toEqual([
      "/customers",
      "/checkout/sessions/cs_live_annual1/expire",
      "/checkout/sessions",
    ]);
    const session = h.stripeCalls.find(
      (c) => c.path === "/checkout/sessions" && c.method === "POST",
    )!;
    expect(session.idempotencyKey).toMatch(/^verdant-checkout-live-.+-[0-9a-f]{8}$/);
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

  it("says Stripe is not configured when the plan's price env is unset", async () => {
    const h = loadHandler();
    expect(await h.request({ plan: "pro_annual" })).toEqual({
      status: 503,
      body: { error: "stripe_not_configured" },
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
      body: { error: "stripe_not_configured" },
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
