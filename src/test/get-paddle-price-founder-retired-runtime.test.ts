/**
 * #2028 P1 r4319992473: Founder Lifetime is no longer sold, so the server price
 * resolver must refuse it, not only the browser checkout hook. This runs the
 * real get-paddle-price Edge entry point (same loader approach as
 * payments-webhook/rawWireTestHarness.ts): TypeScript transpiles the Deno
 * module and the loader substitutes only external IO (Supabase client, Paddle
 * gateway). No server, credentials, provider request or database is involved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

type Row = Record<string, unknown>;

function loadHandler() {
  const rpcCalls: string[] = [];
  const gatewayCalls: string[] = [];
  const warnings: string[] = [];
  const env = new Map([
    ["SUPABASE_URL", "https://fixture.invalid"],
    ["SUPABASE_ANON_KEY", "fixture-only-key"],
    ["PAYMENTS_ENVIRONMENT", "sandbox"],
    ["PADDLE_PRICE_PRO_MONTHLY", "pri_pro_monthly_fixture"],
  ]);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-fixture" } }, error: null }) },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: 10, error: null };
    },
  };
  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    Request,
    Response,
    URL,
    JSON,
    console: { log() {}, error() {}, warn: (line: string) => warnings.push(line) },
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
      if (name === "../_shared/paddle.ts") {
        return {
          gatewayFetch: async (_env: string, path: string) => {
            gatewayCalls.push(path);
            return new Response(JSON.stringify({ data: [{ id: "pri_pro_monthly_fixture" }] }), {
              status: 200,
            });
          },
        };
      }
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      return load(resolve(dirname(file), name));
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  }
  load(resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"));

  async function request(plan: string) {
    const res = await handler(
      new Request("https://fixture.invalid/functions/v1/get-paddle-price", {
        method: "POST",
        headers: { Authorization: "Bearer fixture-jwt", "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: plan }),
      }),
    );
    return { status: res.status, body: (await res.json()) as Row };
  }
  return { request, rpcCalls, gatewayCalls, warnings };
}

describe("get-paddle-price refuses the retired Founder Lifetime plan", () => {
  it("returns 410 plan_retired for founder_lifetime before any slot lookup or Paddle call", async () => {
    const h = loadHandler();
    const res = await h.request("founder_lifetime");
    expect(res).toEqual({ status: 410, body: { error: "plan_retired" } });
    expect(h.rpcCalls).toEqual([]);
    expect(h.gatewayCalls).toEqual([]);
    // Telemetry tells a Founder probe apart from a junk plan id (Sour Diesel nit).
    expect(h.warnings.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ plan: "founder_lifetime", stage: "plan_retired" }),
    ]);
  });

  it("still resolves a sellable plan through the same handler", async () => {
    const h = loadHandler();
    const res = await h.request("pro_monthly");
    expect(res).toEqual({ status: 200, body: { paddleId: "pri_pro_monthly_fixture" } });
    expect(h.gatewayCalls).toEqual(["/prices?external_id=pro_monthly"]);
  });
});
