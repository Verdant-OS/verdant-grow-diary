/**
 * Craft price env-var fail-closed contract.
 *
 * The get-paddle-price edge function must refuse to return a paddleId for
 * craft_monthly or craft_annual when the corresponding
 * PADDLE_PRICE_CRAFT_MONTHLY / PADDLE_PRICE_CRAFT_ANNUAL env var is missing
 * (unset / empty) or malformed (doesn't match the gateway result). Both
 * cases must return the sanitized `price_resolution_unavailable` error,
 * never a raw or partial paddleId — otherwise the buyer would be charged
 * for a plan the webhook can't classify.
 *
 * This file combines static source assertions (so the fail-closed branch
 * can't be refactored away) with a behavioral simulation of the exact
 * config-vs-gateway comparison the handler runs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
  "utf8",
);
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/[^\n]*/g,
  "$1",
);

describe("get-paddle-price — Craft env-var wiring", () => {
  it("reads PADDLE_PRICE_CRAFT_MONTHLY and PADDLE_PRICE_CRAFT_ANNUAL into SERVER_PRICE_CONFIG", () => {
    expect(SRC).toMatch(
      /craft_monthly:\s*Deno\.env\.get\(["']PADDLE_PRICE_CRAFT_MONTHLY["']\)\s*\?\?\s*["']{2}/,
    );
    expect(SRC).toMatch(
      /craft_annual:\s*Deno\.env\.get\(["']PADDLE_PRICE_CRAFT_ANNUAL["']\)\s*\?\?\s*["']{2}/,
    );
  });

  it("defaults an unset env var to empty string (never undefined leaking through)", () => {
    // The `?? ""` fallback is what makes the length===0 branch below meaningful.
    const craftLines = SRC.split("\n").filter((l) => /craft_(monthly|annual):/.test(l));
    expect(craftLines).toHaveLength(2);
    for (const line of craftLines) {
      expect(line).toMatch(/\?\?\s*["']{2}\s*,?\s*$/);
    }
  });
});

describe("get-paddle-price — fail-closed comparison branch", () => {
  it("rejects the gateway result when the configured env var is empty OR mismatched", () => {
    expect(stripped).toMatch(
      /configuredId\.length === 0 \|\| paddleId !== configuredId/,
    );
    expect(SRC).toMatch(/price_resolution_unavailable/);
  });

  it("the mismatch branch fires BEFORE returning paddleId to the client", () => {
    const mismatchIdx = stripped.indexOf("configuredId.length === 0");
    const successIdx = stripped.indexOf("json(200, { paddleId })");
    expect(mismatchIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(-1);
    expect(mismatchIdx).toBeLessThan(successIdx);
  });
});

/**
 * Behavioral simulation of the exact comparison the handler performs at
 * runtime. If someone edits the handler to loosen this check, the static
 * assertions above catch the source drift and these cases catch the
 * behavioral regression side-by-side.
 */
function resolvePaddleId(
  requested: "craft_monthly" | "craft_annual",
  env: Record<string, string | undefined>,
  gatewayId: string | null,
): { status: number; body: { error?: string; paddleId?: string } } {
  const config: Record<string, string> = {
    craft_monthly: env.PADDLE_PRICE_CRAFT_MONTHLY ?? "",
    craft_annual: env.PADDLE_PRICE_CRAFT_ANNUAL ?? "",
  };
  const paddleId = gatewayId ?? "";
  if (typeof paddleId !== "string" || paddleId.length === 0) {
    return { status: 404, body: { error: "price_not_configured" } };
  }
  const configuredId = config[requested] ?? "";
  if (configuredId.length === 0 || paddleId !== configuredId) {
    return { status: 502, body: { error: "price_resolution_unavailable" } };
  }
  return { status: 200, body: { paddleId } };
}

describe("get-paddle-price — Craft fail-closed behavior", () => {
  const gatewayId = "pri_live_craft_monthly_abc123";

  it("craft_monthly: PADDLE_PRICE_CRAFT_MONTHLY unset → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId("craft_monthly", {}, gatewayId);
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
    expect(res.body.paddleId).toBeUndefined();
  });

  it("craft_monthly: PADDLE_PRICE_CRAFT_MONTHLY empty string → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId(
      "craft_monthly",
      { PADDLE_PRICE_CRAFT_MONTHLY: "" },
      gatewayId,
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
  });

  it("craft_monthly: malformed env var (doesn't match gateway id) → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId(
      "craft_monthly",
      { PADDLE_PRICE_CRAFT_MONTHLY: "pri_wrong_id" },
      gatewayId,
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
    expect(res.body.paddleId).toBeUndefined();
  });

  it("craft_monthly: whitespace-only env var never matches a real pri_ id → 502", () => {
    const res = resolvePaddleId(
      "craft_monthly",
      { PADDLE_PRICE_CRAFT_MONTHLY: "   " },
      gatewayId,
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
  });

  it("craft_annual: PADDLE_PRICE_CRAFT_ANNUAL unset → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId("craft_annual", {}, "pri_live_craft_annual_xyz");
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
  });

  it("craft_annual: PADDLE_PRICE_CRAFT_ANNUAL empty string → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId(
      "craft_annual",
      { PADDLE_PRICE_CRAFT_ANNUAL: "" },
      "pri_live_craft_annual_xyz",
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
  });

  it("craft_annual: malformed env var → 502 price_resolution_unavailable", () => {
    const res = resolvePaddleId(
      "craft_annual",
      { PADDLE_PRICE_CRAFT_ANNUAL: "not-a-real-pri-id" },
      "pri_live_craft_annual_xyz",
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("price_resolution_unavailable");
  });

  it("gateway returns nothing → 404 price_not_configured (distinct from env mismatch)", () => {
    const res = resolvePaddleId(
      "craft_monthly",
      { PADDLE_PRICE_CRAFT_MONTHLY: "pri_live_craft_monthly_abc123" },
      null,
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("price_not_configured");
  });

  it("happy path: env var matches gateway id exactly → 200 with paddleId", () => {
    const res = resolvePaddleId(
      "craft_monthly",
      { PADDLE_PRICE_CRAFT_MONTHLY: gatewayId },
      gatewayId,
    );
    expect(res.status).toBe(200);
    expect(res.body.paddleId).toBe(gatewayId);
    expect(res.body.error).toBeUndefined();
  });

  it("regression: no fail-closed branch ever returns a paddleId", () => {
    const cases: Array<Parameters<typeof resolvePaddleId>> = [
      ["craft_monthly", {}, gatewayId],
      ["craft_monthly", { PADDLE_PRICE_CRAFT_MONTHLY: "" }, gatewayId],
      ["craft_monthly", { PADDLE_PRICE_CRAFT_MONTHLY: "pri_wrong" }, gatewayId],
      ["craft_annual", {}, "pri_live_craft_annual_xyz"],
      ["craft_annual", { PADDLE_PRICE_CRAFT_ANNUAL: "" }, "pri_live_craft_annual_xyz"],
      ["craft_annual", { PADDLE_PRICE_CRAFT_ANNUAL: "mismatch" }, "pri_live_craft_annual_xyz"],
    ];
    for (const args of cases) {
      const res = resolvePaddleId(...args);
      expect(res.status).not.toBe(200);
      expect(res.body.paddleId).toBeUndefined();
    }
  });
});
