#!/usr/bin/env -S bun run
/**
 * Phase 1 runtime proof for POSTGRES_RESTRICTED_ROLE_SPIKE (GAP-PGROLE-001).
 * Contract: docs/specs/postgres-restricted-role-alternative.md §5.2, §7, §8.
 *
 * WHAT THIS PROVES
 * That a Postgres role holding EXECUTE on exactly one SECURITY DEFINER
 * function, and no table grants at all, is refused by the DATABASE — SQLSTATE
 * 42501 — when it reaches for a table outside its domain. Phase 0 measured
 * that 8 cross-domain reaches exist today (§5.1.1); this measures whether the
 * proposed fence actually refuses them.
 *
 * WHAT THIS IS NOT
 * Not production. Not a migration. The role is created from
 * scripts/sql/restricted-role-phase1-ingest.sql against a LOOPBACK database
 * only, and dropped in teardown. No edge function is re-pointed at it. Per
 * §8 this harness refuses any non-loopback SUPABASE_DB_URL outright — there is
 * no remote opt-in flag, deliberately, because §9 marks production roles
 * REJECT.
 *
 * Run inside the disposable local Supabase lane, after migrations are applied:
 *   bun run scripts/run-restricted-role-harness.ts --confirm-local-security-lane
 *
 * Required env:
 *   SUPABASE_DB_URL   loopback Postgres URL (psql-compatible)
 * Optional env:
 *   SUPABASE_JWT_SECRET   enables P3, the PostgREST role-claim proof.
 *                         Absent -> P3 is reported BLOCKED, never PASS.
 *   SUPABASE_URL          PostgREST base URL for P3 (default http://127.0.0.1:54321)
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";
const ROLE = "verdant_ingest_writer";
const FIXTURE = join("scripts", "sql", "restricted-role-phase1-ingest.sql");
const ALLOWED_FN = "public.bump_bridge_token_usage(uuid, integer)";
const PERMISSION_DENIED = "42501";

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(`[restricted-role] SKIP — pass ${LOCAL_LANE_FLAG} to run the disposable local harness.`);
  process.exit(0);
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("[restricted-role] missing SUPABASE_DB_URL");
  process.exit(2);
}

function isLoopback(raw: string): boolean {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

if (!isLoopback(dbUrl)) {
  console.error(
    "[restricted-role] refusing a non-loopback SUPABASE_DB_URL. Phase 1 is local-replay only " +
      "(spec §8); production role creation is REJECT (spec §9). There is no remote opt-in.",
  );
  process.exit(2);
}

if (!existsSync(FIXTURE)) {
  console.error(`[restricted-role] missing fixture ${FIXTURE}`);
  process.exit(2);
}

type Result = { ok: boolean; out?: string; sqlstate?: string; detail?: string };

function psql(sql: string): Result {
  try {
    const out = execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out.trim() };
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message?: string };
    const stderr = typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8");
    const text = stderr ?? err.message ?? "psql failed";
    // psql surfaces the SQLSTATE only with VERBOSITY verbose; re-run to capture it.
    return { ok: false, detail: text.slice(0, 400) };
  }
}

/** Run SQL expecting failure, and return the SQLSTATE Postgres reported. */
function psqlExpectError(sql: string): { sqlstate: string | null; detail: string } {
  try {
    execFileSync(
      "psql",
      [dbUrl!, "-v", "ON_ERROR_STOP=1", "-c", "\\set VERBOSITY verbose", "-tAc", sql],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { sqlstate: null, detail: "statement unexpectedly succeeded" };
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message?: string };
    const text =
      (typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8")) ??
      err.message ??
      "";
    // psql --VERBOSITY verbose emits "ERROR:  42501: permission denied ...".
    // MEASURED 2026-08-14: the first Phase 1 run reported "SQLSTATE none" for
    // every refusal because this regex expected a literal "SQLSTATE" prefix
    // that psql never writes. The refusals were real 42501s all along.
    const m =
      text.match(/ERROR:\s*([0-9A-Z]{5}):/) ?? text.match(/SQLSTATE:?\s*([0-9A-Z]{5})/);
    return { sqlstate: m ? m[1] : null, detail: text.replace(/\s+/g, " ").slice(0, 300) };
  }
}

let pass = 0;
let fail = 0;
let blocked = 0;
function record(id: string, ok: boolean, note: string) {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${id} — ${note}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${id} — ${note}`);
  }
}
function recordBlocked(id: string, note: string) {
  blocked += 1;
  console.log(`  ⚠ ${id} BLOCKED — ${note}`);
}

function applyFixture(): boolean {
  try {
    execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-f", FIXTURE], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (error) {
    const err = error as { stderr?: Buffer | string };
    const stderr = typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8");
    console.error(`[restricted-role] fixture failed to apply: ${(stderr ?? "").slice(0, 500)}`);
    return false;
  }
}

function teardown() {
  // Best-effort. Revoke memberships first so DROP ROLE cannot be blocked.
  psql(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${ROLE}') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA public FROM ${ROLE}';
        BEGIN EXECUTE 'REVOKE ${ROLE} FROM authenticator'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN EXECUTE 'REVOKE ALL ON FUNCTION ${ALLOWED_FN} FROM ${ROLE}'; EXCEPTION WHEN others THEN NULL; END;
        EXECUTE 'DROP ROLE ${ROLE}';
      END IF;
    END $$;`);
}

console.log("→ Restricted-role Phase 1 proof (GAP-PGROLE-001)");

if (!applyFixture()) {
  teardown();
  process.exit(1);
}

try {
  // ── P1: role exists with no dangerous attribute ────────────────────────
  // One boolean rather than a concatenated string: psql renders booleans as
  // "true"/"false", and comparing against "f,f,f,f,f,f" failed on the first
  // run even though every attribute was correctly false.
  const attrs = psql(
    `SELECT NOT (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
       FROM pg_roles WHERE rolname='${ROLE}'`,
  );
  const detail = psql(
    `SELECT rolcanlogin||','||rolinherit||','||rolsuper||','||rolbypassrls||','||rolcreatedb||','||rolcreaterole
       FROM pg_roles WHERE rolname='${ROLE}'`,
  );
  record(
    "P1",
    attrs.ok && attrs.out === "true",
    `every dangerous attribute is off (login,inherit,super,bypassrls,createdb,createrole) = ${detail.out ?? attrs.detail}`,
  );

  // ── P6: zero table grants ──────────────────────────────────────────────
  const grants = psql(
    `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='${ROLE}'`,
  );
  record("P6", grants.ok && grants.out === "0", `table grants held by the role = ${grants.out ?? grants.detail}`);

  // ── P2 / P4: cross-domain reads and writes are refused by Postgres ─────
  const p2 = psqlExpectError(`SET ROLE ${ROLE}; SELECT count(*) FROM public.diary_entries;`);
  record("P2", p2.sqlstate === PERMISSION_DENIED, `SELECT diary_entries -> SQLSTATE ${p2.sqlstate ?? "none"} (${p2.detail})`);

  const p4 = psqlExpectError(
    `SET ROLE ${ROLE}; UPDATE public.subscriptions SET updated_at = now() WHERE false;`,
  );
  record("P4", p4.sqlstate === PERMISSION_DENIED, `UPDATE subscriptions -> SQLSTATE ${p4.sqlstate ?? "none"}`);

  // ── P5: the one allowlisted function succeeds ──────────────────────────
  // NULL args make the function a no-op by its own guard clause, so this
  // proves the privilege check passes without mutating any row.
  const p5 = psql(`SET ROLE ${ROLE}; SELECT public.bump_bridge_token_usage(NULL::uuid, NULL::integer) IS NULL;`);
  if (!p5.ok) {
    // Turn a denial into evidence instead of a guess: report whether the GRANT
    // actually landed and whether the function exists under the expected
    // identity signature.
    const priv = psql(
      `SELECT has_function_privilege('${ROLE}', 'public.bump_bridge_token_usage(uuid,integer)', 'EXECUTE')`,
    );
    const sig = psql(
      `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='bump_bridge_token_usage'
          AND pg_get_function_identity_arguments(p.oid)='uuid, integer'`,
    );
    console.error(
      `    diagnostic: has_function_privilege=${priv.out ?? priv.detail}; ` +
        `matching identity signature count=${sig.out ?? sig.detail}`,
    );
  }
  record("P5", p5.ok, `allowlisted function call ${p5.ok ? "succeeded" : `failed: ${p5.detail}`}`);

  // ── P9: revoking EXECUTE immediately restores the refusal ──────────────
  psql(`REVOKE EXECUTE ON FUNCTION ${ALLOWED_FN} FROM ${ROLE};`);
  const p9 = psqlExpectError(
    `SET ROLE ${ROLE}; SELECT public.bump_bridge_token_usage(NULL::uuid, NULL::integer);`,
  );
  record("P9", p9.sqlstate === PERMISSION_DENIED, `after REVOKE, function call -> SQLSTATE ${p9.sqlstate ?? "none"}`);
  psql(`GRANT EXECUTE ON FUNCTION ${ALLOWED_FN} TO ${ROLE};`);

  // ── P7: Lovable-drift regression ───────────────────────────────────────
  // A table created after the role exists must NOT become reachable. This is
  // the §3.4 founder-decision constraint under test: Lovable ships tables
  // without ACL awareness, so a table-grant partition would drift open.
  psql(`CREATE TABLE IF NOT EXISTS public.__restricted_role_drift_probe (id int);`);
  const p7 = psqlExpectError(
    `SET ROLE ${ROLE}; SELECT count(*) FROM public.__restricted_role_drift_probe;`,
  );
  record(
    "P7",
    p7.sqlstate === PERMISSION_DENIED,
    `newly created table is NOT reachable -> SQLSTATE ${p7.sqlstate ?? "none"}`,
  );
  psql(`DROP TABLE IF EXISTS public.__restricted_role_drift_probe;`);

  // ── P8: determinism ────────────────────────────────────────────────────
  const p2b = psqlExpectError(`SET ROLE ${ROLE}; SELECT count(*) FROM public.diary_entries;`);
  // Both sides must be the real refusal code. Comparing only for equality made
  // this a VACUOUS PASS on the first run: two unparsed nulls compared equal and
  // reported green while proving nothing.
  record(
    "P8",
    p2b.sqlstate === PERMISSION_DENIED && p2.sqlstate === PERMISSION_DENIED,
    `repeat of P2 yields the same refusal (first=${p2.sqlstate ?? "none"}, second=${p2b.sqlstate ?? "none"})`,
  );

  // ── P10: no dangerous attribute anywhere in the fixture text ───────────
  // Re-asserted from pg_roles in P1; this is the source-side companion.
  const fixtureText = readFileSync(FIXTURE, "utf-8");
  const forbidden = /\b(?<!NO)(SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB|REPLICATION)\b/g;
  const hits = [...fixtureText.matchAll(forbidden)].map((m) => m[1]);
  record("P10", hits.length === 0, `fixture grants no dangerous attribute${hits.length ? `: ${hits.join(", ")}` : ""}`);

  // ── P3: PostgREST honours a custom role claim (§5.3 — the blocker) ─────
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    recordBlocked(
      "P3",
      "SUPABASE_JWT_SECRET not set — cannot mint a role-claim JWT. §5.3 remains unproven; " +
        "do NOT record the PostgREST role-switching mechanism as available.",
    );
  } else {
    const base = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const header = b64({ alg: "HS256", typ: "JWT" });
    const now = Math.floor(Date.now() / 1000);
    const payload = b64({ role: ROLE, iss: "supabase", iat: now, exp: now + 300 });
    const sig = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${sig}`;
    try {
      const res = await fetch(`${base}/rest/v1/diary_entries?select=id&limit=1`, {
        headers: { apikey: token, Authorization: `Bearer ${token}` },
      });
      // The role claim was honoured if PostgREST switched to a role that is
      // refused at the grant layer. A 200 would mean it did NOT switch.
      const body = await res.text();
      // A bare 403 is NOT proof: PostgREST also 401/403s a token it rejects
      // outright, which would look identical while never switching role. Require
      // the body to carry the grant-layer refusal itself.
      const switched =
        res.status === 403 &&
        (body.includes(PERMISSION_DENIED) || /permission denied/i.test(body));
      record(
        "P3",
        switched,
        `PostgREST role-claim switch: HTTP ${res.status}; body=${body.replace(/\s+/g, " ").slice(0, 160)}` +
          (switched
            ? " (role honoured — refused at the grant layer, not at the JWT layer)"
            : " — NOT proof of a role switch"),
      );
    } catch (error) {
      recordBlocked("P3", `PostgREST unreachable at ${base}: ${(error as Error).message}`);
    }
  }
} finally {
  teardown();
  const left = psql(`SELECT count(*) FROM pg_roles WHERE rolname='${ROLE}'`);
  if (left.ok && left.out !== "0") {
    console.error(`[restricted-role] WARNING: role ${ROLE} still present after teardown`);
  } else {
    console.log("  ✓ teardown — role dropped");
  }
}

console.log(`\nrestricted-role Phase 1: ${pass} passed, ${fail} failed, ${blocked} blocked`);
if (fail > 0) process.exit(1);
if (blocked > 0) {
  console.log(
    "Blocked checks are NOT passes. Phase 1 is partial until they run — see spec §12.",
  );
}
process.exit(0);
