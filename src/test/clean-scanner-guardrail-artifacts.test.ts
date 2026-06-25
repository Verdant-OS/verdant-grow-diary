/**
 * Runtime test for the local scanner guardrail artifact cleanup script.
 * Verifies default path, optional report-path override, absent-file,
 * and unrelated-file safety — without touching real test-results/.
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

  it("deletes the report when present (default path)", () => {
    const target = join(cwd, SCANNER_SLOW_REPORT_PATH);
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    writeFileSync(target, '{"test":"x"}\n', "utf8");

    const result = cleanScannerGuardrailArtifacts({ cwd, log });
    expect(result.removed).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(logs.some((l) => l.includes("removed"))).toBe(true);
  });

  it("deletes a custom report path when provided", () => {
    const custom = "test-results/custom-scanner-report.jsonl";
    const target = join(cwd, custom);
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    writeFileSync(target, '{"test":"y"}\n', "utf8");

    const result = cleanScannerGuardrailArtifacts({ cwd, log, reportPath: custom });
    expect(result.removed).toBe(true);
    expect(result.reportPath).toBe(custom);
    expect(existsSync(target)).toBe(false);
    expect(logs.some((l) => l.includes(custom))).toBe(true);
  });

  it("does not delete unrelated report files in the same directory", () => {
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    const defaultTarget = join(cwd, SCANNER_SLOW_REPORT_PATH);
    const unrelated = join(cwd, "test-results/other-report.jsonl");
    const sibling = join(cwd, "test-results/scanner-guardrail-slow-tests.jsonl.bak");
    writeFileSync(defaultTarget, '{"test":"x"}\n', "utf8");
    writeFileSync(unrelated, '{"keep":true}\n', "utf8");
    writeFileSync(sibling, '{"keep":true}\n', "utf8");

    const result = cleanScannerGuardrailArtifacts({ cwd, log });
    expect(result.removed).toBe(true);
    expect(existsSync(defaultTarget)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(sibling)).toBe(true);
  });

  it("refuses to delete a directory at the report path", () => {
    const target = join(cwd, SCANNER_SLOW_REPORT_PATH);
    mkdirSync(target, { recursive: true });
    const result = cleanScannerGuardrailArtifacts({ cwd, log });
    expect(result.removed).toBe(false);
    expect((result as { refusedDirectory?: boolean }).refusedDirectory).toBe(true);
    expect(existsSync(target)).toBe(true);
    expect(logs.some((l) => /refusing to remove directory/.test(l))).toBe(true);
  });
});
