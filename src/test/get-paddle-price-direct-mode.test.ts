/**
 * Static pins for get-paddle-price: the gateway lookup string stays
 * character-identical, and the direct sandbox path uses the pure helpers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
  "utf8",
);

const GATEWAY_PATH = "`/prices?external_id=${encodeURIComponent(requested)}`";
const GATEWAY_ID = "data?.data?.[0]?.id";

describe("get-paddle-price direct mode pins", () => {
  it("keeps the gateway lookup path and the list-shaped id read", () => {
    expect(SRC).toContain(GATEWAY_PATH);
    expect(SRC).toContain(GATEWAY_ID);
    expect(SRC).toContain(
      "direct ? directPriceLookupPath(configuredId) : `/prices?external_id=${encodeURIComponent(requested)}`",
    );
    expect(SRC).toContain("direct ? extractDirectPriceId(data, requested) : data?.data?.[0]?.id");
  });

  it("keeps the configured-id drift check", () => {
    expect(SRC).toContain("paddleId !== configuredId");
    expect(SRC).toMatch(/const configuredId = SERVER_PRICE_CONFIG\[requested\] \?\? ""/);
  });

  it("keeps the sold-out pre-check ahead of gatewayFetch", () => {
    const soldOutIdx = SRC.indexOf("plan_sold_out");
    const gatewayIdx = SRC.indexOf("await gatewayFetch(");
    expect(soldOutIdx).toBeGreaterThan(-1);
    expect(gatewayIdx).toBeGreaterThan(-1);
    expect(soldOutIdx).toBeLessThan(gatewayIdx);
    expect(SRC).toContain("directPriceLookupPath");
    expect(SRC).toContain("extractDirectPriceId");
    expect(SRC).toContain("isPaddleDirectMode");
  });
});
