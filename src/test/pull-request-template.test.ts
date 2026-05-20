/**
 * Verifies the GitHub PR template exists and enforces the Verdant
 * security/AI/Action Queue/sensor checklist.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TEMPLATE_PATH = resolve(
  __dirname,
  "../../.github/pull_request_template.md",
);

describe("GitHub pull request template", () => {
  it("exists at .github/pull_request_template.md", () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
  });

  const content = existsSync(TEMPLATE_PATH)
    ? readFileSync(TEMPLATE_PATH, "utf8")
    : "";

  it("references the security checklist", () => {
    expect(content).toContain("docs/security-checklist.md");
  });

  it("references the security exceptions registry", () => {
    expect(content).toContain("docs/security-exceptions.md");
  });

  it("includes required validation commands", () => {
    expect(content).toContain("bunx vitest run");
    expect(content).toMatch(/bunx eslint/);
    expect(content).toContain("npm run build");
  });

  it("includes a no-service_role checkbox", () => {
    expect(content).toMatch(/- \[ \].*service_role/i);
  });

  it("includes a no-fake-live-data checkbox", () => {
    expect(content).toMatch(/- \[ \].*fake\s+live/i);
  });

  it("includes a no-device-command checkbox", () => {
    expect(content).toMatch(/- \[ \].*device[-\s]?command|external[-\s]?control/i);
  });

  it("includes an RLS / auth ownership checkbox", () => {
    expect(content).toMatch(/- \[ \].*RLS/);
    expect(content).toContain("auth.uid()");
  });

  it("includes a no-client-trusted user_id checkbox", () => {
    expect(content).toMatch(/- \[ \].*client[-\s]?trusted\s+`?user_id`?/i);
  });

  it("includes AI Coach and Action Queue checkboxes", () => {
    expect(content).toMatch(/- \[ \].*AI Coach/);
    expect(content).toMatch(/- \[ \].*Action Queue/);
  });

  it("includes required narrative sections", () => {
    for (const heading of [
      "## Summary",
      "## Files changed",
      "## Behavior changed",
      "## Security checklist",
      "## RLS / ownership impact",
      "## AI Coach impact",
      "## Action Queue impact",
      "## Sensor / live-data truthfulness",
      "## External-control / device-command impact",
      "## Tests run",
      "## Build / lint results",
      "## Risk / rollback notes",
    ]) {
      expect(content).toContain(heading);
    }
  });
});
