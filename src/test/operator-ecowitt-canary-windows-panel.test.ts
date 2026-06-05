/**
 * Operator EcoWitt Canary — Windows run-command panel.
 *
 * Read-only guidance. No Supabase writes, no RPC, no functions.invoke,
 * no alerts, no Action Queue, no AI, no device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx");
const src = existsSync(PAGE) ? readFileSync(PAGE, "utf8") : "";

describe("OperatorEcowittCanary — Windows run-command panel", () => {
  it("file exists and includes the panel", () => {
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain("Run EcoWitt Canary on Windows");
    expect(src).toContain("WindowsRunCommandPanel");
    expect(src).toContain('data-testid="windows-run-command-panel"');
  });

  it("shows the recommended root-launcher command with cd prefix", () => {
    expect(src).toContain("<VERDANT_REPO_ROOT>");
    expect(src).toContain("cd ");
    expect(src).toContain("Run-EcoWittCanary.ps1");
  });

  it("shows the dry-run command with cd prefix", () => {
    expect(src).toContain("-DryRun");
    expect(src.toLowerCase()).toContain("no network call");
  });

  it("shows the OutFile command and notes secrets are not written", () => {
    expect(src).toContain("-OutFile");
    expect(src.toLowerCase()).toContain("secrets are never written to disk");
  });

  it("warns operators not to paste curl commands into prompts", () => {
    expect(src.toLowerCase()).toContain("do not paste curl commands");
  });

  it("offers a copy-to-clipboard button per command (no auto-execution)", () => {
    expect(src).toContain("navigator.clipboard.writeText");
    expect(src).toContain("Copied");
    expect(src).toContain("CopyButton");
  });

  it("includes a redaction guarantee warning box", () => {
    expect(src).toContain("Redaction Guarantee");
    expect(src).toContain("redacts bridge token");
  });

  it("includes a dry-run guidance panel", () => {
    expect(src).toContain("DryRunGuidancePanel");
    expect(src).toContain('data-testid="dry-run-guidance-panel"');
    expect(src).toContain("Dry-Run Guidance");
    expect(src).toContain("Validate your setup before making any live POSTs");
  });

  it("includes a redaction warning banner", () => {
    expect(src).toContain("RedactionWarningBanner");
    expect(src).toContain('data-testid="redaction-warning-banner"');
    expect(src).toContain("Secrets are redacted automatically");
  });

  it("includes a Load from OutFile button and hidden file input", () => {
    expect(src).toContain("Load from OutFile");
    expect(src).toContain('data-testid="load-outfile-button"');
    expect(src).toContain('data-testid="outfile-import-input"');
    expect(src).toContain("handleFileImport");
  });

  it("does not introduce ingest / writes / device control side effects", () => {
    // Strip block + line comments so safety disclaimers don't false-positive.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .toLowerCase();
    for (const w of [
      "action_queue",
      "ai_doctor",
      "functions.invoke",
      ".rpc(",
      "mqtt",
      "home_assistant",
      "relay",
      "actuator",
    ]) {
      expect(stripped).not.toContain(w);
    }
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
  });

  it("does not contain real-looking secrets", () => {
    expect(src).not.toMatch(/vbt_[A-Za-z0-9]{8,}/);
    expect(src).not.toMatch(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/);
  });
});