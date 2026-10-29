import { describe, expect, it } from "vitest";
import { readGetPaddlePriceCatalog } from "../../supabase/functions/_shared/getPaddlePriceCatalogEnv.ts";

describe("readGetPaddlePriceCatalog", () => {
  it("trims whitespace from configured price ids", () => {
    const catalog = readGetPaddlePriceCatalog((name) =>
      name === "PADDLE_PRICE_PRO_MONTHLY" ? "  pri_trimmed  " : "",
    );
    expect(catalog.pro_monthly).toBe("pri_trimmed");
  });
});
