import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260724070000_search_normalizer_service_role_execute.sql",
  ),
  "utf8",
);

describe("search normalizer service-role ACL migration", () => {
  it("grants only the helper execute privilege required by server-side writes", () => {
    expect(SQL).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.verdant_normalize_search_text\(text\)\s+TO service_role/i,
    );
    expect(SQL).not.toMatch(/GRANT\s+(ALL|INSERT|UPDATE|DELETE)/i);
    expect(SQL).not.toMatch(/TO\s+(PUBLIC|anon|authenticated)\s*;/i);
  });

  it("verifies service-role access and preserves the anonymous denial", () => {
    expect(SQL).toContain(
      "'public.verdant_normalize_search_text(text)'",
    );
    expect(SQL).toMatch(
      /has_function_privilege\(\s*'service_role'[\s\S]*'EXECUTE'[\s\S]*\)/i,
    );
    expect(SQL).toMatch(
      /has_function_privilege\(\s*'anon'[\s\S]*'EXECUTE'[\s\S]*\)/i,
    );
  });

  it("is one atomic additive migration", () => {
    expect(SQL.trimStart()).toMatch(/^--[\s\S]*\bBEGIN;/);
    expect(SQL.trimEnd()).toMatch(/COMMIT;$/);
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/CREATE\s+OR\s+REPLACE/i);
  });
});
