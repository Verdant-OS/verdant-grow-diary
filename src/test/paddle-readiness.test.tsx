/**
 * Paddle sandbox readiness audit tests.
 *
 * Verifies:
 *  - paddleConfig refuses live/production env
 *  - paddleConfig returns "unavailable" when required values are missing
 *  - billing page renders unavailable state without config
 *  - billing page renders sandbox checkout button when config is present
 *  - billing page compliance copy is present (software-only, no cannabis sales)
 *  - billing page does not grant Pro from client checkout success
 *  - webhook scaffolding verifies signature on raw body and stores
 *    events idempotently before any entitlement change
 *  - copy safety: no autopilot, no guaranteed yield, no cannabis sales,
 *    no equipment-control promises
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BillingPlaceholder from "@/pages/BillingPlaceholder";
import {
  resolvePaddleConfig,
  unavailableMessage,
  PADDLE_SANDBOX_ENV,
} from "@/lib/paddleConfig";

// Module-level env override for render tests. import.meta.env does not cross
// ESM module boundaries, so we proxy the no-args call from BillingPlaceholder.
let _paddleTestEnv: Record<string, string> | null = null;

vi.mock("@/lib/paddleConfig", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/paddleConfig")>();
  return {
    ...mod,
    resolvePaddleConfig: (source?: any) => {
      if (source) return mod.resolvePaddleConfig(source);
      return mod.resolvePaddleConfig(_paddleTestEnv ?? {});
    },
  };
});

const SANDBOX_ENV = {
  VITE_PADDLE_ENVIRONMENT: "sandbox",
  VITE_PADDLE_CLIENT_TOKEN: "test_token_abc",
  VITE_PADDLE_PRICE_PRO_MONTHLY: "pri_sandbox_pro_monthly",
  VITE_PADDLE_PRICE_PRO_ANNUAL: "pri_sandbox_pro_annual",
  VITE_PADDLE_PRICE_FOUNDER_LIFETIME: "pri_sandbox_founder",
};

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const readRoot = (p: string) => readFileSync(resolve(root, p), "utf8");

const BILLING_SRC = readSrc("pages/BillingPlaceholder.tsx");
const CONFIG_SRC = readSrc("lib/paddleConfig.ts");
const WEBHOOK_SRC = readRoot("supabase/functions/paddle-webhook/index.ts");
const ENV_EXAMPLE = readRoot(".env.example");
const BILLING_DOC = readRoot("docs/billing.md");

describe("resolvePaddleConfig", () => {
  it("returns unavailable when environment is missing", () => {
    const cfg = resolvePaddleConfig({});
    expect(cfg.available).toBe(false);
    if (!cfg.available) expect(cfg.reason).toBe("missing_environment");
  });

  it("refuses live environment", () => {
    const cfg = resolvePaddleConfig({ ...SANDBOX_ENV, VITE_PADDLE_ENVIRONMENT: "live" });
    expect(cfg.available).toBe(false);
    if (!cfg.available) expect(cfg.reason).toBe("live_not_allowed");
  });

  it("refuses production environment", () => {
    const cfg = resolvePaddleConfig({ ...SANDBOX_ENV, VITE_PADDLE_ENVIRONMENT: "production" });
    expect(cfg.available).toBe(false);
    if (!cfg.available) expect(cfg.reason).toBe("live_not_allowed");
  });

  it("returns unavailable when client token is missing", () => {
    const cfg = resolvePaddleConfig({ ...SANDBOX_ENV, VITE_PADDLE_CLIENT_TOKEN: "" });
    expect(cfg.available).toBe(false);
    if (!cfg.available) expect(cfg.reason).toBe("missing_client_token");
  });

  it("returns unavailable when any price id is missing", () => {
    const cfg = resolvePaddleConfig({ ...SANDBOX_ENV, VITE_PADDLE_PRICE_PRO_ANNUAL: "" });
    expect(cfg.available).toBe(false);
    if (!cfg.available) expect(cfg.reason).toBe("missing_price_id");
  });

  it("returns available with sandbox env and all price ids", () => {
    const cfg = resolvePaddleConfig(SANDBOX_ENV);
    expect(cfg.available).toBe(true);
    if (cfg.available) {
      expect(cfg.environment).toBe(PADDLE_SANDBOX_ENV);
      expect(cfg.priceIds["pro-monthly"]).toBe("pri_sandbox_pro_monthly");
      expect(cfg.priceIds["pro-annual"]).toBe("pri_sandbox_pro_annual");
      expect(cfg.priceIds["founder-lifetime"]).toBe("pri_sandbox_founder");
    }
  });

  it("provides unavailable messages for each reason", () => {
    expect(unavailableMessage("live_not_allowed")).toMatch(/sandbox/i);
    expect(unavailableMessage("missing_client_token")).toMatch(/finalized/i);
    expect(unavailableMessage("missing_price_id")).toMatch(/finalized/i);
    expect(unavailableMessage("missing_environment")).toMatch(/finalized/i);
  });
});

function renderBilling(plan: string) {
  return render(
    <MemoryRouter initialEntries={[`/billing/${plan}`]}>
      <Routes>
        <Route path="/billing/:plan" element={<BillingPlaceholder />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BillingPlaceholder rendering", () => {
  beforeEach(() => {
    _paddleTestEnv = {};
  });

  afterEach(() => {
    _paddleTestEnv = null;
    vi.restoreAllMocks();
  });

  it("renders the unavailable state when sandbox config is missing", () => {
    renderBilling("pro-monthly");
    expect(screen.getByTestId("paddle-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("paddle-sandbox-checkout-button")).toBeNull();
    expect(screen.getByText(/No payment is being collected/i)).toBeInTheDocument();
  });

  it("refuses to render checkout when env is live", () => {
    _paddleTestEnv = { ...SANDBOX_ENV, VITE_PADDLE_ENVIRONMENT: "live" };
    renderBilling("pro-monthly");
    expect(screen.getByTestId("paddle-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("paddle-sandbox-checkout-button")).toBeNull();
  });

  it("renders the sandbox checkout button when sandbox config is present", () => {
    _paddleTestEnv = { ...SANDBOX_ENV };
    renderBilling("pro-monthly");
    expect(screen.getByTestId("paddle-sandbox-ready")).toBeInTheDocument();
    const btn = screen.getByTestId("paddle-sandbox-checkout-button");
    expect(btn).toBeInTheDocument();
    expect(screen.getByText(/Sandbox \/ test mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro access is/i)).toBeInTheDocument();
  });

  it("renders the compliance note on every variant", () => {
    renderBilling("pro-monthly");
    const note = screen.getByTestId("billing-compliance-note");
    expect(note).toBeInTheDocument();
    expect(note.textContent ?? "").toMatch(/sells software only/i);
    expect(note.textContent ?? "").toMatch(/does not sell cannabis/i);
  });

  it("does not grant Pro entitlement from clicking the sandbox button", () => {
    _paddleTestEnv = { ...SANDBOX_ENV };
    renderBilling("pro-monthly");
    const btn = screen.getByTestId("paddle-sandbox-checkout-button");
    btn.click();
    // No flag is set in localStorage / sessionStorage by the click handler.
    const ls = JSON.stringify({ ...localStorage });
    const ss = JSON.stringify({ ...sessionStorage });
    expect(ls).not.toMatch(/pro|entitlement|subscriber/i);
    expect(ss).not.toMatch(/pro|entitlement|subscriber/i);
  });
});

describe("BillingPlaceholder source safety", () => {
  it("never grants Pro from client checkout success", () => {
    // Defensive: scan the file for any direct entitlement writes.
    expect(BILLING_SRC).not.toMatch(/setPro|grantPro|isPro\s*=\s*true/i);
    expect(BILLING_SRC).not.toMatch(/\.from\(["']profiles["']\)\s*\.update/);
    expect(BILLING_SRC).not.toMatch(/\.from\(["']subscriptions["']\)/);
    expect(BILLING_SRC).not.toMatch(/\.from\(["']entitlements["']\)/);
  });

  it("does not import the supabase client", () => {
    expect(BILLING_SRC).not.toMatch(/@\/integrations\/supabase\/client/);
  });

  it("does not include service_role anywhere", () => {
    expect(BILLING_SRC).not.toMatch(/service_role/i);
    expect(CONFIG_SRC).not.toMatch(/service_role/i);
  });

  it("contains no autopilot / guaranteed yield / cannabis sales / equipment control copy", () => {
    const sources = [BILLING_SRC, CONFIG_SRC, BILLING_DOC];
    const forbidden: RegExp[] = [
      /autopilot(?! )/i,
      /guaranteed yield/i,
      /buy weed/i,
      /sell cannabis/i,
      /\bwe control your (fans|lights|pumps|heaters|dehumidifiers|equipment)\b/i,
      /we will grow for you/i,
    ];
    for (const src of sources) {
      for (const p of forbidden) {
        // Allow the words to appear only inside an explicit *refutation*
        // (e.g. "never grows for you on autopilot"). The patterns above
        // are written to match marketing claims, not refutations.
        if (p.source.includes("autopilot")) {
          // Special-case: allow "on autopilot" only when preceded by "never".
          const positive = /(?<!never (grows for you )?on )autopilot/i;
          expect(src).not.toMatch(positive);
          continue;
        }
        expect(src).not.toMatch(p);
      }
    }
  });
});

describe("Paddle webhook scaffolding", () => {
  it("reads the raw body before parsing JSON", () => {
    // The function must call req.text() (raw body) and only JSON.parse AFTER
    // signature verification.
    const rawIdx = WEBHOOK_SRC.indexOf("req.text()");
    const parseIdx = WEBHOOK_SRC.indexOf("JSON.parse(rawBody)");
    expect(rawIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(parseIdx);
  });

  it("verifies the Paddle-Signature header via HMAC-SHA256", () => {
    expect(WEBHOOK_SRC).toMatch(/paddle-signature/i);
    expect(WEBHOOK_SRC).toMatch(/HMAC/);
    expect(WEBHOOK_SRC).toMatch(/SHA-256/);
    expect(WEBHOOK_SRC).toMatch(/constantTimeEqual/);
  });

  it("refuses when PADDLE_ENVIRONMENT is not sandbox", () => {
    expect(WEBHOOK_SRC).toMatch(/PADDLE_ENVIRONMENT/);
    expect(WEBHOOK_SRC).toMatch(/sandbox_only/);
  });

  it("stores events idempotently in paddle_events before any entitlement change", () => {
    expect(WEBHOOK_SRC).toMatch(/paddle_events/);
    expect(WEBHOOK_SRC).toMatch(/event_id/);
    // Idempotency: handles 23505 unique_violation as duplicate-OK.
    expect(WEBHOOK_SRC).toMatch(/23505/);
    expect(WEBHOOK_SRC).toMatch(/duplicate/);
  });

  it("does NOT mutate user entitlements in the webhook scaffold", () => {
    expect(WEBHOOK_SRC).not.toMatch(/\.from\(["']profiles["']\)\s*\.update/);
    expect(WEBHOOK_SRC).not.toMatch(/\.from\(["']entitlements["']\)/);
    expect(WEBHOOK_SRC).not.toMatch(/setPro|grantPro|isPro\s*=\s*true/);
  });

  it("does not trust client-provided user_id", () => {
    expect(WEBHOOK_SRC).not.toMatch(/user_id:\s*evt\??\./);
    expect(WEBHOOK_SRC).not.toMatch(/user_id:\s*body\./);
  });
});

describe(".env.example sandbox keys", () => {
  it("documents sandbox-only Paddle env vars", () => {
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_ENVIRONMENT="sandbox"/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_CLIENT_TOKEN/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_PRO_MONTHLY/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_PRO_ANNUAL/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_FOUNDER_LIFETIME/);
  });

  it("does NOT include server-only secrets in .env.example", () => {
    expect(ENV_EXAMPLE).not.toMatch(/^PADDLE_WEBHOOK_SECRET\s*=/m);
    expect(ENV_EXAMPLE).not.toMatch(/^PADDLE_API_KEY\s*=/m);
    expect(ENV_EXAMPLE).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
  });

  it("does not hardcode real Paddle price IDs", () => {
    // Sandbox vars are present with empty defaults — values must come from env.
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_PRO_MONTHLY=""/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_PRO_ANNUAL=""/);
    expect(ENV_EXAMPLE).toMatch(/VITE_PADDLE_PRICE_FOUNDER_LIFETIME=""/);
  });
});

describe("billing compliance doc", () => {
  it("declares software-only positioning", () => {
    expect(BILLING_DOC).toMatch(/Verdant sells software, not cannabis/i);
    expect(BILLING_DOC).toMatch(/does not sell/i);
  });

  it("documents the sandbox-only posture and webhook entitlement rule", () => {
    expect(BILLING_DOC).toMatch(/sandbox/i);
    expect(BILLING_DOC).toMatch(/verified Paddle webhook/i);
    expect(BILLING_DOC).toMatch(/never.*client/i);
  });

  it("lists what is still required before live payments", () => {
    expect(BILLING_DOC).toMatch(/before live payments/i);
    expect(BILLING_DOC).toMatch(/live verification/i);
    expect(BILLING_DOC).toMatch(/entitlement/i);
  });
});
