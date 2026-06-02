import { test, expect } from "vitest";
import { resolvePaddleConfig } from "@/lib/paddleConfig";

test("debug paddle config in vitest", () => {
  const meta = import.meta as any;
  meta.env.VITE_PADDLE_ENVIRONMENT = "sandbox";
  meta.env.VITE_PADDLE_CLIENT_TOKEN = "test_token_abc";
  meta.env.VITE_PADDLE_PRICE_PRO_MONTHLY = "pri_sandbox_pro_monthly";
  meta.env.VITE_PADDLE_PRICE_PRO_ANNUAL = "pri_sandbox_pro_annual";
  meta.env.VITE_PADDLE_PRICE_FOUNDER_LIFETIME = "pri_sandbox_founder";
  
  const cfg = resolvePaddleConfig();
  console.log("config:", JSON.stringify(cfg));
  expect(cfg.available).toBe(true);
});
