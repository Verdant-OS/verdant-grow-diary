import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED,
  FAILURE_SAFE_MIGRATION_FILENAME,
  FORWARD_REPAIR_MIGRATION_FILENAME,
  FORWARD_REPAIR_MIGRATION_SHA256,
  evaluateSignupAttributionStaticReadiness,
  parseSignupAcquisitionReadinessSnapshot,
} from "@/lib/signupAttributionCtaReadinessRules";
import {
  collectStaticEvidence,
  runAssertSignupAttributionCtaReadiness,
} from "../../scripts/assert-signup-attribution-cta-readiness.mjs";
import { EXIT as LIVE_EXIT } from "../../scripts/assert-signup-attribution-cta-readiness-applied.mjs";

const ROOT = resolve(__dirname, "..", "..");

describe("signup attribution CTA readiness — static contract", () => {
  it("pins the immutable forward-repair SHA-256", () => {
    const body = readFileSync(
      resolve(ROOT, "supabase/migrations", FORWARD_REPAIR_MIGRATION_FILENAME),
    );
    expect(createHash("sha256").update(body).digest("hex")).toBe(FORWARD_REPAIR_MIGRATION_SHA256);
  });

  it("passes the secret-free assert against this checkout", () => {
    const logs: string[] = [];
    const code = runAssertSignupAttributionCtaReadiness({
      repoRoot: ROOT,
      stdout: (line) => logs.push(String(line)),
      stderr: (line) => logs.push(String(line)),
    });
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/status: ready|CTA static readiness: ready/i);
  });

  it("fails closed when the failure-safe migration body lacks the attribution RAISE LOG", () => {
    const evidence = collectStaticEvidence(ROOT);
    const broken = evaluateSignupAttributionStaticReadiness({
      ...evidence,
      failureSafeSql: evidence.failureSafeSql?.replace(
        /RAISE\s+LOG[\s\S]*?SQLERRM;/i,
        "NULL; -- attribution log removed",
      ),
    });
    expect(broken.ready).toBe(false);
    expect(broken.marketingSignupCtaEnabled).toBe(false);
    expect(broken.failedChecks).toEqual(
      expect.arrayContaining(["failure_safe_exception_guard", "failure_safe_raise_log"]),
    );
  });

  it("fails closed when the attributed CTA flag is off", () => {
    const evidence = collectStaticEvidence(ROOT);
    const broken = evaluateSignupAttributionStaticReadiness({
      ...evidence,
      attributedCtaFlagEnabled: false,
    });
    expect(broken.ready).toBe(false);
    expect(broken.failedChecks).toContain("attributed_cta_flag_enabled");
  });

  it("keeps the product CTA flag enabled only while the guard migration exists", () => {
    expect(ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED).toBe(true);
    expect(FAILURE_SAFE_MIGRATION_FILENAME).toBe(
      "20260821150000_signup_acquisition_failure_safe_attribution.sql",
    );
    const landing = readFileSync(resolve(ROOT, "src/pages/Landing.tsx"), "utf8");
    expect(landing).toContain("ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED");
    expect(landing).toContain("buildAttributedSignupPath");
  });
});

describe("signup acquisition readiness RPC payload parser", () => {
  it("parses a ready operator snapshot", () => {
    const parsed = parseSignupAcquisitionReadinessSnapshot({
      ok: true,
      ready: true,
      status: "ready",
      generated_at: "2026-08-21T12:00:00Z",
      checks: {
        signup_acquisition_attributions_table: true,
        record_signup_acquisition_first_touch: true,
        signup_acquisition_operator_snapshot: true,
        signup_to_paid_operator_snapshot: true,
        forward_repair_ledger_row: true,
      },
      failed_checks: [],
    });
    expect(parsed).toEqual({
      ok: true,
      reason: null,
      ready: true,
      status: "ready",
      generatedAt: "2026-08-21T12:00:00Z",
      checks: {
        signup_acquisition_attributions_table: true,
        record_signup_acquisition_first_touch: true,
        signup_acquisition_operator_snapshot: true,
        signup_to_paid_operator_snapshot: true,
        forward_repair_ledger_row: true,
      },
      failedChecks: [],
    });
  });

  it("parses not-ready with failed checks", () => {
    const parsed = parseSignupAcquisitionReadinessSnapshot({
      ok: true,
      ready: false,
      status: "not_ready",
      checks: {
        signup_acquisition_attributions_table: true,
        record_signup_acquisition_first_touch: true,
        signup_acquisition_operator_snapshot: true,
        signup_to_paid_operator_snapshot: true,
        forward_repair_ledger_row: false,
      },
      failed_checks: ["forward_repair_ledger_row"],
    });
    expect(parsed.ready).toBe(false);
    expect(parsed.status).toBe("not_ready");
    expect(parsed.failedChecks).toEqual(["forward_repair_ledger_row"]);
  });

  it("maps operator_required without claiming ready", () => {
    const parsed = parseSignupAcquisitionReadinessSnapshot({
      ok: false,
      reason: "operator_required",
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.ready).toBe(false);
    expect(parsed.status).toBe("unavailable");
    expect(parsed.failedChecks).toEqual(["operator_required"]);
  });
});

describe("signup attribution CTA live applied gate", () => {
  it("fails closed with NO_DB_CONNECTION when no target is configured", async () => {
    const { runAssertSignupAttributionCtaReadinessApplied } = await import(
      "../../scripts/assert-signup-attribution-cta-readiness-applied.mjs"
    );
    const code = runAssertSignupAttributionCtaReadinessApplied({
      env: { TARGET_ENV: "unspecified" },
      stdout: () => {},
      stderr: () => {},
    });
    expect(code).toBe(LIVE_EXIT.NO_DB_CONNECTION);
  });
});
