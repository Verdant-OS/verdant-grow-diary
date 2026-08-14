import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "scripts", "sql", "restricted-role-phase1-ingest.sql");
const HARNESS = join(ROOT, "scripts", "run-restricted-role-harness.ts");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

const fixture = readFileSync(FIXTURE, "utf-8");
// SQL-shape assertions must scan CODE, not prose. The fixture's comments
// legitimately name NOSUPERUSER/NOBYPASSRLS while explaining why they are not
// commanded, and a naive scan matches that explanation instead of the
// statements — which is exactly how a guard ends up asserting nothing.
const fixtureCode = fixture
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const harness = readFileSync(HARNESS, "utf-8");

// ── The fence that matters most: this must never become a migration ───────
test("the role fixture is NOT under supabase/migrations/", () => {
  const offenders = readdirSync(MIGRATIONS).filter((f) =>
    /restricted[-_]?role|verdant_ingest_writer/i.test(f),
  );
  assert.deepEqual(
    offenders,
    [],
    "a Phase 1 role file in supabase/migrations/ would reach production on the next Lovable apply, " +
      "violating spec §8 (local replay only) and §9 (production roles REJECT)",
  );
});

test("no migration creates the Phase 1 role", () => {
  const hits = [];
  for (const f of readdirSync(MIGRATIONS)) {
    if (!f.endsWith(".sql")) continue;
    const body = readFileSync(join(MIGRATIONS, f), "utf-8");
    if (/verdant_ingest_writer/.test(body)) hits.push(f);
  }
  assert.deepEqual(hits, [], "the Phase 1 role must not appear in any migration");
});

test("the repository still has zero CREATE ROLE statements in migrations", () => {
  // Phase 1 must not change the §3.1 audit fact it was built on.
  const hits = [];
  for (const f of readdirSync(MIGRATIONS)) {
    if (!f.endsWith(".sql")) continue;
    if (/^\s*create\s+role\b/im.test(readFileSync(join(MIGRATIONS, f), "utf-8"))) hits.push(f);
  }
  assert.deepEqual(hits, []);
});

// ── Role shape ────────────────────────────────────────────────────────────
test("fixture creates the role guarded, so re-applying cannot error", () => {
  assert.match(fixture, /IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'verdant_ingest_writer'\)/);
  assert.match(fixture, /CREATE ROLE verdant_ingest_writer/);
});

test("CREATE ROLE sets the two attributes a non-superuser may set", () => {
  // NOINHERIT is the one default that does not go the safe way — roles INHERIT
  // by default — so it must be named at CREATE time.
  assert.match(fixtureCode, /CREATE ROLE verdant_ingest_writer NOLOGIN NOINHERIT;/);
});

test("fixture does NOT attempt a superuser-only ALTER ROLE", () => {
  // MEASURED 2026-08-14 on the Supabase local stack:
  //   ERROR: permission denied to alter role
  // PostgreSQL requires superuser to change SUPERUSER / REPLICATION /
  // BYPASSRLS, even to turn them OFF, and Supabase's postgres role is not one.
  // Those attributes are already off by CREATE ROLE default, so the fixture
  // must verify them (harness P1) rather than command them.
  const alters = [...fixtureCode.matchAll(/ALTER ROLE[^;]*/g)].map((m) => m[0]);
  for (const stmt of alters) {
    for (const attr of ["SUPERUSER", "REPLICATION", "BYPASSRLS", "CREATEDB", "CREATEROLE"]) {
      assert.ok(
        !new RegExp(`\\bNO${attr}\\b|\\b${attr}\\b`).test(stmt),
        `ALTER ROLE must not name ${attr} — it is superuser-only and will abort the fixture`,
      );
    }
  }
});

test("any ALTER ROLE is guarded so it cannot abort the fixture", () => {
  if (/ALTER ROLE/.test(fixtureCode)) {
    assert.match(fixture, /EXCEPTION\s+WHEN insufficient_privilege/);
  }
});

test("the harness verifies the dangerous attributes from pg_roles, not from text", () => {
  for (const col of [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
    "rolcanlogin",
    "rolinherit",
  ]) {
    assert.ok(harness.includes(col), `P1 must read ${col} from pg_roles`);
  }
  // P1 asks Postgres for ONE boolean rather than string-matching a
  // concatenation: psql renders booleans as "true"/"false", and the original
  // "f,f,f,f,f,f" comparison failed on a role whose attributes were all
  // correctly off.
  assert.match(harness, /NOT \(rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole\)/);
  assert.match(harness, /attrs\.out === "true"/);
});

test("fixture grants no dangerous attribute in the positive form", () => {
  // (?<!NO) so NOSUPERUSER etc. do not trip this.
  const hits = [
    ...fixtureCode.matchAll(/\b(?<!NO)(SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB|REPLICATION)\b/g),
  ].map((m) => m[1]);
  assert.deepEqual(hits, []);
});

test("fixture grants NO table privileges — the whole point of the design", () => {
  assert.doesNotMatch(fixtureCode, /GRANT[^;]*\bON\s+TABLE\b/i);
  assert.doesNotMatch(fixtureCode, /GRANT[^;]*\bON\s+ALL\s+TABLES\b/i);
  assert.doesNotMatch(fixtureCode, /GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\b/i);
});

test("fixture grants EXECUTE on exactly one function", () => {
  const grants = [...fixtureCode.matchAll(/GRANT EXECUTE ON FUNCTION ([^']+?) TO verdant_ingest_writer/g)];
  assert.equal(grants.length, 1, "exactly one allowlisted function");
  assert.match(grants[0][1], /public\.bump_bridge_token_usage\(uuid, integer\)/);
});

test("fixture contains no raising self-test — the R1 rule from §3.5", () => {
  // 20260805090000 rolled back its own real fixes because a failing assertion
  // shared their transaction. Verification belongs in the harness.
  assert.doesNotMatch(fixtureCode, /RAISE\s+EXCEPTION/i);
});

test("fixture guards the authenticator grant on the role existing", () => {
  assert.match(fixture, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'authenticator'\)/);
});

// ── Harness safety ────────────────────────────────────────────────────────
test("harness refuses a non-loopback database and offers no remote opt-in", () => {
  assert.match(harness, /refusing a non-loopback SUPABASE_DB_URL/);
  assert.doesNotMatch(
    harness,
    /ALLOW_REMOTE|allow-remote|--confirm-remote/,
    "Phase 1 must have no remote escape hatch",
  );
});

test("harness is opt-in and skips cleanly without its flag", () => {
  assert.match(harness, /--confirm-local-security-lane/);
  assert.match(harness, /SKIP —/);
});

test("harness drops the role in teardown", () => {
  assert.match(harness, /DROP ROLE/);
  assert.match(harness, /finally\s*\{/);
});

test("harness treats a blocked check as not-a-pass", () => {
  assert.match(harness, /Blocked checks are NOT passes/);
  assert.match(harness, /recordBlocked\("P3"/);
});

test("harness asserts SQLSTATE 42501 rather than message text", () => {
  assert.match(harness, /const PERMISSION_DENIED = "42501"/);
  const sqlstateAsserts = [...harness.matchAll(/=== PERMISSION_DENIED/g)];
  assert.ok(sqlstateAsserts.length >= 4, "P2, P4, P7 and P9 must all assert the SQLSTATE");
});

test("harness does not re-point any edge function", () => {
  assert.doesNotMatch(harness, /supabase\/functions\//);
});

// ── Regressions for the defects the first live run exposed ────────────────
test("SQLSTATE extraction matches psql's actual ERROR: <code>: format", () => {
  // The first run reported "SQLSTATE none" for every refusal because the regex
  // expected a literal "SQLSTATE" prefix psql never writes. The refusals were
  // real 42501s. Pin the corrected pattern against a real psql error string.
  const m = harness.match(/text\.match\(([^)]*ERROR[^)]*)\)/);
  assert.ok(m, "harness must parse the ERROR: <sqlstate>: form");
  const sample =
    "psql:ERROR:  42501: permission denied for table diary_entries\nLOCATION: aclcheck_error";
  assert.equal(sample.match(/ERROR:\s*([0-9A-Z]{5}):/)?.[1], "42501");
});

test("P8 cannot pass vacuously when neither side parsed", () => {
  // It originally compared two nulls for equality and reported green.
  assert.match(harness, /p2b\.sqlstate === PERMISSION_DENIED && p2\.sqlstate === PERMISSION_DENIED/);
});

test("P3 requires a grant-layer refusal, not any 403", () => {
  // PostgREST also 401/403s a token it rejects outright, which would look
  // identical while never switching role.
  assert.match(harness, /res\.status === 403 &&/);
  assert.match(harness, /permission denied/i);
});

test("the fixture never silently skips the allowlisted GRANT", () => {
  // The pre-check on pg_get_function_identity_arguments failed closed and
  // silently, leaving the role with no EXECUTE and P5 unexplained.
  assert.doesNotMatch(fixtureCode, /IF EXISTS[\s\S]*pg_get_function_identity_arguments/);
  assert.match(fixtureCode, /WHEN undefined_function THEN/);
});
