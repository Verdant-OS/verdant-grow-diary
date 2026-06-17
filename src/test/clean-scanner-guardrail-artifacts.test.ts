/**
 * Runtime test for the local scanner guardrail artifact cleanup script.
 * Verifies both the "report present" and "report absent" branches without
 * touching the real test-results/ directory.
 *
 * Safety: test-tooling only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanScannerGuardrailArtifacts,
  SCANNER_SLOW_REPORT_PATH,
  // @ts-ignore - .mjs without types; helpers are pure JS.
} from "../../scripts/clean-scanner-guardrail-artifacts.mjs";

describe("clean-scanner-guardrail-artifacts", () => {
  let cwd: string;
  let logs: string[];
  const log = (msg: string) => logs.push(msg);

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "verdant-scanner-clean-"));
    logs = [];
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("exits cleanly and reports when the report is absent", () => {
    const result = cleanScannerGuardrailArtifacts({ cwd, log });
    expect(result.removed).toBe(false);
    expect(logs.some((l) => /nothing to remove/.test(l))).toBe(true);
    expect(existsSync(join(cwd, SCANNER_SLOW_REPORT_PATH))).toBe(false);
  });

  it("deletes the report when present", () => {
    const target = join(cwd, SCANNER_SLOW_REPORT_PATH);
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    writeFileSync(target, '{"test":"x"}\n', "utf8");
    expect(existsSync(target)).toBe(true);

    const result = cleanScannerGuardrailArtifacts({ cwd, log });
    expect(result.removed).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(logs.some((l) => l.includes("removed"))).toBe(true);
  });
});
