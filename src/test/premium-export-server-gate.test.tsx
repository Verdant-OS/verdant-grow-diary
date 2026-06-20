/**
 * premium-export-server-gate.test.tsx
 *
 * Verifies the server-authoritative entitlement preflight for premium
 * CSV / report exporters. Covers:
 *  - Edge function source-level safety (no service_role, fails closed,
 *    re-resolves entitlement, JWT verified, raw row never echoed).
 *  - usePremiumExportServerGate client hook safety (fail-closed on error;
 *    treats 403 as denial; no privileged writes).
 *  - AiDoctorDiagnosisPanel calls the preflight before downloading and
 *    renders the paywall copy on denial without crashing.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import {
  checkPremiumExportEntitlement,
  PREMIUM_EXPORT_PAYWALL_COPY,
} from "@/hooks/usePremiumExportServerGate";

// --- edge function source safety -------------------------------------------

describe("premium-export-entitlement edge function — server safety", () => {
  const FN = readFileSync(
    resolve(
      process.cwd(),
      "supabase/functions/premium-export-entitlement/index.ts",
    ),
    "utf8",
  );

  it("does not use service_role", () => {
    expect(FN).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(FN).not.toMatch(/Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE/);
  });

  it("verifies JWT via auth.getUser", () => {
    expect(FN).toMatch(/auth\.getUser\(\)/);
  });

  it("re-resolves entitlement server-side via resolveEntitlements()", () => {
    expect(FN).toMatch(/resolveEntitlements\(/);
    expect(FN).not.toMatch(/body\.plan_id|body\.founder/);
  });

  it("returns 403 (not 200) when advancedExports is not granted", () => {
    expect(FN).toMatch(/advancedExports\s*!==\s*true/);
    expect(FN).toMatch(/upgrade_required/);
  });

  it("fails closed on lookup error", () => {
    expect(FN).toMatch(/entitlement_lookup_failed/);
  });

  it("never exposes the raw billing row to the client", () => {
    expect(FN).not.toMatch(/provider_customer_id["']\s*:\s*row/);
    expect(FN).not.toMatch(/founder_number["']\s*:\s*row/);
  });

  it("performs no privileged writes / device control / AI calls", () => {
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

  it("restricts request method to POST (preflight)", () => {
    expect(FN).toMatch(/method_not_allowed/);
  });
});

// --- hook source + behavior safety -----------------------------------------

describe("usePremiumExportServerGate — client hook safety", () => {
  const HOOK = readFileSync(
    resolve(process.cwd(), "src/hooks/usePremiumExportServerGate.ts"),
    "utf8",
  );

  it("no service_role usage in the hook", () => {
    expect(HOOK).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(HOOK).not.toMatch(/service_role"\s*\)|service_role'\s*\)/);
  });

  it("calls only the dedicated entitlement edge function", () => {
    expect(HOOK).toMatch(/"premium-export-entitlement"/);
    expect(HOOK).not.toMatch(/fetch\(/);
  });

  it("paywall copy is clear and non-generic", () => {
    expect(PREMIUM_EXPORT_PAYWALL_COPY).toMatch(/Pro feature/);
    expect(PREMIUM_EXPORT_PAYWALL_COPY).toMatch(/Upgrade required/);
  });
});

// --- hook runtime: fail closed on any non-ok response ----------------------

vi.mock("@/integrations/supabase/client", () => {
  const supabase: any = {
    functions: {
      invoke: vi.fn(async () => ({
        data: { ok: false, reason: "upgrade_required" },
        error: { context: { status: 403 } },
      })),
    },
  };
  return { supabase };
});

describe("checkPremiumExportEntitlement — fail-closed runtime", () => {
  it("returns ok:false when server denies", async () => {
    const r = await checkPremiumExportEntitlement("ai_doctor_report");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("upgrade_required");
  });
});

// --- panel: preflight gate + paywall message --------------------------------

import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { AiDoctorReportInput } from "@/lib/aiDoctorReportRules";

function diag(): DiagnosisResult {
  return {
    summary: "Stable canopy.",
    likely_issue: "None",
    confidence: 0.6,
    evidence: [],
    missing_information: [],
    possible_causes: [],
    immediate_action: "Hold steady.",
    what_not_to_do: [],
    follow_up_24h: [],
    recovery_plan_3d: [],
    risk_level: "low",
    key_observations: [],
    recommended_actions: ["Hold steady."],
  } as unknown as DiagnosisResult;
}

function reportInput(): AiDoctorReportInput {
  return {
    generatedAt: "2026-06-08T12:00:00Z",
    summary: "Stable.",
    perMetric: [],
    recommendations: [],
    checklist: [],
    honesty: "Generated from currently available signals.",
    basis: [],
  } as unknown as AiDoctorReportInput;
}

describe("AiDoctorDiagnosisPanel — premium export server-gate integration", () => {
  it("renders the paywall message and does not crash when the server denies", async () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        reportInput={reportInput()}
      />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-download-report"),
    );
    await waitFor(() => {
      const msg = screen.getByTestId(
        "ai-doctor-diagnosis-package-message",
      );
      expect(msg.textContent ?? "").toMatch(/Pro feature/);
    });
  });
});
