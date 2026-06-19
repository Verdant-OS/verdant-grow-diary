import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { installScannerGuardrail } from "./support/scannerGuardrailHarness";

installScannerGuardrail({ file: __filename });

const scannerPath = resolve(process.cwd(), "scripts/assert-sensor-intelligence-safety.mjs");

describe("sensor intelligence safety scanner", () => {
  it("current repository is clean", () => {
    expect(() =>
      execFileSync(process.execPath, [scannerPath, "--quiet"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
