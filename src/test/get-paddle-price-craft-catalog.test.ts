import { describe, expect, it } from "vitest";
import { readGetPaddlePriceCatalog } from "../../supabase/functions/_shared/getPaddlePriceCatalogEnv";

describe("get-paddle-price catalog — Craft", () => {
  it("returns the Craft price ids from their secrets", () => {
    const env: Record<string, string> = {
      PADDLE_PRICE_PRO_MONTHLY: "pri_pro_m",
      PADDLE_PRICE_CRAFT_MONTHLY: "pri_craft_m",
      PADDLE_PRICE_CRAFT_ANNUAL: " pri_craft_a ",
    };
    const catalog = readGetPaddlePriceCatalog((n) => env[n]);
    expect(catalog.craft_monthly).toBe("pri_craft_m");
    expect(catalog.craft_annual).toBe("pri_craft_a");
    expect(catalog.pro_monthly).toBe("pri_pro_m");
  });
  it("leaves Craft empty (→ price_not_configured) when the secrets are unset", () => {
    const catalog = readGetPaddlePriceCatalog(() => undefined);
    expect(catalog.craft_monthly).toBe("");
    expect(catalog.craft_annual).toBe("");
  });
});
