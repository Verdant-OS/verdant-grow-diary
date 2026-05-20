/**
 * Security regression tests for supabase/functions/ai-coach/index.ts.
 *
 * These are static-analysis tests: the edge function targets the Deno runtime
 * (Deno.serve, npm: specifiers) and cannot be imported into the Node/vitest
 * process. Instead we read the function source and assert on its shape to
 * lock in the ownership / RLS guarantees that protect cross-tenant data.
 *
 * If any of these assertions fail, the AI Coach may have regressed into a
 * cross-tenant data leak — DO NOT relax these tests without a security review.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(__dirname, "../../supabase/functions/ai-coach/index.ts");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
// Strip line comments and block comments so substring checks don't match commented-out code.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("ai-coach edge function — security shape", () => {
  it("uses SUPABASE_URL and SUPABASE_ANON_KEY for the Supabase client", () => {
    expect(CODE).toMatch(/Deno\.env\.get\(\s*["']SUPABASE_URL["']\s*\)/);
    expect(CODE).toMatch(/Deno\.env\.get\(\s*["']SUPABASE_ANON_KEY["']\s*\)/);
  });

  it("never references SUPABASE_SERVICE_ROLE_KEY (no RLS bypass)", () => {
    expect(CODE).not.toMatch(/SERVICE_ROLE/i);
    expect(CODE).not.toMatch(/service_role/);
  });

  it("forwards the caller Authorization header into the Supabase client", () => {
    expect(CODE).toMatch(/req\.headers\.get\(\s*["']Authorization["']\s*\)/);
    expect(CODE).toMatch(/global:\s*\{\s*headers:\s*\{\s*Authorization:\s*auth/);
  });

  it("returns 401 when the Authorization header is missing", () => {
    expect(CODE).toMatch(/if\s*\(\s*!auth\s*\)\s*return\s+json\(\s*\{\s*error:\s*["']unauthorized["']\s*\}\s*,\s*401\s*\)/);
  });

  it("requires supabase.auth.getUser() and returns 401 when no user is present", () => {
    expect(CODE).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(CODE).toMatch(/if\s*\(\s*!u\?\.user\s*\)\s*return\s+json\(\s*\{\s*error:\s*["']unauthorized["']\s*\}\s*,\s*401\s*\)/);
  });

  it("only destructures growId / mode / photoUrl / question from the request body", () => {
    // The Body interface is the contract for what is accepted from the client.
    const bodyIface = CODE.match(/interface\s+Body\s*\{[^}]*\}/)?.[0] ?? "";
    expect(bodyIface).toContain("growId");
    expect(bodyIface).toContain("mode");
    expect(bodyIface).toContain("photoUrl");
    expect(bodyIface).toContain("question");
    // Must NOT accept these from the client — would enable cross-tenant lookups.
    expect(bodyIface).not.toMatch(/plant_id|plantId/);
    expect(bodyIface).not.toMatch(/tent_id|tentId/);
    expect(bodyIface).not.toMatch(/user_id|userId/);
  });

  it("never reads plant_id or tent_id off the request body", () => {
    expect(CODE).not.toMatch(/body\.plant_?[Ii]d/);
    expect(CODE).not.toMatch(/body\.tent_?[Ii]d/);
    expect(CODE).not.toMatch(/body\.user_?[Ii]d/);
  });

  it("derives plant/tent IDs only from RLS-filtered diary_entries rows", () => {
    // plantIds and tentIds must come from entries.map(... .plant_id / .tent_id)
    expect(CODE).toMatch(/entries\.map\([^)]*\.plant_id/);
    expect(CODE).toMatch(/entries\.map\([^)]*\.tent_id/);
  });

  it("queries grows / diary_entries / plants / tents only via the user-scoped supabase client", () => {
    for (const table of ["grows", "diary_entries", "plants", "tents"]) {
      const re = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");
      const matches = CODE.match(re) ?? [];
      expect(matches.length, `expected at least one supabase.from("${table}") call`).toBeGreaterThan(0);
      // Every .from("<table>") occurrence must be on the `supabase` (anon, auth-forwarded) client.
      const prefixed = CODE.match(new RegExp(`supabase\\.from\\(\\s*["']${table}["']\\s*\\)`, "g")) ?? [];
      expect(prefixed.length, `every .from("${table}") must be on the user-scoped supabase client`).toBe(matches.length);
    }
  });

  it("scopes diary_entries query by grow_id (RLS then restricts to caller's rows)", () => {
    expect(CODE).toMatch(/\.from\(\s*["']diary_entries["']\s*\)[\s\S]{0,400}\.eq\(\s*["']grow_id["']\s*,\s*body\.growId\s*\)/);
  });

  it("looks up the grow with .eq('id', body.growId) — RLS makes foreign growIds return null", () => {
    expect(CODE).toMatch(/\.from\(\s*["']grows["']\s*\)[\s\S]{0,200}\.eq\(\s*["']id["']\s*,\s*body\.growId\s*\)/);
  });

  it("returns EMPTY_ANALYSIS without invoking the AI provider when grow is foreign / no entries", () => {
    // empty := !grow || entries.length === 0  — when a foreign growId is passed, RLS makes both true.
    expect(CODE).toMatch(/const\s+empty\s*=\s*!grow\s*\|\|\s*entries\.length\s*===\s*0/);
    // The empty branch returns EMPTY_ANALYSIS BEFORE the fetch() to the AI gateway.
    const emptyIdx = CODE.search(/if\s*\(\s*empty[\s\S]*?return\s+json\(\s*\{\s*analysis:\s*EMPTY_ANALYSIS/);
    const fetchIdx = CODE.search(/fetch\(\s*["']https:\/\/ai\.gateway\.lovable\.dev/);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeLessThan(fetchIdx);
  });

  it("AI prompt context is built only from RLS-filtered rows (grow, entries, plantsById, tentsById, latestSnapshot)", () => {
    // The context block is assembled from server-queried variables, not from body fields.
    expect(CODE).toMatch(/const\s+context\s*=\s*ctxLines\.join/);
    expect(CODE).not.toMatch(/ctxLines\.push\([^)]*body\.(plant|tent|user)/i);
    // latestSnapshot is read off the already-RLS-filtered diary entry row.
    expect(CODE).toMatch(/row\.details[\s\S]{0,80}sensor_snapshot/);
  });
});
