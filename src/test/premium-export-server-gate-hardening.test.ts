/**
 * premium-export-server-gate-hardening.test.ts
 *
 * Static + behavioral guards for the hardened premium export preflight.
 *  - Edge function validates request body (feature allow-list, UUIDs,
 *    date range) and rejects with 400 invalid_request (not 200).
 *  - Edge function never trusts client plan/founder claims.
 *  - Edge function never uses service_role.
 *  - Edge function performs RLS-scoped scope ownership check when IDs are
 *    present (denies cross-user).
 *  - Hook exposes typed state {allowed,denied,invalid_request,network_error}
 *    and reusable requirePremiumExportAccess helper.
 *  - Docs file lists premium exporters as SERVER-GATED PREFLIGHT.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FN = readFileSync(
  resolve(process.cwd(), "supabase/functions/premium-export-entitlement/index.ts"),
  "utf8",
);
const HOOK = readFileSync(
  resolve(process.cwd(), "src/hooks/usePremiumExportServerGate.ts"),
  "utf8",
);
const DOC = readFileSync(
  resolve(process.cwd(), "docs/paid-launch-entitlement-blocker.md"),
  "utf8",
);

describe("premium export edge function — strict body validation", () => {
  it("declares a narrow feature allow-list including all 3 AI Doctor exports", () => {
    expect(FN).toMatch(/"ai_doctor_report"/);
    expect(FN).toMatch(/"ai_doctor_evidence_csv"/);
    expect(FN).toMatch(/"ai_doctor_report_package"/);
  });

  it("rejects unknown features with invalid_request (400)", () => {
    expect(FN).toMatch(/unknown_feature/);
    expect(FN).toMatch(/invalid_request/);
  });

  it("validates UUIDs for grow_id / tent_id / plant_id when present", () => {
    expect(FN).toMatch(/UUID_RE/);
    expect(FN).toMatch(/grow_id/);
    expect(FN).toMatch(/tent_id/);
    expect(FN).toMatch(/plant_id/);
    expect(FN).toMatch(/invalid_uuid/);
  });

  it("validates ISO dates and start <= end with a bounded max range", () => {
    expect(FN).toMatch(/start_after_end/);
    expect(FN).toMatch(/range_too_large/);
    expect(FN).toMatch(/MAX_RANGE_DAYS/);
  });

  it("ignores client-supplied plan / founder / capability claims", () => {
    expect(FN).not.toMatch(/body\.plan_id|b\.plan_id/);
    expect(FN).not.toMatch(/body\.founder|b\.founder/);
    expect(FN).not.toMatch(/body\.capabilities|b\.capabilities/);
  });

  it("performs an RLS-scoped ownership check (scope_denied) for IDs", () => {
    expect(FN).toMatch(/scope_denied/);
    expect(FN).toMatch(/ownsRow/);
  });

  it("never uses service_role", () => {
    expect(FN).not.toMatch(/SERVICE_ROLE/);
  });

  it("never writes / never executes device control / never calls AI", () => {
    for (const t of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "ai_credit_spend",
      "action_queue",
      "sensor_readings",
      "execute_device",
    ]) {
      expect(FN).not.toContain(t);
    }
  });
});

describe("hook — reusable typed gate helper", () => {
  it("exports requirePremiumExportAccess as a canonical alias", () => {
    expect(HOOK).toMatch(/requirePremiumExportAccess/);
  });
  it("returns typed state values (allowed/denied/invalid_request/network_error)", () => {
    expect(HOOK).toMatch(/"allowed"/);
    expect(HOOK).toMatch(/"denied"/);
    expect(HOOK).toMatch(/"invalid_request"/);
    expect(HOOK).toMatch(/"network_error"/);
  });
  it("exposes consistent paywall headline + upgrade copy", () => {
    expect(HOOK).toMatch(/Pro feature/);
    expect(HOOK).toMatch(/Upgrade required/);
  });
});

describe("hook runtime — typed state classification", () => {
  beforeEach(() => vi.resetModules());

  it("classifies invalid_request denials separately from upgrade_required", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        functions: {
          invoke: vi.fn(async () => ({
            data: { ok: false, reason: "invalid_request" },
            error: null,
          })),
        },
      },
    }));
    const mod = await import("@/hooks/usePremiumExportServerGate");
    const r = await mod.checkPremiumExportEntitlement("ai_doctor_report");
    expect(r.ok).toBe(false);
    expect(r.state).toBe("invalid_request");
  });

  it("classifies thrown errors as network_error", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        functions: {
          invoke: vi.fn(async () => {
            throw new Error("network down");
          }),
        },
      },
    }));
    const mod = await import("@/hooks/usePremiumExportServerGate");
    const r = await mod.checkPremiumExportEntitlement("ai_doctor_report");
    expect(r.ok).toBe(false);
    expect(r.state).toBe("network_error");
  });

  it("returns allowed on ok:true server response", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        functions: {
          invoke: vi.fn(async () => ({
            data: { ok: true, display_plan_id: "pro_monthly" },
            error: null,
          })),
        },
      },
    }));
    const mod = await import("@/hooks/usePremiumExportServerGate");
    const r = await mod.checkPremiumExportEntitlement("ai_doctor_report");
    expect(r.ok).toBe(true);
    expect(r.state).toBe("allowed");
    expect(r.displayPlanId).toBe("pro_monthly");
  });
});

describe("audit doc — confirmed premium export surfaces", () => {
  it("lists premium exporters as SERVER-GATED PREFLIGHT", () => {
    expect(DOC).toMatch(/SERVER-GATED PREFLIGHT/);
    expect(DOC).toMatch(/ai_doctor_report/);
    expect(DOC).toMatch(/ai_doctor_evidence_csv/);
    expect(DOC).toMatch(/ai_doctor_report_package/);
  });
  it("keeps the 'client-side entitlement state is not authoritative' invariant", () => {
    expect(DOC).toMatch(/Client-side entitlement state is not authoritative/i);
  });
  it("notes residual: export bytes still generated client-side from redacted inputs", () => {
    expect(DOC).toMatch(/generated\s+(in the browser|client-side)/i);
    expect(DOC).toMatch(/redacted/);
  });
  it("Environment Summary Report remains fixed", () => {
    expect(DOC).toMatch(/Environment Summary Report[\s\S]{0,200}SERVER-VALIDATED/);
  });
  it("Live sensor surfaces have server gate scaffold (no active premium surface today)", () => {
    expect(DOC).toMatch(/Live sensor surfaces[\s\S]{0,400}DOCUMENTED \/ NO ACTIVE PREMIUM LIVE-SENSOR SURFACE/);
  });
});
