/**
 * Static safety scan for the EcoWitt canary Windows launchers.
 *
 * These are operator tooling only. They must:
 *   - exist at repo root (Run-EcoWittCanary.ps1 and Run-EcoWittCanary.cmd)
 *   - invoke scripts/ecowitt-canary-harness.ps1
 *   - not require manual cd into scripts/
 *   - not contain real secrets
 *   - not introduce alerts / Action Queue / AI / automation / device-control
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PS_PATH = resolve(process.cwd(), "Run-EcoWittCanary.ps1");
const CMD_PATH = resolve(process.cwd(), "Run-EcoWittCanary.cmd");
const HARNESS_PATH = resolve(process.cwd(), "scripts/ecowitt-canary-harness.ps1");
const DOCS_PATH = resolve(process.cwd(), "docs/ecowitt-live-canary-runbook.md");

describe("Run-EcoWittCanary.ps1 — static safety", () => {
  it("file exists at repo root", () => {
    expect(existsSync(PS_PATH)).toBe(true);
  });

  const src = existsSync(PS_PATH) ? readFileSync(PS_PATH, "utf8") : "";

  it("locates repo root via $PSScriptRoot", () => {
    expect(src).toContain("$PSScriptRoot");
  });

  it("invokes scripts/ecowitt-canary-harness.ps1", () => {
    expect(src).toContain("scripts");
    expect(src).toContain("ecowitt-canary-harness.ps1");
  });

  it("prints a clear error if harness is missing", () => {
    expect(src).toContain(
      "EcoWitt canary harness not found. Make sure you are using the latest Verdant repo."
    );
  });

  it("does not echo secrets", () => {
    expect(src).not.toContain("Read-Host");
    expect(src).not.toContain("SecureString");
    expect(src).not.toMatch(/vbt_[A-Za-z0-9]{8,}/);
    expect(src).not.toMatch(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/);
  });

  it("does not make network calls itself (delegates to harness)", () => {
    expect(src).not.toContain("curl.exe");
    expect(src).not.toContain("Invoke-RestMethod");
    expect(src).not.toContain("Invoke-WebRequest");
    expect(src).not.toContain("System.Net.WebClient");
  });

  it("passes exit code through", () => {
    expect(src).toContain("exit $LASTEXITCODE");
  });
});

describe("Run-EcoWittCanary.cmd — static safety", () => {
  it("file exists at repo root", () => {
    expect(existsSync(CMD_PATH)).toBe(true);
  });

  const src = existsSync(CMD_PATH) ? readFileSync(CMD_PATH, "utf8") : "";

  it("uses -NoProfile -ExecutionPolicy Bypass", () => {
    expect(src).toContain("-NoProfile");
    expect(src).toContain("-ExecutionPolicy Bypass");
  });

  it("calls Run-EcoWittCanary.ps1 via %~dp0", () => {
    expect(src).toContain('%~dp0Run-EcoWittCanary.ps1');
  });

  it("keeps the window open after completion", () => {
    expect(src).toContain("pause");
  });

  it("does not contain secrets", () => {
    expect(src).not.toMatch(/vbt_[A-Za-z0-9]{8,}/);
    expect(src).not.toMatch(/PASSKEY=[0-9A-Fa-f]{8,}/);
  });

  it("does not make network calls itself", () => {
    expect(src).not.toContain("curl");
    expect(src).not.toContain("Invoke-RestMethod");
    expect(src).not.toContain("wget");
  });
});

describe("scripts/ecowitt-canary-harness.ps1 — location independence", () => {
  it("file exists", () => {
    expect(existsSync(HARNESS_PATH)).toBe(true);
  });

  const src = existsSync(HARNESS_PATH) ? readFileSync(HARNESS_PATH, "utf8") : "";

  it("mentions location-aware invocation in the header", () => {
    expect(src).toContain("location-aware");
    expect(src).toContain("Run-EcoWittCanary.ps1");
  });

  it("does not depend on current working directory for file paths", () => {
    // It uses GetTempFileName for body files, not relative paths
    expect(src).toContain("GetTempFileName");
    expect(src).not.toMatch(/Test-Path\s+['\"]?\.\//);
    expect(src).not.toMatch(/\.\.\\scripts\\/);
  });

  it("prints resolved script path and endpoint (but redacts secrets)", () => {
    expect(src).toContain("Endpoint:");
    expect(src).toContain("vbt_REDACTED");
  });
});

describe("docs/ecowitt-live-canary-runbook.md — Windows discoverability", () => {
  it("file exists", () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
  });

  const src = existsSync(DOCS_PATH) ? readFileSync(DOCS_PATH, "utf8") : "";

  it("mentions Run-EcoWittCanary.ps1", () => {
    expect(src).toContain("Run-EcoWittCanary.ps1");
  });

  it("mentions Run-EcoWittCanary.cmd", () => {
    expect(src).toContain("Run-EcoWittCanary.cmd");
  });

  it("warns about C:\\WINDOWS\\system32", () => {
    expect(src).toContain("C:\\WINDOWS\\system32");
  });

  it("warns not to run .\\scripts\\... from System32", () => {
    expect(src).toContain("scripts");
    expect(src).toContain("System32");
  });

  it("recommends -NoProfile -ExecutionPolicy Bypass", () => {
    expect(src).toContain("-NoProfile");
    expect(src).toContain("-ExecutionPolicy Bypass");
  });

  it("does not contain real-looking secrets", () => {
    expect(src).not.toMatch(/vbt_[A-Za-z0-9]{16,}/);
    expect(src).not.toMatch(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/);
    expect(src).not.toMatch(/PASSKEY=[0-9A-Fa-f]{16,}/);
  });
});

describe("combined static safety — no forbidden strings", () => {
  const files = [
    { path: PS_PATH, label: "Run-EcoWittCanary.ps1" },
    { path: CMD_PATH, label: "Run-EcoWittCanary.cmd" },
  ];

  const forbidden = [
    "action_queue",
    "ai_doctor",
    "mqtt",
    "home_assistant",
    "pi_bridge",
    "relay",
    "actuator",
    "functions.invoke",
    ".rpc(",
  ];

  for (const { path, label } of files) {
    if (!existsSync(path)) continue;
    const src = readFileSync(path, "utf8").toLowerCase();
    it(`${label} does not introduce alerts / Action Queue / AI / automation / device control`, () => {
      for (const word of forbidden) {
        expect(src).not.toContain(word);
      }
    });
  }
});
