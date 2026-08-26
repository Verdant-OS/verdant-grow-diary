/**
 * The legacy BYO webhook stays pinned to sandbox (PADDLE_ENVIRONMENT must be
 * "sandbox"), but it shared PADDLE_PRICE_* names with get-paddle-price, which
 * selects its catalog from the SERVER's PAYMENTS_ENVIRONMENT. At a live
 * transition those names hold LIVE ids, and paddle-webhook's plan
 * classification silently returned null for every sandbox event.
 *
 * These assert on RESOLVED VALUES from the imported resolver, not source text.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePaddleSandboxPriceConfig,
  PADDLE_LEGACY_PRICE_ENV_NAMES,
  PADDLE_SANDBOX_PRICE_ENV_NAMES,
} from "../../supabase/functions/_shared/paddleSandboxPriceConfig.ts";

const envFrom = (map: Record<string, string>) => (name: string) => map[name];

const SANDBOX_IDS = {
  pro_monthly: "pri_sandbox_pro_monthly",
  pro_annual: "pri_sandbox_pro_annual",
  founder_lifetime: "pri_sandbox_founder",
};
const LIVE_IDS = {
  pro_monthly: "pri_live_pro_monthly",
  pro_annual: "pri_live_pro_annual",
  founder_lifetime: "pri_live_founder",
};

const legacyEnv = (ids: typeof SANDBOX_IDS) => ({
  [PADDLE_LEGACY_PRICE_ENV_NAMES.pro_monthly]: ids.pro_monthly,
  [PADDLE_LEGACY_PRICE_ENV_NAMES.pro_annual]: ids.pro_annual,
  [PADDLE_LEGACY_PRICE_ENV_NAMES.founder_lifetime]: ids.founder_lifetime,
});
const sandboxEnv = (ids: typeof SANDBOX_IDS) => ({
  [PADDLE_SANDBOX_PRICE_ENV_NAMES.pro_monthly]: ids.pro_monthly,
  [PADDLE_SANDBOX_PRICE_ENV_NAMES.pro_annual]: ids.pro_annual,
  [PADDLE_SANDBOX_PRICE_ENV_NAMES.founder_lifetime]: ids.founder_lifetime,
});

describe("paddle-webhook sandbox price config — backward compatibility", () => {
  it("falls back to the legacy names when no sandbox-scoped name is set", () => {
    const cfg = resolvePaddleSandboxPriceConfig(envFrom(legacyEnv(SANDBOX_IDS)));
    expect(cfg).toEqual(SANDBOX_IDS);
  });

  it("treats absent and blank identically", () => {
    const cfg = resolvePaddleSandboxPriceConfig(
      envFrom({ [PADDLE_LEGACY_PRICE_ENV_NAMES.pro_monthly]: "   " }),
    );
    expect(cfg).toEqual({ pro_monthly: "", pro_annual: "", founder_lifetime: "" });
  });

  it("trims surrounding whitespace", () => {
    const cfg = resolvePaddleSandboxPriceConfig(
      envFrom({ [PADDLE_LEGACY_PRICE_ENV_NAMES.pro_monthly]: "  pri_x  " }),
    );
    expect(cfg.pro_monthly).toBe("pri_x");
  });
});

describe("paddle-webhook sandbox price config — decoupling from the live catalog", () => {
  it("prefers sandbox-scoped names when they are set", () => {
    const cfg = resolvePaddleSandboxPriceConfig(envFrom(sandboxEnv(SANDBOX_IDS)));
    expect(cfg).toEqual(SANDBOX_IDS);
  });

  it("IGNORES live ids left in the legacy names once sandbox-scoped names are set", () => {
    const cfg = resolvePaddleSandboxPriceConfig(
      envFrom({ ...legacyEnv(LIVE_IDS), ...sandboxEnv(SANDBOX_IDS) }),
    );
    expect(cfg).toEqual(SANDBOX_IDS);
    expect(Object.values(cfg)).not.toContain(LIVE_IDS.pro_monthly);
  });

  it("does not MIX legacy values in when the sandbox set is only partly configured", () => {
    // Fail closed: a partial sandbox config must not silently borrow live ids
    // for the unset keys. An unmatched price yields null downstream, which is
    // the existing safe behaviour for an unknown price.
    const cfg = resolvePaddleSandboxPriceConfig(
      envFrom({
        ...legacyEnv(LIVE_IDS),
        [PADDLE_SANDBOX_PRICE_ENV_NAMES.pro_monthly]: SANDBOX_IDS.pro_monthly,
      }),
    );
    expect(cfg.pro_monthly).toBe(SANDBOX_IDS.pro_monthly);
    expect(cfg.pro_annual).toBe("");
    expect(cfg.founder_lifetime).toBe("");
  });

  it("whitespace-only sandbox name must NOT resolve to a live/legacy id", () => {
    // Presence is raw env presence, not trimmed length. A whitespace-only
    // PADDLE_SANDBOX_PRICE_* key still selects the sandbox set exclusively;
    // trimmed values become "" and must never fall through to PADDLE_PRICE_*.
    const cfg = resolvePaddleSandboxPriceConfig(
      envFrom({
        ...legacyEnv(LIVE_IDS),
        [PADDLE_SANDBOX_PRICE_ENV_NAMES.pro_monthly]: "   ",
      }),
    );
    expect(cfg).toEqual({ pro_monthly: "", pro_annual: "", founder_lifetime: "" });
    expect(Object.values(cfg)).not.toContain(LIVE_IDS.pro_monthly);
    expect(Object.values(cfg)).not.toContain(LIVE_IDS.pro_annual);
    expect(Object.values(cfg)).not.toContain(LIVE_IDS.founder_lifetime);
  });

  it("is deterministic across repeated calls", () => {
    const env = envFrom({ ...legacyEnv(LIVE_IDS), ...sandboxEnv(SANDBOX_IDS) });
    expect(resolvePaddleSandboxPriceConfig(env)).toEqual(resolvePaddleSandboxPriceConfig(env));
  });
});
