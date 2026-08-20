#!/usr/bin/env -S bun run
/**
 * Resolved-value EXECUTE regression harness for the Quick Log manual-save
 * spine, against the replayed local Supabase stack.
 *
 * Proves, with has_function_privilege / aclexplode (never proacl text):
 *   1. Only postgres can EXECUTE the five private helpers
 *      (quicklog_save_manual_pre_logged_at, quicklog_try_parse_logged_at,
 *      quicklog_try_parse_uuid, quicklog_stamp_diary_logged_at,
 *      quicklog_stamp_grow_event_logged_at) — anon, authenticated,
 *      service_role, and the PUBLIC pseudo-role all read false.
 *   2. The public wrapper quicklog_save_manual keeps EXECUTE for
 *      authenticated AND service_role, and stays closed to anon/PUBLIC.
 *   3. The fences hold at runtime, not just in the catalog: an
 *      authenticated session calling a private helper dies with SQLSTATE
 *      42501, while wrapper calls under authenticated and service_role
 *      execute and answer with calm validation JSON (all inside rolled-back
 *      transactions — nothing persists).
 *   4. Negative control: the probes actually detect a re-opened grant
 *      (grant → observe exposure → restore in finally).
 *
 * The 20260818010000 forward repair deliberately fails closed on any ACL
 * drift instead of repairing it, so unlike the pgmq harness this one cannot
 * "re-apply the migration to close the hole" — detection is the contract.
 *
 *   bun run scripts/run-quicklog-private-helper-grants-db-security.ts --confirm-local-security-lane
 *
 * Required env: SUPABASE_DB_URL on a loopback host. psql on PATH.
 */
import { execFileSync } from "node:child_process";

import {
  QUICKLOG_MANUAL_SIGNATURE,
  QUICKLOG_PRIVATE_HELPER_FUNCTIONS,
  QUICKLOG_PRIVATE_HELPER_SIGNATURES,
} from "../src/lib/quicklogPrivateHelperGrantRules";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(
    `[quicklog-private-helper-grants] SKIP — pass ${LOCAL_LANE_FLAG} to run the local ACL harness.`,
  );
  process.exit(0);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function dbUrlOrSkip(): string | null {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  let host: string;
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    return null;
  }
  return isLoopbackHost(host) ? dbUrl : null;
}

const dbUrl = dbUrlOrSkip();
if (!dbUrl) {
  console.error(
    "[quicklog-private-helper-grants] local security lane requires loopback SUPABASE_DB_URL",
  );
  process.exit(2);
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
}

function psqlRun(sql: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    const record = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: (record.stdout ?? "").trim(),
      stderr: (record.stderr ?? "").trim(),
    };
  }
}

function psqlScalar(sql: string): string | null {
  const result = psqlRun(sql);
  return result.ok ? result.stdout : null;
}

const WRAPPER_SIGNATURE = `public.quicklog_save_manual(${QUICKLOG_MANUAL_SIGNATURE})`;

function hasExecute(role: string, signature: string): boolean | null {
  const out = psqlScalar(
    `SELECT has_function_privilege('${role}', '${signature.replaceAll("'", "''")}'::regprocedure, 'EXECUTE');`,
  );
  if (out === null) return null;
  return out === "t";
}

function publicHasExecute(signature: string): boolean | null {
  const out = psqlScalar(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_proc p
         CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = '${signature.replaceAll("'", "''")}'::regprocedure
          AND a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
     );`,
  );
  if (out === null) return null;
  return out === "t";
}

function functionPresent(signature: string): boolean {
  return (
    psqlScalar(`SELECT to_regprocedure('${signature.replaceAll("'", "''")}') IS NOT NULL;`) === "t"
  );
}

/**
 * True only when the function is owned by postgres AND its resolved ACL is
 * exactly one entry: postgres=EXECUTE. Enumerating named roles is not
 * enough — a grant to ANY other role (or an ownership transfer) must fail
 * this check, mirroring the forward-repair postcondition's full-ACL match.
 */
function aclExactlyPostgres(signature: string): boolean | null {
  const out = psqlScalar(
    `SELECT owner_role.rolname = 'postgres'
        AND COALESCE((
          SELECT array_agg(
                   format('%s|%s', COALESCE(grantee.rolname, 'PUBLIC'), a.privilege_type)
                   ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), a.privilege_type
                 )
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
        ), ARRAY[]::text[]) = ARRAY['postgres|EXECUTE']
       FROM pg_proc p
       JOIN pg_roles owner_role ON owner_role.oid = p.proowner
      WHERE p.oid = '${signature.replaceAll("'", "''")}'::regprocedure;`,
  );
  if (out === null) return null;
  return out === "t";
}

console.log("→ quicklog manual-save private-helper EXECUTE matrix (resolved values)");

// Preflight: every function must exist. A missing function would make each
// denial check trivially "expected=false, got=false" and silently pass —
// that is a false green. Fail loudly and distinctly instead.
let allPresent = functionPresent(WRAPPER_SIGNATURE);
check("wrapper present: quicklog_save_manual", allPresent, "apply the migration replay first");
for (const helper of QUICKLOG_PRIVATE_HELPER_FUNCTIONS) {
  const present = functionPresent(QUICKLOG_PRIVATE_HELPER_SIGNATURES[helper]);
  allPresent = allPresent && present;
  check(`helper present: ${helper}`, present, "apply the migration replay first");
}

if (!allPresent) {
  console.log(
    `\n[quicklog-private-helper-grants] ${passed} passed, ${failed} failed (function preflight failed — ACL checks not run)`,
  );
  process.exit(1);
}

// 1. Postgres-only matrix on the five private helpers.
for (const helper of QUICKLOG_PRIVATE_HELPER_FUNCTIONS) {
  const signature = QUICKLOG_PRIVATE_HELPER_SIGNATURES[helper];
  check(`${helper}: anon cannot EXECUTE`, hasExecute("anon", signature) === false);
  check(
    `${helper}: authenticated cannot EXECUTE`,
    hasExecute("authenticated", signature) === false,
  );
  check(`${helper}: service_role cannot EXECUTE`, hasExecute("service_role", signature) === false);
  check(`${helper}: postgres CAN EXECUTE`, hasExecute("postgres", signature) === true);
  check(`${helper}: PUBLIC pseudo-role holds no EXECUTE`, publicHasExecute(signature) === false);
  check(
    `${helper}: resolved ACL is exactly postgres=EXECUTE with postgres owner (no other grantee)`,
    aclExactlyPostgres(signature) === true,
  );
}

// 2. Wrapper matrix.
check("wrapper: anon cannot EXECUTE", hasExecute("anon", WRAPPER_SIGNATURE) === false);
check(
  "wrapper: PUBLIC pseudo-role holds no EXECUTE",
  publicHasExecute(WRAPPER_SIGNATURE) === false,
);
check(
  "wrapper: authenticated CAN EXECUTE",
  hasExecute("authenticated", WRAPPER_SIGNATURE) === true,
);
check("wrapper: service_role CAN EXECUTE", hasExecute("service_role", WRAPPER_SIGNATURE) === true);

// 3a. Runtime denial: an authenticated session calling a private helper.
const denial = psqlRun(
  `BEGIN;
   SET LOCAL ROLE authenticated;
   SELECT public.quicklog_try_parse_uuid('00000000-0000-4000-8000-000000000000');
   ROLLBACK;`,
);
check(
  "runtime: authenticated calling quicklog_try_parse_uuid dies with 42501",
  !denial.ok && /permission denied/i.test(denial.stderr),
  denial.ok ? "call unexpectedly succeeded" : denial.stderr,
);

// 3b. Runtime wrapper EXECUTE as authenticated — validation answers, then
// everything rolls back (the probe target type can never reach a write).
const authenticatedCall = psqlRun(
  `BEGIN;
   SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
   SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
   SET LOCAL ROLE authenticated;
   SELECT public.quicklog_save_manual('acl_probe', '00000000-0000-4000-8000-000000000000'::uuid, 'note');
   ROLLBACK;`,
);
check(
  "runtime: authenticated wrapper call executes and answers calm validation JSON",
  authenticatedCall.ok && /invalid_target_type|not_authenticated/.test(authenticatedCall.stdout),
  authenticatedCall.ok ? authenticatedCall.stdout : authenticatedCall.stderr,
);

// 3c. Runtime wrapper EXECUTE as service_role — no JWT, so the wrapper
// answers not_authenticated; the point is that EXECUTE is permitted.
const serviceCall = psqlRun(
  `BEGIN;
   SET LOCAL ROLE service_role;
   SELECT public.quicklog_save_manual('acl_probe', '00000000-0000-4000-8000-000000000000'::uuid, 'note');
   ROLLBACK;`,
);
check(
  "runtime: service_role wrapper call executes (not permission-denied)",
  serviceCall.ok && /not_authenticated/.test(serviceCall.stdout),
  serviceCall.ok ? serviceCall.stdout : serviceCall.stderr,
);

// 4. Negative control: the probes must detect a re-opened grant.
const PROBE_HELPER = QUICKLOG_PRIVATE_HELPER_SIGNATURES.quicklog_try_parse_uuid;
const opened = psqlRun(`GRANT EXECUTE ON FUNCTION ${PROBE_HELPER} TO authenticated;`);
check("negative control: could re-open authenticated EXECUTE", opened.ok, opened.stderr);
try {
  check(
    "negative control: probe sees the re-opened grant",
    hasExecute("authenticated", PROBE_HELPER) === true,
  );
  check(
    "negative control: exact-ACL check rejects the extra grantee",
    aclExactlyPostgres(PROBE_HELPER) === false,
  );
} finally {
  const restored = psqlRun(
    `REVOKE EXECUTE ON FUNCTION ${PROBE_HELPER} FROM PUBLIC, anon, authenticated, service_role;`,
  );
  check("restored postgres-only posture on the probe helper", restored.ok, restored.stderr);
  check(
    "restored posture verified by resolved privilege",
    hasExecute("authenticated", PROBE_HELPER) === false &&
      hasExecute("postgres", PROBE_HELPER) === true,
  );
}

console.log(`\n[quicklog-private-helper-grants] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
