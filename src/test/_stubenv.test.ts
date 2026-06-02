import { test, expect, vi } from "vitest";
import { resolvePaddleConfig } from "@/lib/paddleConfig";

test("vi.stubEnv paddle", () => {
  vi.stubEnv("VITE_PADDLE_ENVIRONMENT", "sandbox");
  vi.stubEnv("VITE_PADDLE_CLIENT_TOKEN", "test_token_abc");
  vi.stubEnv("VITE_PADDLE_PRICE_PRO_MONTHLY", "pri_sandbox_pro_monthly");
  vi.stubEnv("VITE_PADDLE_PRICE_PRO_ANNUAL", "pri_sandbox_pro_annual");
  vi.stubEnv("VITE_PADDLE_PRICE_FOUNDER_LIFETIME", "pri_sandbox_founder");
  
  const cfg = resolvePaddleConfig();
  console.log("config:", JSON.stringify(cfg));
  expect(cfg.available).toBe(true);
  
  vi.unstubAllEnvs();
});
