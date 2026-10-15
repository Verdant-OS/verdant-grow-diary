/**
 * Production pins for architecture-contract clauses amended in #2149 (nine Codex
 * P2s from #2146). Asserts resolved repository state, not prose in the contract doc.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { TRUST_LIVE_ALIASES, classifyLiveMembershipRoles } from "@/lib/sensorLiveMembership";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");
const SHIM_ALIAS = "@/lib/react-router-compat";
const ALIAS_IMPORT_RE = /^\s*import\s+[\s\S]*?\sfrom\s+["']@\/lib\/react-router-compat["']/gm;
const RELATIVE_SHIM_IMPORT = /from\s+["']\.\.\/lib\/react-router-compat["']/;

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

function countAliasOnlyReactRouterCompatImports(): {
  statements: number;
  files: number;
  byFile: Map<string, number>;
} {
  const byFile = new Map<string, number>();
  let statements = 0;
  for (const abs of walkSourceFiles(SRC)) {
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, "/");
    const text = readFileSync(abs, "utf8");
    const matches = text.match(ALIAS_IMPORT_RE);
    if (!matches?.length) continue;
    byFile.set(rel, matches.length);
    statements += matches.length;
  }
  return { statements, files: byFile.size, byFile };
}

const DOCTOR = readFileSync(resolve(ROOT, "supabase/functions/ai-doctor-review/index.ts"), "utf8");

describe("architecture contract AC-3.4 — alias-only react-router compat census", () => {
  it("counts only @/lib/react-router-compat static imports (814 in 813 files at #2149 stamp)", () => {
    const { statements, files } = countAliasOnlyReactRouterCompatImports();
    expect(statements).toBe(814);
    expect(files).toBe(813);
  });

  it("documents the single intentional relative shim import for the real Navigate shim (#740)", () => {
    const relPath = "src/test/react-router-compat-navigate-real.test.tsx";
    expect(existsSync(resolve(ROOT, relPath))).toBe(true);
    const text = readFileSync(resolve(ROOT, relPath), "utf8");
    expect(text).toMatch(RELATIVE_SHIM_IMPORT);
    const census = countAliasOnlyReactRouterCompatImports();
    expect(census.byFile.has(relPath)).toBe(false);
    const withRelative = walkSourceFiles(SRC).filter((abs) => {
      const t = readFileSync(abs, "utf8");
      return RELATIVE_SHIM_IMPORT.test(t);
    });
    expect(withRelative).toHaveLength(1);
    expect(withRelative[0]!.replace(/\\/g, "/").endsWith(relPath)).toBe(true);
  });

  it("keeps SHIM_ALIAS stable for contract cross-reference", () => {
    expect(SHIM_ALIAS).toBe("@/lib/react-router-compat");
  });
});

describe("architecture contract AC-4.1 / AC-4.5 — transport alias vs trust-live membership", () => {
  it("maps pi_bridge to live without listing it in TRUST_LIVE_ALIASES", () => {
    expect(normalizeSensorSource("pi_bridge")).toBe("live");
    expect(TRUST_LIVE_ALIASES.has("pi_bridge")).toBe(false);
    for (const trustAlias of ["live", "sensor", "realtime"] as const) {
      expect(TRUST_LIVE_ALIASES.has(trustAlias)).toBe(true);
      expect(normalizeSensorSource(trustAlias)).toBe("live");
    }
    const roles = classifyLiveMembershipRoles("pi_bridge");
    expect(roles).toContain("receiving_transport");
    expect(roles).toContain("verified_snapshot_row");
    expect(roles).not.toContain("trust_live_alias");
  });
});

describe("architecture contract AC-5.4 — AI Doctor refund attempt vs terminal outcome", () => {
  it("uses refund:{spendId} keys and separates confirmed refunds from result_pending", () => {
    const helperStart = DOCTOR.indexOf("async function failureAfterRefund");
    const providerIndex = DOCTOR.indexOf("fetch(GATEWAY_URL");
    expect(helperStart).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(helperStart);
    const refundFnStart = DOCTOR.indexOf("async function refund(spendId");
    expect(refundFnStart).toBeGreaterThan(-1);
    expect(refundFnStart).toBeLessThan(helperStart);
    expect(DOCTOR.slice(refundFnStart, helperStart + 200)).toContain(
      "const refundKey = `refund:${spendId}`",
    );
    expect(DOCTOR.slice(refundFnStart, helperStart)).toMatch(
      /if\s*\(\s*!spendId\s*\)\s*return\s+"unconfirmed"/,
    );
    expect(DOCTOR.slice(helperStart, providerIndex)).toContain(
      'outcome === "confirmed" ? terminalReason : "result_pending"',
    );
  });
});

describe("architecture contract AC-6.2 / billing — #1373 founders RLS hardening", () => {
  const migrationPath =
    "supabase/migrations/20260914190600_founders_client_updates_fail_closed.sql";

  it("keeps #1373 as founders client-update hardening, distinct from subscription refund migrations", () => {
    const abs = resolve(ROOT, migrationPath);
    expect(existsSync(abs)).toBe(true);
    const sql = readFileSync(abs, "utf8");
    expect(sql).toMatch(/founders_no_client_update/i);
    expect(sql).toMatch(/REVOKE.*UPDATE.*founders/is);
    expect(sql).not.toMatch(/ai_credit_refund/i);
    expect(sql).not.toMatch(/subscriptions/i);
  });
});
