import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";

const provisioner = readFileSync(
  resolve(__dirname, "../../scripts/e2e/provision-pheno-paid-smoke-roles.mjs"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(__dirname, "../../scripts/e2e/run-pheno-paid-smoke-local.mjs"),
  "utf8",
);
const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/pheno-ephemeral-role-e2e.yml"),
  "utf8",
);

describe("ephemeral Pheno entitlement-role fixtures", () => {
  it("provisions every release role and refuses hosted Supabase", () => {
    for (const role of ["FREE", "PRO", "PRO_ANNUAL", "FOUNDER", "CANCELED"]) {
      expect(provisioner).toContain(`key: "${role}"`);
    }
    expect(provisioner).toContain('plan: "pro_monthly"');
    expect(provisioner).toContain('plan: "pro_annual"');
    expect(provisioner).toContain('plan: "founder_lifetime"');
    expect(provisioner).toContain('status: role.canceled ? "canceled" : "active"');
    expect(provisioner).toContain('environment: "sandbox"');
    expect(provisioner).toMatch(/HOSTED_MARKERS/);
    expect(provisioner).toMatch(/host !== "127\.0\.0\.1"/);
    expect(provisioner).toContain("new globalThis.URL(raw)");
    expect(provisioner).not.toMatch(/const URL\s*=/);
    expect(provisioner).toContain('from("user_agreement_acceptances").insert');
    for (const agreement of CURRENT_AGREEMENT_LIST) {
      expect(provisioner).toContain(`agreement_type: "${agreement.type}"`);
      expect(provisioner).toContain(`version: "${agreement.version}"`);
      expect(provisioner).toContain(`effective_date: "${agreement.effectiveDate}"`);
    }
  });

  it("never sends a service role to Playwright and cleans disposable users", () => {
    expect(orchestrator).not.toMatch(/E2E_SUPABASE_SERVICE_ROLE_KEY.*playwright/s);
    expect(orchestrator).toContain('"--cleanup"');
    expect(provisioner).toContain("admin.auth.admin.deleteUser");
    expect(provisioner).toContain("mode: 0o600");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("provision-pheno-paid-smoke-roles.mjs --cleanup");
    expect(workflow).toContain("test ! -f e2e/.fixtures/pheno-paid-smoke-roles.env");
  });

  it("binds all generated role sessions before the browser smoke", () => {
    for (const file of [
      "pheno-free.json",
      "pheno-pro.json",
      "pheno-pro-annual.json",
      "pheno-founder.json",
      "pheno-canceled.json",
    ]) {
      expect(orchestrator).toContain(file);
    }
    expect(orchestrator.indexOf("Object.assign(process.env")).toBeLessThan(
      orchestrator.indexOf("Stage 6 — Playwright paid-user smoke"),
    );
    expect(orchestrator).toContain('"--project=chromium-mocked"');
    expect(orchestrator).toContain('E2E_TEST_EMAIL: "ephemeral-role-trace-disabled"');
  });
});
