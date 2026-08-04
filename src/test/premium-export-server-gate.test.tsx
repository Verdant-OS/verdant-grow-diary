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
import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import {
  checkPremiumExportEntitlement,
  PREMIUM_EXPORT_PAYWALL_COPY,
} from "@/hooks/usePremiumExportServerGate";

// --- edge function source safety -------------------------------------------

describe("premium-export-entitlement edge function — server safety", () => {
  const FN = readFileSync(
    resolve(process.cwd(), "supabase/functions/premium-export-entitlement/index.ts"),
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

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({
    data: { ok: false, reason: "upgrade_required" },
    error: { context: { status: 403 } },
  });
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
    alignment: null,
    evidenceSummary: {
      liveSensorUsable: false,
      envCheckPresent: false,
      hasRecentDiary: false,
      hasRecentPhotos: false,
    },
    environmentCheck: {
      show: false,
      capturedAt: null,
      statusLabel: "Not captured",
      metricRows: [],
    },
    recommendations: [],
    checklist: [],
  };
}

describe("AiDoctorDiagnosisPanel — premium export server-gate integration", () => {
  it("keeps the visible preview outside the global print whitelist before authorization", () => {
    const cssPath = resolve(process.cwd(), "src/index.css");
    const css = existsSync(cssPath)
      ? readFileSync(cssPath, "utf8")
      : readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-report"));

    expect(screen.getByTestId("ai-doctor-diagnosis-preview-body")).not.toHaveAttribute(
      "data-print-section",
    );
    expect(css).toContain('[data-print-section="ai-doctor-report"]');
  });

  it("renders the paywall message and does not crash when the server denies", async () => {
    render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-download-report"));
    await waitFor(() => {
      const msg = screen.getByTestId("ai-doctor-diagnosis-package-message");
      expect(msg.textContent ?? "").toMatch(/Pro feature/);
    });
  });

  it("does not print the report preview when the server denies", async () => {
    const originalPrint = window.print;
    const printSpy = vi.fn();
    window.print = printSpy as typeof window.print;

    try {
      render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-report"));
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-print"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-doctor-diagnosis-package-message")).toHaveTextContent(
          /Pro feature/,
        );
      });
      expect(printSpy).not.toHaveBeenCalled();
    } finally {
      window.print = originalPrint;
    }
  });

  it("prints the report preview exactly once after the server allows it", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, display_plan_id: "pro_monthly" },
      error: null,
    });
    const originalPrint = window.print;
    let printSectionAtCall: string | null = null;
    const printSpy = vi.fn(() => {
      printSectionAtCall = screen
        .getByTestId("ai-doctor-diagnosis-preview-body")
        .getAttribute("data-print-section");
    });
    window.print = printSpy as typeof window.print;

    try {
      render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-report"));
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-print"));

      await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
      expect(printSectionAtCall).toBe("ai-doctor-report");
      expect(screen.getByTestId("ai-doctor-diagnosis-preview-body")).not.toHaveAttribute(
        "data-print-section",
      );
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith("premium-export-entitlement", {
        body: { feature: "ai_doctor_report" },
      });
    } finally {
      window.print = originalPrint;
    }
  });

  it("keeps the print target mounted while the entitlement preflight is pending", async () => {
    let resolveGate:
      ((value: { data: { ok: true; display_plan_id: string }; error: null }) => void) | null = null;
    invokeMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGate = resolve;
      }),
    );
    const originalPrint = window.print;
    const printSpy = vi.fn();
    window.print = printSpy as typeof window.print;

    try {
      render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-report"));
      fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-print"));

      const dialog = screen.getByTestId("ai-doctor-diagnosis-preview");
      const close = screen.getByTestId("ai-doctor-diagnosis-preview-close");
      await waitFor(() => expect(close).toBeDisabled());
      fireEvent.click(dialog);
      expect(screen.getByTestId("ai-doctor-diagnosis-preview-body")).toBeInTheDocument();

      await act(async () => {
        resolveGate?.({
          data: { ok: true, display_plan_id: "pro_monthly" },
          error: null,
        });
      });
      await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    } finally {
      window.print = originalPrint;
    }
  });
});
