/**
 * QuickLog v2 RPC mixed-boundary regression.
 *
 * Proves the RPC cannot be tricked across plant/tent/grow ownership
 * boundaries because the input shape itself does not accept a client-supplied
 * user_id, grow_id, or non-target tent_id. The grow and tent are always
 * resolved from the DB row owned by auth.uid().
 *
 * This guards against future signature changes that would re-introduce a
 * trusted ownership parameter from the client.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findRpc(): { sql: string; sig: string } {
  if (!existsSync(MIG_DIR)) return { sql: "", sig: "" };
  for (const name of readdirSync(MIG_DIR)) {
    const sql = readFileSync(join(MIG_DIR, name), "utf8");
    const m = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual\s*\(([\s\S]*?)\)\s*RETURNS/i,
    );
    if (m) return { sql, sig: m[1] };
  }
  return { sql: "", sig: "" };
}

const { sql, sig } = findRpc();

describe("quicklog_save_manual — input shape blocks mixed-boundary attacks", () => {
  it("RPC signature is discoverable", () => {
    expect(sig.length).toBeGreaterThan(20);
  });

  it("does NOT accept a client-supplied user_id", () => {
    expect(sig).not.toMatch(/\bp_user_id\b/i);
    expect(sig).not.toMatch(/\b_user_id\b/i);
  });

  it("does NOT accept a client-supplied grow_id", () => {
    expect(sig).not.toMatch(/\bp_grow_id\b/i);
    expect(sig).not.toMatch(/\b_grow_id\b/i);
  });

  it("does NOT accept a separate client-supplied tent_id beyond target", () => {
    // The only tent reference allowed in the signature is the generic target,
    // which is named p_target_id (uuid). No standalone p_tent_id.
    expect(sig).not.toMatch(/\bp_tent_id\b/i);
    expect(sig).not.toMatch(/\b_tent_id\b/i);
  });

  it("derives v_tent_id / v_grow_id from DB rows, not client payload", () => {
    expect(sql).toMatch(
      /SELECT\s+p\.tent_id\s*,\s*p\.grow_id[\s\S]{0,200}INTO\s+v_tent_id\s*,\s*v_grow_id/i,
    );
    expect(sql).toMatch(
      /SELECT\s+t\.id\s*,\s*t\.grow_id\s+INTO\s+v_tent_id\s*,\s*v_grow_id/i,
    );
  });

  it("plant lookup and tent lookup are both scoped to auth.uid()", () => {
    expect(sql).toMatch(
      /FROM\s+public\.plants\s+p\s+WHERE\s+p\.id\s*=\s*p_target_id\s+AND\s+p\.user_id\s*=\s*uid/i,
    );
    expect(sql).toMatch(
      /FROM\s+public\.tents\s+t\s+WHERE\s+t\.id\s*=\s*p_target_id\s+AND\s+t\.user_id\s*=\s*uid/i,
    );
  });

  it("defense-in-depth grow ownership check uses auth.uid()", () => {
    expect(sql).toMatch(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows\s+g\s+WHERE\s+g\.id\s*=\s*v_grow_id\s+AND\s+g\.user_id\s*=\s*uid/i,
    );
  });

  it("all INSERTs use the local uid binding, never a client value", () => {
    // Parent grow_events insert
    expect(sql).toMatch(
      /INSERT\s+INTO\s+public\.grow_events[\s\S]{0,400}VALUES\s*\(\s*uid\s*,/i,
    );
    // Environment parent + child both use uid
    expect(sql).toMatch(
      /INSERT\s+INTO\s+public\.environment_events[\s\S]{0,400}VALUES\s*\(\s*v_env_parent\s*,\s*uid\s*,/i,
    );
  });
});

describe("quicklog_save_manual — integration harness status", () => {
  it("documents that real cross-user DB integration is BLOCKED until a test harness exists", () => {
    const doc = readFileSync(
      resolve(ROOT, "docs/quicklog-rpc-safety.md"),
      "utf8",
    );
    expect(doc).toMatch(/Integration harness status[\s\S]{0,200}BLOCKED/i);
  });
});
