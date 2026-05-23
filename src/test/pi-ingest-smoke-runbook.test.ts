/**
 * Static guardrails for docs/pi-ingest-smoke-runbook.md.
 *
 * Docs-only test: every required section / phrase from the runbook contract
 * must be present so future edits cannot silently drop safety guidance.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "..", "..", "docs/pi-ingest-smoke-runbook.md");
const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
const DOC_LC = DOC.toLowerCase();

describe("pi-ingest smoke runbook — required content", () => {
  it("runbook exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it.each([
    ["PI_INGEST_SMOKE_FUNCTION_URL"],
    ["PI_INGEST_SMOKE_BRIDGE_ID"],
    ["PI_INGEST_SMOKE_BRIDGE_SECRET"],
    ["PI_INGEST_SMOKE_TENT_ID"],
  ])("mentions required secret %s", (name) => {
    expect(DOC).toContain(name);
  });

  it.each([
    ["PI_INGEST_SMOKE_DEVICE_ID"],
    ["PI_INGEST_SMOKE_TIMESTAMP_MS"],
  ])("mentions optional secret %s", (name) => {
    expect(DOC).toContain(name);
  });

  it("explains manual GitHub Actions dispatch", () => {
    expect(DOC).toMatch(/GitHub Actions/i);
    expect(DOC).toMatch(/Run workflow/i);
    expect(DOC).toMatch(/pi-ingest-smoke/);
  });

  it("says workflow is manual-only", () => {
    expect(DOC).toMatch(/workflow_dispatch/);
    expect(DOC).toMatch(/manual[- ]only/i);
  });

  it("explains test-only bridge", () => {
    expect(DOC).toMatch(/test[- ]only bridge/i);
  });

  it("explains test-only tent", () => {
    expect(DOC).toMatch(/test[- ]only tent/i);
  });

  it("forbids production customer data", () => {
    expect(DOC).toMatch(/do not use production[^.\n]*(grow|tent|customer)/i);
    expect(DOC).toMatch(/do not use real customer bridge credentials/i);
  });

  it("explains first valid batch expected result", () => {
    expect(DOC).toMatch(/ok:\s*true,\s*inserted:\s*N,\s*rejected:\s*0/);
  });

  it("explains replay / idempotency expected result", () => {
    expect(DOC).toMatch(/ok:\s*true,\s*inserted:\s*0,\s*rejected:\s*N/);
  });

  it("explains tampered signature → 401", () => {
    expect(DOC).toMatch(/tampered[\s\S]{0,80}401/i);
  });

  it("explains unknown bridge → 401", () => {
    expect(DOC).toMatch(/unknown bridge[\s\S]{0,80}401/i);
  });

  it("explains invalid metric → 400", () => {
    expect(DOC).toMatch(/soil_ec[\s\S]{0,80}400/);
  });

  it("explains inserted / rejected semantics", () => {
    expect(DOC).toMatch(/`inserted`[\s\S]{0,200}new/i);
    expect(DOC).toMatch(/`rejected`[\s\S]{0,200}(duplicate|idempoten|skipped)/i);
    expect(DOC).toMatch(/replay[\s\S]{0,120}rejected/i);
  });

  it.each([
    ["no alerts", /must not.*write[^.\n]*alerts/i],
    ["no Action Queue", /must not.*write[^.\n]*action_queue/i],
    ["no automation", /must not[\s\S]{0,40}automation/i],
    ["no device control", /must not[\s\S]{0,40}device control/i],
    ["no log secrets", /must not log[^.\n]*secret/i],
    ["no log signatures", /must not log[^.\n]*signature/i],
    ["no log service-role", /must not log[^.\n]*service-role/i],
  ])("safety: runbook says %s", (_label, re) => {
    expect(DOC).toMatch(re);
  });

  it("includes troubleshooting section", () => {
    expect(DOC_LC).toContain("troubleshooting");
    expect(DOC).toMatch(/missing env/i);
    expect(DOC).toMatch(/401/);
    expect(DOC).toMatch(/400/);
    expect(DOC).toMatch(/503/);
  });

  it("includes rollback / cleanup section", () => {
    expect(DOC).toMatch(/rollback|cleanup/i);
    expect(DOC).toMatch(/wrong tent/i);
    expect(DOC).toMatch(/(disable|rotate)[\s\S]{0,40}bridge/i);
    expect(DOC).toMatch(/never bulk-delete production sensor data/i);
  });

  it("includes stop-ship conditions", () => {
    expect(DOC).toMatch(/stop[- ]ship/i);
    expect(DOC).toMatch(/non-test tent/i);
    expect(DOC).toMatch(/duplicate sensor rows/i);
    expect(DOC).toMatch(/tampered signature[\s\S]{0,80}401/i);
    expect(DOC).toMatch(/unknown bridge[\s\S]{0,80}401/i);
  });
});
