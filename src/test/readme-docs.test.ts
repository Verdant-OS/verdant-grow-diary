/**
 * Verifies README.md documents the Verdant development workflow and safety
 * standards (security checklist, exceptions registry, PR template, validation
 * commands, AI Coach / Action Queue / sensor truthfulness, RLS ownership).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const README_PATH = resolve(__dirname, "../../README.md");

describe("README development & safety documentation", () => {
  it("README.md exists", () => {
    expect(existsSync(README_PATH)).toBe(true);
  });

  const content = existsSync(README_PATH)
    ? readFileSync(README_PATH, "utf8")
    : "";

  it("references the security checklist", () => {
    expect(content).toContain("docs/security-checklist.md");
  });

  it("references the security exceptions registry", () => {
    expect(content).toContain("docs/security-exceptions.md");
  });

  it("references the PR template", () => {
    expect(content).toContain(".github/pull_request_template.md");
  });

  it("includes required validation commands", () => {
    expect(content).toContain("bunx vitest run");
    expect(content).toMatch(/bunx eslint/);
    expect(content).toContain("npm run build");
  });

  it("documents AI Coach safety", () => {
    expect(content).toMatch(/AI Coach safety/i);
    expect(content).toContain("src/test/ai-coach-security.test.ts");
  });

  it("documents Action Queue safety", () => {
    expect(content).toMatch(/Action Queue safety/i);
    expect(content).toContain("src/test/action-queue-safety.test.ts");
  });

  it("documents sensor / live-data truthfulness", () => {
    expect(content).toMatch(/Sensor\s*\/\s*live[-\s]?data truthfulness/i);
    expect(content).toMatch(/never\s+(?:be\s+)?faked\s+as\s+live/i);
  });

  it("documents RLS / auth.uid ownership guidance", () => {
    expect(content).toMatch(/RLS is the ownership boundary/i);
    expect(content).toContain("auth.uid()");
    expect(content).toMatch(/Never trust client[-\s]?provided\s+`?user_id`?/i);
  });
});
