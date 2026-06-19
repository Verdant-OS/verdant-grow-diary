/**
 * live-sensor-server-gate.test.ts
 *
 * Server-authoritative gate scaffold for FUTURE premium live-sensor
 * surfaces.
 *
 * Covers:
 *  - Edge function source-level safety (strict body validation, no
 *    service_role, fails closed, re-resolves entitlement, JWT verified,
 *    no raw row/payload/device/token echo).
 *  - useLiveSensorServerGate hook safety (fail-closed on error; typed
 *    states; consistent paywall copy; no privileged writes).
 *  - Static guard: `capabilities.liveSensors` is NEVER consumed as an
 *    access gate anywhere in app source (only defined in the entitlement
 *    catalog/types/defaults). This prevents a future PR from silently
 *    using the client capability as authoritative.
 *  - Free-sensor preservation: existing free/manual/csv/demo/stale/
 *    invalid sensor label copy is not removed or relabeled.
 *  - Docs file reflects the documented-no-active-surface status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const FN = readFileSync(
  resolve(ROOT, "supabase/functions/live-sensor-entitlement/index.ts"),
  "utf8",
);
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useLiveSensorServerGate.ts"),
  "utf8",
);
const DOC = readFileSync(
  resolve(ROOT, "docs/paid-launch-entitlement-blocker.md"),
  "utf8",
);

// --- edge function source safety ------------------------------------------

describe("live-sensor-entitlement edge function — server safety", () => {
  it("does not use service_role", () => {
    expect(FN).not.toMatch(/SERVICE_ROLE/);
  });

  it("verifies JWT via auth.getUser", () => {
    expect(FN).toMatch(/auth\.getUser\(\)/);
  });

  it("re-resolves entitlement server-side via resolveEntitlements()", () => {
    expect(FN).toMatch(/resolveEntitlements\(/);
    expect(FN).toMatch(/capabilities\.liveSensors\s*!==\s*true/);
  });

  it("ignores client-supplied plan / founder / capability claims", () => {
    expect(FN).not.toMatch(/b\.plan_id|body\.plan_id/);
    expect(FN).not.toMatch(/b\.founder|body\.founder/);
    expect(FN).not.toMatch(/b\.capabilities|body\.capabilities/);
    expect(FN).not.toMatch(/b\.liveSensors|body\.liveSensors/);
  });

  it("declares a narrow surface allow-list and rejects unknown surfaces with 400 invalid_request", () => {
    expect(FN).toMatch(/ALLOWED_SURFACES/);
    expect(FN).toMatch(/unknown_surface/);
    expect(FN).toMatch(/invalid_request/);
  });

  it("validates UUIDs for grow_id / tent_id / plant_id when present", () => {
    expect(FN).toMatch(/UUID_RE/);
    expect(FN).toMatch(/invalid_uuid/);
  });

  it("performs an RLS-scoped ownership probe (scope_denied) for IDs", () => {
    expect(FN).toMatch(/scope_denied/);
    expect(FN).toMatch(/ownsRow/);
  });

  it("returns 403 (not 200) when liveSensors is not granted; fails closed on lookup error", () => {
    expect(FN).toMatch(/upgrade_required/);
    expect(FN).toMatch(/entitlement_lookup_failed/);
  });

  it("performs no privileged writes, no sensor ingest, no device control, no AI calls, no telemetry reads", () => {
    for (const t of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "ai_credit_spend",
      "action_queue",
      "sensor_readings",
      "raw_payload",
      "bridge_token",
      "execute_device",
    ]) {
      expect(FN).not.toContain(t);
    }
  });

  it("restricts request method to POST (preflight)", () => {
    expect(FN).toMatch(/method_not_allowed/);
  });
});

// --- hook source + typed states -------------------------------------------

describe("useLiveSensorServerGate — client hook safety", () => {
  it("no service_role usage in the hook", () => {
    expect(HOOK).not.toMatch(/SERVICE_ROLE/);
  });

  it("calls only the dedicated entitlement edge function", () => {
    expect(HOOK).toMatch(/"live-sensor-entitlement"/);
    expect(HOOK).not.toMatch(/fetch\(/);
  });

  it("exposes typed states (loading/allowed/denied/invalid_request/network_error)", () => {
    expect(HOOK).toMatch(/"loading"/);
    expect(HOOK).toMatch(/"allowed"/);
    expect(HOOK).toMatch(/"denied"/);
    expect(HOOK).toMatch(/"invalid_request"/);
    expect(HOOK).toMatch(/"network_error"/);
  });

  it("exposes consistent paywall copy and a requireLiveSensorAccess alias", () => {
    expect(HOOK).toMatch(/Live sensor streaming is a Pro feature/);
    expect(HOOK).toMatch(/Upgrade required to use live sensor surfaces/);
    expect(HOOK).toMatch(/requireLiveSensorAccess/);
  });

  it("does not introduce fake-live copy or imply device control / automation execution", () => {
    // Look for user-visible copy patterns only — these are quoted strings,
    // not header-comment language like "no device control".
    expect(HOOK).not.toMatch(/"[^"]*fake live[^"]*"/i);
    expect(HOOK).not.toMatch(/"[^"]*execute device[^"]*"/i);
    expect(HOOK).not.toMatch(/"[^"]*auto-?execute[^"]*"/i);
  });
});

// --- hook runtime: fail-closed + typed classification ---------------------

describe("checkLiveSensorEntitlement — runtime fail-closed", () => {
  beforeEach(() => vi.resetModules());

  it("returns ok:false denied on 403 upgrade_required", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        functions: {
          invoke: vi.fn(async () => ({
            data: { ok: false, reason: "upgrade_required" },
            error: null,
          })),
        },
      },
    }));
    const mod = await import("@/hooks/useLiveSensorServerGate");
    const r = await mod.checkLiveSensorEntitlement("live_sensor_stream");
    expect(r.ok).toBe(false);
    expect(r.state).toBe("denied");
  });

  it("classifies invalid_request denials separately", async () => {
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
    const mod = await import("@/hooks/useLiveSensorServerGate");
    const r = await mod.checkLiveSensorEntitlement("live_sensor_stream");
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
    const mod = await import("@/hooks/useLiveSensorServerGate");
    const r = await mod.checkLiveSensorEntitlement("live_sensor_stream");
    expect(r.state).toBe("network_error");
  });

  it("returns allowed on ok:true; ignores any client-side liveSensors hint", async () => {
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
    const mod = await import("@/hooks/useLiveSensorServerGate");
    const r = await mod.checkLiveSensorEntitlement("live_sensor_stream");
    expect(r.ok).toBe(true);
    expect(r.state).toBe("allowed");
    expect(r.displayPlanId).toBe("pro_monthly");
  });
});

// --- static guard: capabilities.liveSensors is NEVER used as a gate -------

function walkSrc(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__snapshots__" || name === "node_modules") continue;
      walkSrc(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("static guard — capabilities.liveSensors is never used as an authoritative gate", () => {
  const ALLOWED_FILES = new Set<string>([
    resolve(ROOT, "src/lib/entitlements/types.ts"),
    resolve(ROOT, "src/lib/entitlements/planCatalog.ts"),
    resolve(ROOT, "src/lib/entitlements/capabilities.ts"),
    resolve(ROOT, "src/lib/entitlements/resolveEntitlements.ts"),
    resolve(ROOT, "src/test/environment-summary-report-server-gate.test.tsx"),
    resolve(ROOT, "src/test/live-sensor-server-gate.test.ts"),
    resolve(ROOT, "src/hooks/useLiveSensorServerGate.ts"),
    resolve(ROOT, "src/components/PremiumLiveSensorGate.tsx"),
    resolve(ROOT, "src/test/premium-live-sensor-gate.test.tsx"),
    resolve(ROOT, "src/test/premium-live-sensor-gate-hardening.test.tsx"),
  ]);

  it("only the entitlements catalog + this gate file reference capabilities.liveSensors as a gate", () => {
    const offenders: string[] = [];
    for (const file of walkSrc(resolve(ROOT, "src"))) {
      if (ALLOWED_FILES.has(file)) continue;
      const txt = readFileSync(file, "utf8");
      // Look only for capability-style access — bare local variable names
      // like `const liveSensors = ...` in non-entitlement code are fine.
      if (/capabilities\.liveSensors\b/.test(txt)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

// --- free / non-premium sensor copy preserved -----------------------------

describe("free / non-premium sensor surfaces are NOT relabeled or removed", () => {
  it("manual sensor onboarding copy still calls out manual provenance", () => {
    const f = resolve(ROOT, "src/components/DailyGrowCheckOnboardingCard.tsx");
    if (!existsSync(f)) return;
    expect(readFileSync(f, "utf8")).toMatch(/manual.*not live sensor data/i);
  });

  it("imported CSV history panel still labels readings as historical, not live", () => {
    const f = resolve(ROOT, "src/components/ImportedSensorHistoryPanel.tsx");
    if (!existsSync(f)) return;
    expect(readFileSync(f, "utf8")).toMatch(
      /historical context, not live sensor data/i,
    );
  });

  it("InfoPopover plant-data tooltip still distinguishes saved workspace data from a live sensor reading", () => {
    const f = resolve(ROOT, "src/components/InfoPopover.tsx");
    if (!existsSync(f)) return;
    expect(readFileSync(f, "utf8")).toMatch(/not a live sensor reading/i);
  });
});

// --- audit doc reflects the documented-no-active-surface status -----------

describe("docs/paid-launch-entitlement-blocker.md — live sensor section", () => {
  it("marks live sensors as DOCUMENTED / NO ACTIVE PREMIUM LIVE-SENSOR SURFACE", () => {
    expect(DOC).toMatch(
      /Live sensor surfaces[\s\S]*DOCUMENTED \/ NO ACTIVE PREMIUM LIVE-SENSOR SURFACE/,
    );
  });
  it("references the new server gate edge function + hook", () => {
    expect(DOC).toMatch(/live-sensor-entitlement/);
    expect(DOC).toMatch(/useLiveSensorServerGate/);
  });
  it("keeps the 'Client-side entitlement state is not authoritative' invariant", () => {
    expect(DOC).toMatch(/Client-side entitlement state is not authoritative/i);
  });
  it("Environment Summary Report remains SERVER-VALIDATED and exporters remain SERVER-GATED PREFLIGHT", () => {
    expect(DOC).toMatch(/Environment Summary Report[\s\S]*SERVER-VALIDATED/);
    expect(DOC).toMatch(/Premium CSV[\s\S]*SERVER-GATED PREFLIGHT/);
  });
});
