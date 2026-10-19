/**
 * Behavioral price lookup: the path helper and the shared fetch seam produce
 * the sandbox URL in direct mode and the gateway URL otherwise.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PADDLE_GATEWAY_ORIGIN,
  PADDLE_SANDBOX_API_BASE,
  extractDirectPriceId,
  founderSlotCheckoutBlock,
  performPaddleFetch,
  priceLookupPath,
  type PaddleFetch,
} from "../../supabase/functions/_shared/paddleDirectTransport.ts";

const PRICE_ID = "pri_sandbox_pro_monthly";
const PLAN = "pro_monthly";

function header(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers || headers instanceof Headers || Array.isArray(headers)) return null;
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? record[key] : null;
}

describe("get-paddle-price direct and gateway requests", () => {
  it("requests https://sandbox-api.paddle.com/prices/<id> and reads the active price id", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: PaddleFetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          data: {
            id: PRICE_ID,
            status: "active",
            custom_data: { external_id: PLAN },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const path = priceLookupPath(true, PRICE_ID, PLAN);
    const response = await performPaddleFetch({
      env: "sandbox",
      getEnv: (name) =>
        ({
          PADDLE_DIRECT_API_KEY: "pdl_sdbx_price_fixture",
          PADDLE_API_BASE: PADDLE_SANDBOX_API_BASE,
          PAYMENTS_ENVIRONMENT: "sandbox",
          SUPABASE_URL: "https://fixture.invalid",
        })[name],
      path,
      fetch: fetchImpl,
      gatewayKeys: () => {
        throw new Error("gateway keys must not be read in direct mode");
      },
    });
    const body = await response.json();

    expect(calls[0]?.url).toBe(`https://sandbox-api.paddle.com/prices/${PRICE_ID}`);
    expect(header(calls[0]?.init?.headers, "Authorization")).toBe("Bearer pdl_sdbx_price_fixture");
    expect(extractDirectPriceId(body, PLAN)).toBe(PRICE_ID);
  });

  it("requests the gateway external_id URL and does not treat a list body as a direct price", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: PaddleFetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ data: [{ id: PRICE_ID }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const path = priceLookupPath(false, PRICE_ID, PLAN);
    const response = await performPaddleFetch({
      env: "sandbox",
      getEnv: () => undefined,
      path,
      fetch: fetchImpl,
      gatewayKeys: () => ({ connectionApiKey: "conn_key", lovableApiKey: "lovable_key" }),
    });
    const body = (await response.json()) as { data?: Array<{ id?: string }> };

    expect(path).toBe(`/prices?external_id=${encodeURIComponent(PLAN)}`);
    expect(calls[0]?.url).toBe(`${PADDLE_GATEWAY_ORIGIN}${path}`);
    expect(header(calls[0]?.init?.headers, "Authorization")).toBeNull();
    expect(header(calls[0]?.init?.headers, "X-Connection-Api-Key")).toBe("conn_key");
    expect(body?.data?.[0]?.id).toBe(PRICE_ID);
    expect(extractDirectPriceId(body, PLAN)).toBeNull();
  });

  it("blocks founder checkout before a price fetch when no slots remain", () => {
    expect(founderSlotCheckoutBlock(0)).toBe("sold_out");
    expect(founderSlotCheckoutBlock(-1)).toBe("sold_out");
    expect(founderSlotCheckoutBlock("3")).toBe("sold_out");
    expect(founderSlotCheckoutBlock(undefined)).toBe("sold_out");
    expect(founderSlotCheckoutBlock(3)).toBe("ok");
  });
});

describe("get-paddle-price still calls the shared helpers", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
    "utf8",
  );

  it("keeps sold-out ahead of gatewayFetch and uses the shared path and id helpers", () => {
    const soldOutIdx = SRC.indexOf('return json(409, { error: "plan_sold_out" })');
    const blockIdx = SRC.indexOf("founderSlotCheckoutBlock(remaining)");
    const gatewayIdx = SRC.indexOf("await gatewayFetch(");
    expect(soldOutIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeLessThan(soldOutIdx);
    expect(soldOutIdx).toBeLessThan(gatewayIdx);
    expect(SRC).toContain("priceLookupPath(direct, configuredId, requested)");
    expect(SRC).toContain("direct ? extractDirectPriceId(data, requested) : data?.data?.[0]?.id");
    expect(SRC).toContain("paddleId !== configuredId");
  });
});
