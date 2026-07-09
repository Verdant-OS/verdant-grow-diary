/**
 * Static safety scan: no client-exposed Paddle secrets, service_role,
 * or private webhook secrets in the built-in Paddle client helpers,
 * checkout pages, or the pricing surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/paddle.ts",
  "src/hooks/usePaddleCheckout.ts",
  "src/components/PaymentTestModeBanner.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/CheckoutSuccess.tsx",
  "src/pages/CheckoutCancel.tsx",
];

const FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /service_role/,
  /PADDLE_(SANDBOX|LIVE)_API_KEY/,
  /PAYMENTS_(SANDBOX|LIVE)_WEBHOOK_SECRET/,
  /pdl_sdbx_apikey/i,
  /pdl_live_apikey/i,
  /Bearer\s+pdl_/i,
];

describe("Built-in Paddle client — no exposed secrets", () => {
  for (const file of FILES) {
    it(`${file} contains no forbidden secret references`, () => {
      const path = resolve(process.cwd(), file);
      const text = readFileSync(path, "utf8");
      for (const rx of FORBIDDEN) {
        expect(text, `expected ${file} to not contain ${rx}`).not.toMatch(rx);
      }
    });
  }
});
