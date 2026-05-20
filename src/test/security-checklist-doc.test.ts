/**
 * Verifies docs/security-checklist.md exists and covers the required
 * security topics, validation commands, and cross-references.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/security-checklist.md");

describe("Verdant security checklist", () => {
  it("docs/security-checklist.md exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const content = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("references RLS", () => {
    expect(content).toMatch(/\bRLS\b|Row Level Security/i);
  });

  it("references auth.uid()", () => {
    expect(content).toContain("auth.uid()");
  });

  it("warns against client-trusted user_id", () => {
    expect(content).toMatch(/client[-\s]?trusted|client[-\s]?supplied|never sends `user_id`/i);
    expect(content).toContain("user_id");
  });

  it("references AI Coach safety tests", () => {
    expect(content).toContain("src/test/ai-coach-security.test.ts");
    expect(content).toContain("src/test/ai-coach-output-safety.test.ts");
  });

  it("references Action Queue safety and audit tests", () => {
    expect(content).toContain("src/test/action-queue-safety.test.ts");
    expect(content).toContain("src/test/action-queue-audit.test.ts");
  });

  it("references sensor truthfulness and forbids fake live data", () => {
    expect(content).toMatch(/Sensor data truthfulness/i);
    expect(content).toMatch(/fake\s+live/i);
  });

  it("references SECURITY DEFINER review requirements", () => {
    expect(content).toMatch(/SECURITY\s+DEFINER\s+review/i);
    expect(content).toContain("src/test/has-role-security-definer.test.ts");
  });

  it("references docs/security-exceptions.md", () => {
    expect(content).toContain("docs/security-exceptions.md");
  });

  it("lists required validation commands", () => {
    expect(content).toContain("bunx vitest run");
    expect(content).toMatch(/bunx eslint/);
    expect(content).toContain("npm run build");
  });

  it("covers Edge Function auth and service_role restrictions", () => {
    expect(content).toMatch(/Edge Function/);
    expect(content).toMatch(/service_role/);
  });

  it("covers external-control / device-command restrictions", () => {
    expect(content).toMatch(/external[-\s]?control|device[-\s]?command/i);
  });
});
