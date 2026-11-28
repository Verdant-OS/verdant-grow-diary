/**
 * getBlueprintAccess — the server function itself, not only the pure rule.
 *
 * TanStack's createServerFn / createMiddleware are replaced by small builders
 * that keep the registered middleware and handler, so the test runs the real
 * requireSupabaseAuth middleware and the real handler in order. Supabase is a
 * fake client that records every subscriptions query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_ROW_SCAN_LIMIT } from "@/lib/entitlements/unionEntitlements";

type Ctx = Record<string, unknown>;
type Next = (opts: { context: Ctx }) => Promise<unknown>;
type ServerMiddleware = { server: (args: { context: Ctx; next: Next }) => Promise<unknown> };
type FakeServerFn = {
  middlewares: ServerMiddleware[];
  handlerFn: (args: { context: Ctx }) => Promise<unknown>;
};

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      middlewares: [] as unknown[],
      handlerFn: null as unknown,
      middleware(list: unknown[]) {
        fn.middlewares = list;
        return fn;
      },
      handler(h: unknown) {
        fn.handlerFn = h;
        return fn;
      },
    };
    return fn;
  },
  createMiddleware: () => ({ server: (server: unknown) => ({ server }) }),
}));

const io = vi.hoisted(() => ({
  request: null as { headers: Headers } | null,
  sub: "user-verified" as string | null,
  results: {} as Record<string, { data: unknown; error: unknown }>,
  queries: [] as Array<{ table: string; calls: Array<[string, ...unknown[]]> }>,
}));

function envOf(query: { calls: Array<[string, ...unknown[]]> }) {
  return query.calls.find((c) => c[0] === "eq" && c[1] === "environment")?.[2];
}

vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => io.request }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getClaims: async () =>
        io.sub ? { data: { claims: { sub: io.sub } }, error: null } : { data: null, error: null },
    },
    from: (table: string) => {
      const query = { table, calls: [] as Array<[string, ...unknown[]]> };
      io.queries.push(query);
      const chain = {
        select: (...a: unknown[]) => (query.calls.push(["select", ...a]), chain),
        eq: (...a: unknown[]) => (query.calls.push(["eq", ...a]), chain),
        order: (...a: unknown[]) => (query.calls.push(["order", ...a]), chain),
        limit: (...a: unknown[]) => {
          query.calls.push(["limit", ...a]);
          return Promise.resolve(io.results[String(envOf(query))] ?? { data: [], error: null });
        },
      };
      return chain;
    },
  }),
}));

import { getBlueprintAccess } from "@/lib/blueprintAccess.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fn = getBlueprintAccess as unknown as FakeServerFn;
const JWT = "header.payload.signature";
const NOW = new Date("2026-11-24T08:00:00.000Z");

function call(): Promise<unknown> {
  const run = (i: number, context: Ctx): Promise<unknown> =>
    i < fn.middlewares.length
      ? fn.middlewares[i].server({
          context,
          next: ({ context: c }) => run(i + 1, { ...context, ...c }),
        })
      : fn.handlerFn({ context });
  return run(0, {});
}

function signIn(authorization: string | null = `Bearer ${JWT}`) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  io.request = { headers };
}

function row(price_id: string, extra: Record<string, unknown> = {}) {
  return {
    id: `row-${price_id}`,
    user_id: "user-verified",
    paddle_subscription_id: `sub_${price_id}`,
    paddle_customer_id: "ctm_1",
    product_id: "prod",
    price_id,
    status: "active",
    current_period_end: "2026-12-24T00:00:00.000Z",
    environment: "live",
    created_at: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

const environmentsQueried = () => io.queries.map(envOf);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("PAYMENTS_ENVIRONMENT", "");
  io.sub = "user-verified";
  io.results = {};
  io.queries = [];
  signIn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getBlueprintAccess — auth", () => {
  it("runs behind requireSupabaseAuth", () => {
    expect(fn.middlewares).toContain(requireSupabaseAuth);
  });

  it.each([
    ["no authorization header", null],
    ["a non-Bearer header", `Basic ${JWT}`],
    ["a malformed token", "Bearer not-a-jwt"],
  ])("rejects a signed-out caller with %s and reads no subscriptions", async (_label, header) => {
    signIn(header);
    await expect(call()).rejects.toThrow(/^Unauthorized/);
    expect(io.queries).toEqual([]);
  });

  it("rejects a token whose claims carry no user id", async () => {
    io.sub = null;
    await expect(call()).rejects.toThrow(/^Unauthorized/);
    expect(io.queries).toEqual([]);
  });
});

describe("getBlueprintAccess — subscriptions query", () => {
  it("reads only the verified caller's live rows, newest first, bounded", async () => {
    await call();
    expect(io.queries).toHaveLength(1);
    const [{ table, calls }] = io.queries;
    expect(table).toBe("subscriptions");
    expect(calls).toContainEqual(["eq", "user_id", "user-verified"]);
    expect(calls).toContainEqual(["eq", "environment", "live"]);
    expect(calls).toContainEqual(["limit", SUBSCRIPTION_ROW_SCAN_LIMIT]);
    expect(calls.filter((c) => c[0] === "order")).toEqual([
      ["order", "created_at", { ascending: false }],
      ["order", "paddle_subscription_id", { ascending: false, nullsFirst: false }],
      ["order", "id", { ascending: false }],
    ]);
  });

  it.each(["", "live", "Sandbox", " production "])(
    "does not read sandbox rows when PAYMENTS_ENVIRONMENT is %j",
    async (value) => {
      vi.stubEnv("PAYMENTS_ENVIRONMENT", value);
      io.results.sandbox = {
        data: [row("craft_monthly", { environment: "sandbox" })],
        error: null,
      };
      expect(await call()).toEqual({ allowed: false, reason: "no_blueprint_plan" });
      expect(environmentsQueried()).toEqual(["live"]);
    },
  );

  it("reads sandbox rows with the same predicates when PAYMENTS_ENVIRONMENT is sandbox", async () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", " sandbox ");
    await call();
    expect(environmentsQueried()).toEqual(["live", "sandbox"]);
    const sandbox = io.queries[1];
    expect(sandbox.table).toBe("subscriptions");
    expect(sandbox.calls).toContainEqual(["eq", "user_id", "user-verified"]);
    expect(sandbox.calls).toContainEqual(["limit", SUBSCRIPTION_ROW_SCAN_LIMIT]);
  });
});

describe("getBlueprintAccess — verdict", () => {
  it("allows a live Craft row", async () => {
    io.results.live = { data: [row("craft_monthly")], error: null };
    expect(await call()).toEqual({ allowed: true, reason: "allowed" });
  });

  it("denies a live Pro row", async () => {
    io.results.live = { data: [row("pro_monthly")], error: null };
    expect(await call()).toEqual({ allowed: false, reason: "no_blueprint_plan" });
  });

  it("allows a sandbox Craft row only when the server resolved sandbox", async () => {
    io.results.sandbox = { data: [row("craft_annual", { environment: "sandbox" })], error: null };
    expect(await call()).toEqual({ allowed: false, reason: "no_blueprint_plan" });
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    expect(await call()).toEqual({ allowed: true, reason: "allowed" });
  });

  it("treats null data as no rows", async () => {
    io.results.live = { data: null, error: null };
    expect(await call()).toEqual({ allowed: false, reason: "no_blueprint_plan" });
  });

  it("judges period end against the server clock", async () => {
    io.results.live = {
      data: [
        row("craft_monthly", {
          status: "canceled",
          current_period_end: "2026-11-30T00:00:00.000Z",
        }),
      ],
      error: null,
    };
    expect(await call()).toEqual({ allowed: true, reason: "allowed" });
    vi.setSystemTime(new Date("2026-12-01T00:00:00.000Z"));
    expect(await call()).toEqual({ allowed: false, reason: "no_blueprint_plan" });
  });

  it("fails closed with lookup_failed when the live read errors", async () => {
    io.results.live = { data: null, error: { message: "permission denied" } };
    expect(await call()).toEqual({ allowed: false, reason: "lookup_failed" });
  });

  it("fails closed with lookup_failed when the sandbox read errors", async () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    io.results.sandbox = { data: null, error: { message: "timeout" } };
    expect(await call()).toEqual({ allowed: false, reason: "lookup_failed" });
  });

  it("still allows a proven live Craft row when the sandbox read errors", async () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    io.results.live = { data: [row("craft_monthly")], error: null };
    io.results.sandbox = { data: null, error: { message: "timeout" } };
    expect(await call()).toEqual({ allowed: true, reason: "allowed" });
  });
});
