/**
 * Behavioral coverage for the shared Paddle HTTP dispatch.
 * A mock fetch records the URL and headers. Nothing is sent to Paddle.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PADDLE_DIRECT_CONFIG_REFUSED,
  PADDLE_GATEWAY_ORIGIN,
  PADDLE_SANDBOX_API_BASE,
  directPriceLookupPath,
  paddleClientPlan,
  performPaddleFetch,
  resolvePaddleTransport,
  type PaddleFetch,
} from "../../supabase/functions/_shared/paddleDirectTransport.ts";

const SANDBOX_KEY = "pdl_sdbx_DO_NOT_LEAK_fixturekey";
const PRICE_ID = "pri_sandbox_123";

type EnvMap = Record<string, string | undefined>;

function getEnv(map: EnvMap): (name: string) => string | undefined {
  return (name) => map[name];
}

function header(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found ? String(found[1]) : null;
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? record[key] : null;
}

function recordingFetch(): {
  fetch: PaddleFetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: PaddleFetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 200 });
  };
  return { fetch, calls };
}

const directEnv = (): EnvMap => ({
  PADDLE_DIRECT_API_KEY: SANDBOX_KEY,
  PADDLE_API_BASE: PADDLE_SANDBOX_API_BASE,
  PAYMENTS_ENVIRONMENT: "sandbox",
  SUPABASE_URL: "https://fixture.invalid",
});

describe("performPaddleFetch", () => {
  it("calls the sandbox price URL with a Bearer key and does not read gateway credentials", async () => {
    const recorded = recordingFetch();
    let gatewayKeysRead = false;
    await performPaddleFetch({
      env: "sandbox",
      getEnv: getEnv(directEnv()),
      path: directPriceLookupPath(PRICE_ID),
      fetch: recorded.fetch,
      gatewayKeys: () => {
        gatewayKeysRead = true;
        return { connectionApiKey: "should-not-be-sent", lovableApiKey: "should-not-be-sent" };
      },
    });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.url).toBe(`${PADDLE_SANDBOX_API_BASE}/prices/${PRICE_ID}`);
    expect(header(recorded.calls[0]?.init?.headers, "Authorization")).toBe(`Bearer ${SANDBOX_KEY}`);
    expect(header(recorded.calls[0]?.init?.headers, "X-Connection-Api-Key")).toBeNull();
    expect(header(recorded.calls[0]?.init?.headers, "Lovable-API-Key")).toBeNull();
    expect(gatewayKeysRead).toBe(false);
  });

  it("calls the Lovable gateway with both gateway headers and no Bearer token", async () => {
    const recorded = recordingFetch();
    await performPaddleFetch({
      env: "live",
      getEnv: getEnv({}),
      path: `/prices?external_id=${encodeURIComponent("pro_monthly")}`,
      fetch: recorded.fetch,
      gatewayKeys: () => ({ connectionApiKey: "conn_key", lovableApiKey: "lovable_key" }),
    });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.url).toBe(`${PADDLE_GATEWAY_ORIGIN}/prices?external_id=pro_monthly`);
    expect(PADDLE_GATEWAY_ORIGIN).toBe("https://connector-gateway.lovable.dev/paddle");
    expect(header(recorded.calls[0]?.init?.headers, "X-Connection-Api-Key")).toBe("conn_key");
    expect(header(recorded.calls[0]?.init?.headers, "Lovable-API-Key")).toBe("lovable_key");
    expect(header(recorded.calls[0]?.init?.headers, "Authorization")).toBeNull();
  });

  it("refuses a live API base without calling fetch or falling back to the gateway", async () => {
    const recorded = recordingFetch();
    let gatewayKeysRead = false;
    const attempt = performPaddleFetch({
      env: "sandbox",
      getEnv: getEnv({
        ...directEnv(),
        PADDLE_API_BASE: "https://api.paddle.com",
      }),
      path: directPriceLookupPath(PRICE_ID),
      fetch: recorded.fetch,
      gatewayKeys: () => {
        gatewayKeysRead = true;
        return { connectionApiKey: "conn_key", lovableApiKey: "lovable_key" };
      },
    });

    await expect(attempt).rejects.toThrow(PADDLE_DIRECT_CONFIG_REFUSED);
    expect(recorded.calls).toHaveLength(0);
    expect(gatewayKeysRead).toBe(false);
  });
});

describe("paddle.ts uses the shared dispatch", () => {
  const SRC = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/paddle.ts"), "utf8");

  it("keeps gatewayFetch and getPaddleClient exported and routes fetch through performPaddleFetch", () => {
    expect(SRC).toMatch(/export async function gatewayFetch/);
    expect(SRC).toMatch(/export function getPaddleClient/);
    expect(SRC).toContain("return performPaddleFetch(");
    expect(SRC).toContain('if (plan.mode === "direct")');
    expect(SRC).toContain("return new Paddle(plan.apiKey, { environment: Environment.sandbox })");
    const directEnvMap = directEnv();
    const directPlan = paddleClientPlan(
      resolvePaddleTransport("sandbox", (name) => directEnvMap[name]) as {
        mode: "direct";
        apiKey: string;
        base: string;
      },
    );
    expect(directPlan).toEqual({ mode: "direct", apiKey: SANDBOX_KEY });
    const gatewayPlan = paddleClientPlan({ mode: "gateway" });
    expect(gatewayPlan).toEqual({ mode: "gateway" });
    expect(SRC).toContain('getEnv("LOVABLE_API_KEY")');
    expect(SRC).toContain('"X-Connection-Api-Key"');
    expect(SRC).toContain('"Lovable-API-Key"');
  });
});
