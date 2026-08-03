// Static-safety scans for the Vite/TanStack Supabase auth hardening slice.
// See docs/auth-security.md.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { listFilesCached, readFileCached } from "./helpers/cachedSrcTextScan";

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");
const CLIENT = readFileSync(resolve(SRC, "integrations/supabase/client.ts"), "utf8");
const AUTH_RUNTIME = readFileSync(resolve(SRC, "lib/supabaseAuthRuntime.ts"), "utf8");
const AUTH_DOC = readFileSync(resolve(ROOT, "docs/auth-security.md"), "utf8");
const RLS_DOC = readFileSync(resolve(ROOT, "docs/qa-rls-checklist.md"), "utf8");

const SRC_FILES = listFilesCached(SRC).filter((p) => /\.(ts|tsx|js|jsx)$/.test(p));
const isSrcTestFile = (filePath: string) =>
  relative(SRC, filePath).replace(/\\/g, "/").startsWith("test/");

describe("Supabase client storage", () => {
  it("delegates auth storage and lifecycle flags to one runtime resolver", () => {
    expect(CLIENT).toMatch(/createSupabaseAuthRuntime/);
    expect(CLIENT).toMatch(/storage:\s*authRuntime\.storage/);
    expect(CLIENT).toMatch(/persistSession:\s*authRuntime\.persistSession/);
    expect(CLIENT).toMatch(/autoRefreshToken:\s*authRuntime\.autoRefreshToken/);
    expect(CLIENT).toMatch(/detectSessionInUrl:\s*authRuntime\.detectSessionInUrl/);
    expect(CLIENT).not.toMatch(/storage:\s*localStorage/);
  });

  it("uses sessionStorage in the browser and isolated memory when it is unavailable", () => {
    expect(AUTH_RUNTIME).toMatch(/typeof window === "undefined"/);
    expect(AUTH_RUNTIME).toMatch(/window\.sessionStorage/);
    expect(AUTH_RUNTIME).toMatch(/createTransientMemoryStorage/);
    expect(AUTH_RUNTIME).toMatch(/storageKind:\s*"server_memory"/);
    expect(AUTH_RUNTIME).toMatch(/storageKind:\s*"browser_memory"/);
  });

  it("disables persistence, refresh, and URL-session parsing on the server", () => {
    expect(AUTH_RUNTIME).toMatch(
      /storageKind:\s*"server_memory"[\s\S]*persistSession:\s*false[\s\S]*autoRefreshToken:\s*false[\s\S]*detectSessionInUrl:\s*false/,
    );
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
      if (isSrcTestFile(f)) return false; // guard tests assert absence
      const body = readFileCached(f);
      // Strip sanitizer-style references (regex literals + quoted string literals
      // naming the key, e.g. defensive redaction code). The real escalation
      // surface is env access or createClient using the service role key.
      const stripped = body
        .replace(/\/[^/\n]*SUPABASE_SERVICE_ROLE_KEY[^/\n]*\/[gimsuy]*/g, "")
        .replace(/(["'`])SUPABASE_SERVICE_ROLE_KEY\1/g, "");
      return (
        /\bSUPABASE_SERVICE_ROLE_KEY\b/.test(stripped) ||
        /import\.meta\.env\.[A-Z_]*SERVICE_ROLE[A-Z_]*/.test(body) ||
        /process\.env\.[A-Z_]*SERVICE_ROLE[A-Z_]*/.test(body) ||
        /createClient\([^)]*service.?role/i.test(body)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("introduces no NEXT_PUBLIC_* env vars in src/", () => {
    const offenders = SRC_FILES.filter((f) => {
      if (isSrcTestFile(f)) return false;
      return /NEXT_PUBLIC_/.test(readFileCached(f));
    });
    expect(offenders).toEqual([]);
  });

  it("does not import @supabase/ssr or next/headers anywhere in src/", () => {
    const offenders = SRC_FILES.filter((f) => {
      if (f.endsWith("auth-hardening-static-safety.test.ts")) return false;
      const body = readFileCached(f);
      return /from\s+['"]@supabase\/ssr['"]|from\s+['"]next\/headers['"]/.test(body);
    });
    expect(offenders).toEqual([]);
  });
});
