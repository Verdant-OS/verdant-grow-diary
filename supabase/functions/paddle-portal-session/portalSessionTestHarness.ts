import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

type Row = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;
type Filter = { key: string; operator: "eq" | "like" | "notLike"; value: unknown };
type Query = { table: string; filters: Filter[]; orders: string[] };

export const PORTAL_USER = "00000000-0000-4000-8000-000000000001";
export const OTHER_PORTAL_USER = "00000000-0000-4000-8000-000000000002";
export const SENSITIVE_FAILURE =
  "synthetic-private-marker https://portal.fixture.invalid/private?token=synthetic-private-marker";

export function recurringRow(overrides: Row = {}): Row {
  return {
    user_id: PORTAL_USER,
    paddle_subscription_id: "sub_live_fixture",
    paddle_customer_id: "ctm_live_fixture",
    environment: "live",
    status: "active",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Runs the actual Edge handler, shared Paddle wrapper and environment resolver.
 * Only external SDK/database IO is substituted. The VM has no network or host
 * environment access, and unexpected imports fail instead of reaching a service.
 */
export function portalSessionHarness() {
  const subscriptions: Row[] = [recurringRow()];
  const customers: Row[] = [{ paddle_customer_id: "ctm_live_fixture", environment: "live" }];
  const queries: Query[] = [];
  const operations: string[] = [];
  const portalCalls: Array<{
    environment: string;
    customerId: string;
    subscriptionIds: string[];
  }> = [];
  const logs: unknown[][] = [];
  const state: {
    authenticated: boolean;
    faults: Partial<
      Record<"auth" | "admin" | "subscription" | "lifetime" | "customer" | "portal", unknown>
    >;
    results: { recurring?: Row[]; customer?: Row[] };
    portalReply?: unknown;
  } = { authenticated: true, faults: {}, results: {} };
  const environment = new Map<string, string>([
    ["SUPABASE_URL", "https://database.fixture.invalid"],
    ["SUPABASE_ANON_KEY", "synthetic-caller-key"],
    ["SUPABASE_SERVICE_ROLE_KEY", "synthetic-privileged-key"],
    ["PAYMENTS_ENVIRONMENT", "live"],
    ["PADDLE_LIVE_API_KEY", "synthetic-live-provider-key"],
    ["PADDLE_SANDBOX_API_KEY", "synthetic-sandbox-provider-key"],
    ["LOVABLE_API_KEY", "synthetic-gateway-key"],
  ]);
  let handler: Handler | undefined;
  let networkAttempts = 0;

  function like(value: unknown, pattern: unknown): boolean {
    const regex = String(pattern)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`^${regex}$`).test(String(value));
  }

  function from(table: string) {
    const query: Query = { table, filters: [], orders: [] };
    const sort: Array<{ key: string; ascending: boolean }> = [];
    let count = Infinity;
    const execute = () => {
      queries.push(structuredClone(query));
      operations.push(`query:${table}`);
      const lifetime = query.filters.some((filter) => filter.operator === "like");
      const error =
        table === "paddle_customers"
          ? state.faults.customer
          : lifetime
            ? state.faults.lifetime
            : state.faults.subscription;
      if (error) return { data: null, error };
      let rows = table === "paddle_customers" ? customers : subscriptions;
      rows = rows.filter((row) =>
        query.filters.every((filter) =>
          filter.operator === "eq"
            ? row[filter.key] === filter.value
            : filter.operator === "like"
              ? like(row[filter.key], filter.value)
              : !like(row[filter.key], filter.value),
        ),
      );
      rows = [...rows].sort((a, b) => {
        for (const order of sort) {
          const result = String(a[order.key]).localeCompare(String(b[order.key]));
          if (result !== 0) return order.ascending ? result : -result;
        }
        return 0;
      });
      const override =
        table === "paddle_customers"
          ? state.results.customer
          : !lifetime
            ? state.results.recurring
            : undefined;
      return { data: structuredClone(override ?? rows.slice(0, count)), error: null };
    };
    const builder = {
      select: (_columns: string) => builder,
      eq: (key: string, value: unknown) => {
        query.filters.push({ key, operator: "eq", value });
        return builder;
      },
      not: (key: string, operator: string, value: unknown) => {
        if (operator !== "like") throw new Error("Unexpected fixture query operator");
        query.filters.push({ key, operator: "notLike", value });
        return builder;
      },
      like: (key: string, value: unknown) => {
        query.filters.push({ key, operator: "like", value });
        return builder;
      },
      order: (key: string, options: { ascending: boolean }) => {
        query.orders.push(key);
        sort.push({ key, ascending: options.ascending });
        return builder;
      },
      limit: (value: number) => {
        count = value;
        return builder;
      },
      async maybeSingle() {
        const result = execute();
        return { ...result, data: result.data?.[0] ?? null };
      },
      then(onfulfilled: (result: ReturnType<typeof execute>) => unknown) {
        return Promise.resolve(execute()).then(onfulfilled);
      },
    };
    return builder;
  }

  function createClient(_url: string, _key: string, options: { global?: unknown }) {
    const caller = options.global != null;
    operations.push(caller ? "caller-client" : "admin-client");
    if (!caller && state.faults.admin) throw state.faults.admin;
    return {
      from,
      auth: {
        async getUser() {
          operations.push("authenticate");
          if (state.faults.auth) throw state.faults.auth;
          return {
            data: { user: state.authenticated ? { id: PORTAL_USER } : null },
            error: state.authenticated ? null : { message: SENSITIVE_FAILURE },
          };
        },
      },
    };
  }

  class FixturePaddle {
    private environment: string;
    constructor(key: string) {
      operations.push("provider-client");
      this.environment = key === "synthetic-live-provider-key" ? "live" : "sandbox";
    }
    customerPortalSessions = {
      create: async (customerId: string, subscriptionIds: string[]) => {
        operations.push("create-portal");
        portalCalls.push({
          environment: this.environment,
          customerId,
          subscriptionIds: [...subscriptionIds],
        });
        if (state.faults.portal) throw state.faults.portal;
        return (
          state.portalReply ?? {
            urls: {
              general: {
                overview: `https://portal.fixture.invalid/session/${portalCalls.length}`,
              },
            },
          }
        );
      },
    };
  }

  const context = createContext({
    Request,
    Response,
    URL,
    console: {
      log: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
      error: (...args: unknown[]) => logs.push(args),
    },
    Deno: {
      env: { get: (key: string) => environment.get(key) },
      serve: (value: Handler) => {
        handler = value;
      },
    },
    fetch: () => {
      networkAttempts += 1;
      throw new Error("Network forbidden in portal fixture");
    },
  });
  const modules = new Map<string, { exports: Row }>();
  function load(file: string): Row {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    const mod = { exports: {} };
    modules.set(file, mod);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const requireFixture = (name: string) => {
      if (name === "npm:@supabase/supabase-js@2") return { createClient };
      if (name === "npm:@supabase/supabase-js@2/cors") return { corsHeaders: {} };
      if (name === "npm:@paddle/paddle-node-sdk") {
        return { Paddle: FixturePaddle, Environment: {}, EventName: {} };
      }
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      return load(resolve(dirname(file), name));
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  }
  load(resolve(__dirname, "index.ts"));

  return {
    subscriptions,
    customers,
    queries,
    operations,
    portalCalls,
    logs,
    state,
    get networkAttempts() {
      return networkAttempts;
    },
    configureEnvironment(value: string | undefined) {
      if (value === undefined) environment.delete("PAYMENTS_ENVIRONMENT");
      else environment.set("PAYMENTS_ENVIRONMENT", value);
    },
    configurePrivilegedKey(present: boolean) {
      if (!present) environment.delete("SUPABASE_SERVICE_ROLE_KEY");
    },
    async deliver(
      options: {
        authorization?: string | null;
        body?: unknown;
        query?: string;
        method?: string;
      } = {},
    ) {
      if (!handler) throw new Error("Portal handler did not register");
      const headers = new Headers();
      if (options.authorization !== null) {
        headers.set("Authorization", options.authorization ?? "Bearer synthetic-caller-jwt");
      }
      const method = options.method ?? "POST";
      const response = await handler(
        new Request(`https://edge.fixture.invalid/portal${options.query ?? ""}`, {
          method,
          headers,
          body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
        }),
      );
      if (networkAttempts !== 0) throw new Error("Portal attempted forbidden fixture network IO");
      const text = await response.text();
      return {
        status: response.status,
        body: text === "ok" ? text : (JSON.parse(text) as Row),
        headers: response.headers,
      };
    },
  };
}
