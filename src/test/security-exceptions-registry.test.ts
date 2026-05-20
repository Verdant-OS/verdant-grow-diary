/**
 * Verifies docs/security-exceptions.md tracks accepted Supabase linter
 * warnings with the required structure and does not authorize blanket
 * SECURITY DEFINER usage.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/security-exceptions.md");

describe("security exceptions registry", () => {
  it("docs/security-exceptions.md exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const content = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("references Supabase linter code 0029", () => {
    expect(content).toMatch(/\b0029\b/);
  });

  it("documents public.has_role(uuid, app_role)", () => {
    expect(content).toMatch(/public\.has_role\(uuid,\s*(?:public\.)?app_role\)/);
  });

  it("references the regression test file", () => {
    expect(content).toContain("src/test/has-role-security-definer.test.ts");
  });

  it("does not accept blanket SECURITY DEFINER usage", () => {
    expect(content).not.toMatch(/blanket\s+SECURITY\s+DEFINER/i);
    expect(content).toMatch(
      /New\s+SECURITY\s+DEFINER\s+functions\s+require\s+explicit\s+review/i,
    );
    expect(content).toMatch(/does\s+\*?\*?not\*?\*?\s+authorize/i);
  });

  it("lists the required safety controls for has_role", () => {
    for (const control of [
      "LANGUAGE sql",
      "STABLE",
      "search_path",
      "boolean",
      "_user_id",
      "dynamic SQL",
      "anon",
    ]) {
      expect(content).toContain(control);
    }
  });
});
