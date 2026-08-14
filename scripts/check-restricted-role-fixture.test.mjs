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

test("fixture negates every dangerous role attribute", () => {
  for (const attr of [
    "NOLOGIN",
    "NOINHERIT",
    "NOSUPERUSER",
    "NOCREATEDB",
    "NOCREATEROLE",
    "NOREPLICATION",
    "NOBYPASSRLS",
  ]) {
    assert.ok(fixture.includes(attr), `fixture must assert ${attr}`);
  }
});

test("fixture grants no dangerous attribute in the positive form", () => {
  // (?<!NO) so NOSUPERUSER etc. do not trip this.
  const hits = [
    ...fixture.matchAll(/\b(?<!NO)(SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB|REPLICATION)\b/g),
  ].map((m) => m[1]);
  assert.deepEqual(hits, []);
});

test("fixture grants NO table privileges — the whole point of the design", () => {
  assert.doesNotMatch(fixture, /GRANT[^;]*\bON\s+TABLE\b/i);
  assert.doesNotMatch(fixture, /GRANT[^;]*\bON\s+ALL\s+TABLES\b/i);
  assert.doesNotMatch(fixture, /GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\b/i);
});

test("fixture grants EXECUTE on exactly one function", () => {
  const grants = [...fixture.matchAll(/GRANT EXECUTE ON FUNCTION ([^']+?) TO verdant_ingest_writer/g)];
  assert.equal(grants.length, 1, "exactly one allowlisted function");
  assert.match(grants[0][1], /public\.bump_bridge_token_usage\(uuid, integer\)/);
});

test("fixture contains no raising self-test — the R1 rule from §3.5", () => {
  // 20260805090000 rolled back its own real fixes because a failing assertion
  // shared their transaction. Verification belongs in the harness.
  assert.doesNotMatch(fixture, /RAISE\s+EXCEPTION/i);
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
