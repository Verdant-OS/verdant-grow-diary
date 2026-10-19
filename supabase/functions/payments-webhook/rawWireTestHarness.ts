import { createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

const SECRET = "paddle-wire-fixture-secret";
export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const START = "2026-10-16T00:00:00Z";
export const END = "2026-11-16T00:00:00Z";
export type Row = Record<string, unknown>;

export function subscription(eventType = "subscription.created", overrides: Row = {}) {
  return {
    event_id: `evt_${eventType}`,
    event_type: eventType,
    occurred_at: START,
    notification_id: "ntf_fixture",
    data: {
      id: "sub_fixture",
      customer_id: "ctm_fixture",
      status: "active",
      custom_data: { userId: USER_ID, campaign_id: "grow_1", nested: { keep_me: true } },
      current_billing_period: { starts_at: START, ends_at: END },
      scheduled_change: null,
      items: [
        {
          price: { id: "pri_fixture", import_meta: { external_id: "pro_monthly" } },
          product: { id: "pro_fixture", import_meta: { external_id: "verdant_pro" } },
        },
      ],
      ...overrides,
    },
  };
}

export function transaction(sku: string | null = "credit_pack_50", overrides: Row = {}) {
  return {
    event_id: "evt_transaction",
    event_type: "transaction.completed",
    occurred_at: START,
    notification_id: "ntf_fixture",
    data: {
      id: "txn_fixture",
      customer_id: "ctm_fixture",
      subscription_id: null,
      status: "completed",
      currency_code: "USD",
      custom_data: { userId: USER_ID, order_note: "keep_me" },
      details: { totals: { grand_total: "900", currency_code: "USD" } },
      items: [
        {
          price: {
            id: "pri_fixture",
            product_id: "pro_fixture",
            name: "AI credits",
            import_meta: sku ? { external_id: sku } : null,
          },
        },
      ],
      ...overrides,
    },
  };
}

/**
 * Execute the actual Edge entry point and its local imports. TypeScript only
 * transpiles Deno's npm: imports to require(); the loader substitutes external
 * IO, never verification, normalization, decisions or orchestration. No server,
 * credentials, provider requests, email delivery or real database is involved.
 */
export function harness() {
  const events = new Map<string, Row>();
  const subscriptions = new Map<string, Row>();
  const grants = new Map<string, Row>();
  const writes: Row[] = [];
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  const emails: Row[] = [];
  const lookups: string[] = [];
  const normalizedEvents: Row[] = [];
  const env = new Map([
    ["PAYMENTS_SANDBOX_WEBHOOK_SECRET", SECRET],
    ["PAYMENTS_LIVE_WEBHOOK_SECRET", "different-live-fixture-secret"],
    ["SUPABASE_URL", "https://fixture.invalid"],
    ["SUPABASE_SERVICE_ROLE_KEY", "fixture-only-key"],
    ["PADDLE_SANDBOX_API_KEY", "fixture-only-key"],
    ["LOVABLE_API_KEY", "fixture-only-key"],
  ]);
  let handler!: (request: Request) => Promise<Response>;
  let failWrite = false;
  const client = {
    from(table: string) {
      const rows = table === "lovable_paddle_events" ? events : subscriptions;
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | undefined;
      const query = {
        select: () => query,
        update: (value: Row) => {
          patch = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push((r) => r[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[key]));
          return query;
        },
        not: (key: string, _operator: string, _value: string) => {
          filters.push((r) => !String(r[key]).startsWith("lifetime_"));
          return query;
        },
        neq: (key: string, value: unknown) => {
          filters.push((r) => r[key] !== value);
          return query;
        },
        async insert(row: Row) {
          const id = String(row.paddle_event_id);
          if (rows.has(id)) return { error: { code: "23505", message: "duplicate fixture event" } };
          rows.set(id, structuredClone(row));
          return { error: null };
        },
        async upsert(row: Row) {
          if (failWrite) return { error: { message: "fixture write unavailable" } };
          rows.set(String(row.paddle_subscription_id), structuredClone(row));
          writes.push(structuredClone(row));
          return { error: null };
        },
        async maybeSingle() {
          return {
            data: [...rows.values()].find((r) => filters.every((f) => f(r))) ?? null,
            error: null,
          };
        },
        then(onfulfilled: (value: { data: Row[]; error: null }) => unknown) {
          const found = [...rows.values()].filter((r) => filters.every((f) => f(r)));
          if (patch)
            for (const row of found) {
              Object.assign(row, patch);
              if (table === "subscriptions") writes.push(structuredClone(row));
            }
          return Promise.resolve({ data: found, error: null }).then(onfulfilled);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      rpcCalls.push({ name, args: structuredClone(args) });
      grants.set(String(args.p_paddle_transaction_id), structuredClone(args));
      return {
        data: { ok: true, reason: name.includes("credit_pack") ? "granted" : "allocated" },
        error: null,
      };
    },
    auth: {
      admin: {
        async getUserById() {
          return { data: { user: { email: "fixture@example.invalid" } }, error: null };
        },
      },
    },
  };
  class FixturePaddle {
    prices = {
      get: async (id: string) => {
        lookups.push(id);
        return { importMeta: { externalId: "credit_pack_50" } };
      },
    };
  }
  const context = createContext({
    Request,
    Response,
    URL,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    console: { log() {}, error() {}, warn() {} },
    Deno: {
      env: { get: (key: string) => env.get(key) },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    fetch: async (_url: string, init: RequestInit) => {
      emails.push(JSON.parse(String(init.body)) as Row);
      return new Response("{}", { status: 200 });
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
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (name === "npm:@paddle/paddle-node-sdk")
        return { Paddle: FixturePaddle, Environment: {}, EventName: {} };
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      const imported = load(resolve(dirname(file), name));
      if (name === "./orchestrator.ts") {
        type Processor = typeof import("./orchestrator").handleVerifiedEvent;
        return {
          ...imported,
          handleVerifiedEvent: (...args: Parameters<Processor>) => {
            normalizedEvents.push(structuredClone(args[1]) as Row);
            return (imported.handleVerifiedEvent as Processor)(...args);
          },
        };
      }
      return imported;
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  }
  load(resolve(__dirname, "index.ts"));
  async function deliver(
    payload: unknown,
    options: {
      body?: string;
      signedBody?: string;
      secret?: string;
      timestamp?: number;
      environment?: string;
      signature?: string;
    } = {},
  ) {
    const body = options.body ?? JSON.stringify(payload, null, 2);
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", options.secret ?? SECRET)
      .update(`${timestamp}:${options.signedBody ?? body}`)
      .digest("hex");
    const response = await handler(
      new Request(
        `https://fixture.invalid/payments-webhook?env=${options.environment ?? "sandbox"}`,
        {
          method: "POST",
          body,
          headers: { "paddle-signature": options.signature ?? `ts=${timestamp};h1=${digest}` },
        },
      ),
    );
    const text = await response.text();
    return { code: response.status, status: text.startsWith("{") ? JSON.parse(text).status : text };
  }
  return {
    deliver,
    events,
    subscriptions,
    grants,
    writes,
    rpcCalls,
    emails,
    lookups,
    normalizedEvents,
    clearWebhookSecret: () => env.delete("PAYMENTS_SANDBOX_WEBHOOK_SECRET"),
    setFailWrite: (value: boolean) => {
      failWrite = value;
    },
  };
}
