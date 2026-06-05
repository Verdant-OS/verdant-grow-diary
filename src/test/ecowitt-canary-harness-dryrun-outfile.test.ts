/**
 * Static safety tests for PowerShell harness DryRun + OutFile support.
 * Operator tooling only. Read-only diagnostics. No ingest/schema/RLS/edge
 * function changes. Secrets must never be written to disk.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const HARNESS = resolve(process.cwd(), "scripts/ecowitt-canary-harness.ps1");
const LAUNCHER = resolve(process.cwd(), "Run-EcoWittCanary.ps1");
const DOCS = resolve(process.cwd(), "docs/ecowitt-live-canary-runbook.md");

const src = existsSync(HARNESS) ? readFileSync(HARNESS, "utf8") : "";
const launcher = existsSync(LAUNCHER) ? readFileSync(LAUNCHER, "utf8") : "";
const docs = existsSync(DOCS) ? readFileSync(DOCS, "utf8") : "";

describe("ecowitt-canary-harness.ps1 — DryRun + OutFile", () => {
  it("declares param block with DryRun and OutFile", () => {
    expect(src).toMatch(/param\s*\(/);
    expect(src).toMatch(/\[switch\]\$DryRun/);
    expect(src).toMatch(/\[string\]\$OutFile/);
  });

  it("short-circuits POSTs when DryRun is set", () => {
    expect(src).toContain("if ($DryRun)");
    expect(src).toContain("[DRY-RUN]");
    expect(src).toMatch(/Mark-Pass "\$Label dry-run validated \(no network call\)"/);
    // DryRun must come before curl.exe invocation inside the function
    const fnStart = src.indexOf("function Invoke-CanaryPost");
    const dryIdx = src.indexOf("if ($DryRun)", fnStart);
    const curlIdx = src.indexOf("curl.exe", fnStart);
    expect(dryIdx).toBeGreaterThan(-1);
    expect(curlIdx).toBeGreaterThan(dryIdx);
  });

  it("writes redacted output to OutFile via Add-Content and a final Redact pass", () => {
    expect(src).toContain("if ($OutFile)");
    expect(src).toContain("Add-Content -Path $OutFile");
    expect(src).toContain("$joined = Redact $joined");
    expect(src).toContain("vbt_REDACTED");
    expect(src).toContain("PASSKEY_REDACTED");
    expect(src).toContain("MAC_REDACTED");
  });

  it("never writes raw secret variables to disk", () => {
    // Add-Content lines must not reference the raw secret variables
    const addContentLines = src
      .split("\n")
      .filter((l) => l.includes("Add-Content") || l.includes("Out-File"));
    for (const line of addContentLines) {
      expect(line).not.toContain("$BridgeToken");
      expect(line).not.toContain("$TestPasskey");
      expect(line).not.toContain("$TestMac");
    }
  });

  it("labels the OutFile mode as dry-run vs live", () => {
    expect(src).toContain("if ($DryRun) { 'dry-run' } else { 'live' }");
  });

  it("does not introduce alerts / Action Queue / AI / automation / device control", () => {
    const lower = src.toLowerCase();
    for (const w of [
      "action_queue",
      "ai_doctor",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "relay",
      "actuator",
      "functions.invoke",
      ".rpc(",
    ]) {
      expect(lower).not.toContain(w);
    }
  });
});

describe("Run-EcoWittCanary.ps1 — passes flags through", () => {
  it("delegates with @args so -DryRun and -OutFile are forwarded", () => {
    expect(launcher).toContain("@args");
  });

  it("documents DryRun and OutFile in the header", () => {
    expect(launcher).toContain("-DryRun");
    expect(launcher).toContain("-OutFile");
  });
});

describe("runbook documents DryRun + OutFile", () => {
  it("documents -DryRun", () => {
    expect(docs).toContain("-DryRun");
    expect(docs.toLowerCase()).toContain("no network call");
  });

  it("documents -OutFile and clarifies secrets are not written", () => {
    expect(docs).toContain("-OutFile");
    expect(docs.toLowerCase()).toMatch(/secrets are never written/);
  });
});
