// Static-safety scans for the Vite Supabase auth hardening slice.
// See docs/auth-security.md.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listFilesCached, readFileCached } from "./helpers/cachedSrcTextScan";

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");
const CLIENT = readFileSync(resolve(SRC, "integrations/supabase/client.ts"), "utf8");
const AUTH_DOC = readFileSync(resolve(ROOT, "docs/auth-security.md"), "utf8");
const RLS_DOC = readFileSync(resolve(ROOT, "docs/qa-rls-checklist.md"), "utf8");

const SRC_FILES = listFilesCached(SRC).filter((p) =>
  /\.(ts|tsx|js|jsx)$/.test(p),
);

describe("Supabase client storage", () => {
  it("uses sessionStorage (not localStorage) for auth persistence", () => {
    expect(CLIENT).toMatch(/storage:\s*sessionStorage/);
    expect(CLIENT).not.toMatch(/storage:\s*localStorage/);
  });

  it("keeps autoRefreshToken + persistSession enabled", () => {
    expect(CLIENT).toMatch(/persistSession:\s*true/);
    expect(CLIENT).toMatch(/autoRefreshToken:\s*true/);
  });

  it("documents the hardening edit in a comment", () => {
    expect(CLIENT).toMatch(/MINIMAL HARDENING EDIT/);
  });
});

describe("Auth security docs", () => {
  it("auth-security.md mentions sessionStorage tradeoff and XSS limitation", () => {
    expect(AUTH_DOC).toMatch(/sessionStorage/);
    expect(AUTH_DOC).toMatch(/localStorage/);
    expect(AUTH_DOC).toMatch(/XSS/);
    expect(AUTH_DOC).toMatch(/does \*\*not\*\* prevent XSS/i);
  });

  it("auth-security.md states RLS is the security boundary", () => {
    expect(AUTH_DOC).toMatch(/RLS/);
    expect(AUTH_DOC).toMatch(/security boundary|access boundary/i);
  });

  it("auth-security.md forbids service_role and NEXT_PUBLIC_/ssr/next/headers", () => {
    expect(AUTH_DOC).toMatch(/service_role/);
    expect(AUTH_DOC).toMatch(/NEXT_PUBLIC_/);
    expect(AUTH_DOC).toMatch(/@supabase\/ssr/);
    expect(AUTH_DOC).toMatch(/next\/headers/);
  });

  it("qa-rls-checklist.md covers diary, plant, customer-guide and cross-user denial", () => {
    expect(RLS_DOC).toMatch(/[Dd]iary/);
    expect(RLS_DOC).toMatch(/[Pp]lant/);
    expect(RLS_DOC).toMatch(/[Cc]ustomer.guide/);
    expect(RLS_DOC).toMatch(/[Cc]ross-user/);
    expect(RLS_DOC).toMatch(/[Uu]nauthenticated/);
    expect(RLS_DOC).toMatch(/service_role/);
  });
});

describe("src/ static safety", () => {
  it("never imports the service role key into src/", () => {
    const offenders = SRC_FILES.filter((f) => {
      if (/src\/test\//.test(f)) return false; // guard tests assert absence
      const body = readFileSync(f, "utf8");
      // Real escalation surface: env access or createClient using service role.
      return (
        /\bSUPABASE_SERVICE_ROLE_KEY\b/.test(body) ||
        /import\.meta\.env\.[A-Z_]*SERVICE_ROLE[A-Z_]*/.test(body) ||
        /process\.env\.[A-Z_]*SERVICE_ROLE[A-Z_]*/.test(body) ||
        /createClient\([^)]*service.?role/i.test(body)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("introduces no NEXT_PUBLIC_* env vars in src/", () => {
    const offenders = SRC_FILES.filter((f) => {
      if (/src\/test\//.test(f)) return false;
      return /NEXT_PUBLIC_/.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("does not import @supabase/ssr or next/headers anywhere in src/", () => {
    const offenders = SRC_FILES.filter((f) => {
      if (f.endsWith("auth-hardening-static-safety.test.ts")) return false;
      const body = readFileSync(f, "utf8");
      return /from\s+['"]@supabase\/ssr['"]|from\s+['"]next\/headers['"]/.test(
        body,
      );
    });
    expect(offenders).toEqual([]);
  });
});
