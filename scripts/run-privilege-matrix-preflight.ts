#!/usr/bin/env -S bun run
/**
 * Read-only Postgres privilege matrix preflight.
 *
 * Prints the effective privilege state for the trust-boundary surface (event
 * tables + typed-event / quicklog RPCs) BEFORE any migration work so an
 * operator can confirm the linked project actually matches the contract
 * they think they're migrating from. Uses SELECT-only queries against
 * pg_catalog/information_schema; never writes.
 *
 * Usage
 * -----
 *   SUPABASE_DB_URL=postgres://... bun run scripts/run-privilege-matrix-preflight.ts
 *
 * Options
 *   --expected-project-ref=<ref>   Fail if the DB hostname does not resolve to
 *                                  db.<ref>.supabase.co (or the ref appears in
 *                                  the hostname). Recommended for production.
 *   --report-only                  Print the matrix but always exit 0 (never
 *                                  block on drift). Default: exit 1 on drift.
 *   --json                         Emit a JSON payload after the human matrix.
 *
 * Exit codes
 *   0 — matrix printed AND (report-only OR every row matches its contract)
 *   1 — one or more rows drift from the pinned contract (and not --report-only)
 *   2 — misconfiguration (missing SUPABASE_DB_URL, wrong project ref, etc.)
 *
 * IMPORTANT: this script never mutates the database. It exists so migration
 * work can be gated on a verified starting state. It is deliberately not part
 * of any automatic pre-migration hook — an operator runs it explicitly.
 */
import { SQL } from "bun";

// ─── Args & env ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const emitJson = args.includes("--json");
const expectedRefArg = args.find((a) => a.startsWith("--expected-project-ref="));
const expectedProjectRef = expectedRefArg
  ? expectedRefArg.slice("--expected-project-ref=".length)
  : (process.env.PRIVILEGE_MATRIX_EXPECTED_PROJECT_REF ?? "");

const DATABASE_URL = process.env.SUPABASE_DB_URL ?? "";
if (!DATABASE_URL) {
  console.error("[privilege-matrix] missing SUPABASE_DB_URL");
  process.exit(2);
}

let databaseHostname: string;
try {
  databaseHostname = new URL(DATABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[privilege-matrix] SUPABASE_DB_URL is not a valid URL");
  process.exit(2);
}

if (expectedProjectRef) {
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef)) {
    console.error(
      `[privilege-matrix] --expected-project-ref must be the 20-char lowercase project ref, got ${JSON.stringify(expectedProjectRef)}`,
    );
    process.exit(2);
  }
  const expectedHost = `db.${expectedProjectRef}.supabase.co`;
  const matchesHost =
    databaseHostname === expectedHost ||
    databaseHostname.startsWith(`${expectedProjectRef}.`) ||
    databaseHostname.includes(`.${expectedProjectRef}.`);
  if (!matchesHost) {
    console.error(
      `[privilege-matrix] refusing: SUPABASE_DB_URL hostname (${databaseHostname}) does not match expected project ref (${expectedProjectRef})`,
    );
    process.exit(2);
  }
}

// ─── Contract (pinned expected state) ─────────────────────────────────────────
// Kept in one place so a diff against production is a single grep away.
// Update in the same commit as any REVOKE/GRANT migration that changes the
// trust boundary.
type PrivMap = Record<string, Record<"SELECT" | "INSERT" | "UPDATE" | "DELETE", boolean>>;
type ExecMap = Record<string, boolean>;

const ROLES = ["anon", "authenticated", "service_role"] as const;
type Role = (typeof ROLES)[number];
const DML_PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

interface TableContract {
  table: string;
  expected: PrivMap;
}
interface FunctionContract {
  name: string;
  // If provided, expect the function to be present. If false, expect absent.
  mustExist: boolean;
  expectedExecute: ExecMap;
  // Optional expected SECURITY DEFINER flag (true = definer, false = invoker).
  expectedSecurityDefiner?: boolean;
}

// Irrigation-evidence trust boundary (2026-07-22 revoke):
//   authenticated retains SELECT (RLS filters per row) but NO direct DML.
//   service_role retains full DML for admin/backfill paths.
const eventTableExpectation: PrivMap = {
  anon: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false },
  authenticated: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false },
  service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true },
};

const TABLE_CONTRACTS: TableContract[] = [
  { table: "public.grow_events", expected: eventTableExpectation },
  { table: "public.watering_events", expected: eventTableExpectation },
  { table: "public.feeding_events", expected: eventTableExpectation },
];

const FUNCTION_CONTRACTS: FunctionContract[] = [
  {
    name: "public.create_watering_event",
    mustExist: true,
    expectedExecute: { anon: false, authenticated: false, service_role: true },
    expectedSecurityDefiner: false,
  },
  {
    name: "public.create_feeding_event",
    mustExist: true,
    expectedExecute: { anon: false, authenticated: false, service_role: true },
    expectedSecurityDefiner: false,
  },
  {
    name: "public.quicklog_save_event",
    mustExist: true,
    // Canonical typed-event writer for authenticated clients.
    expectedExecute: { anon: false, authenticated: true, service_role: true },
  },
  {
    name: "public.quicklog_save_manual",
    mustExist: true,
    // Reviewed remediation revokes anon EXECUTE. Contract encodes the
    // POST-remediation state; preflight will flag current drift if anon
    // still has EXECUTE.
    expectedExecute: { anon: false, authenticated: true, service_role: true },
  },
];

// ─── Query helpers ────────────────────────────────────────────────────────────
const db = new SQL(DATABASE_URL, { max: 1 });

async function checkTablePresent(qualified: string): Promise<boolean> {
  const rows = (await db.unsafe(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [qualified],
  )) as unknown as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}

async function tablePrivMatrix(qualified: string): Promise<PrivMap> {
  const rows = (await db.unsafe(
    `
    SELECT
      grantee::text AS role,
      privilege_type::text AS priv
    FROM information_schema.role_table_grants
    WHERE table_schema || '.' || table_name = $1
      AND grantee = ANY($2::text[])
      AND privilege_type = ANY($3::text[])
    `,
    [qualified, ROLES as unknown as string[], DML_PRIVS as unknown as string[]],
  )) as unknown as Array<{ role: string; priv: string }>;
  const matrix: PrivMap = {};
  for (const role of ROLES) {
    matrix[role] = { SELECT: false, INSERT: false, UPDATE: false, DELETE: false };
  }
  for (const row of rows) {
    if ((ROLES as readonly string[]).includes(row.role)) {
      const priv = row.priv as (typeof DML_PRIVS)[number];
      matrix[row.role][priv] = true;
    }
  }
  return matrix;
}

interface FunctionState {
  present: boolean;
  overloadCount: number;
  anyDefiner: boolean;
  execute: ExecMap;
}

async function functionState(qualified: string): Promise<FunctionState> {
  const [schema, name] = qualified.split(".");
  const overloadRows = (await db.unsafe(
    `
    SELECT p.oid, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.proname = $2
    `,
    [schema, name],
  )) as unknown as Array<{ oid: string | number; prosecdef: boolean }>;

  const execute: ExecMap = { anon: false, authenticated: false, service_role: false };
  if (overloadRows.length > 0) {
    // has_function_privilege OR across every overload. If ANY overload grants
    // EXECUTE to a role, that role can call SOME version — surface it.
    const priv = (await db.unsafe(
      `
      SELECT
        bool_or(has_function_privilege('anon',          p.oid, 'EXECUTE')) AS anon,
        bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated,
        bool_or(has_function_privilege('service_role',  p.oid, 'EXECUTE')) AS service_role
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.proname = $2
      `,
      [schema, name],
    )) as unknown as Array<{ anon: boolean; authenticated: boolean; service_role: boolean }>;
    execute.anon = priv[0]?.anon === true;
    execute.authenticated = priv[0]?.authenticated === true;
    execute.service_role = priv[0]?.service_role === true;
  }
  return {
    present: overloadRows.length > 0,
    overloadCount: overloadRows.length,
    anyDefiner: overloadRows.some((r) => r.prosecdef === true),
    execute,
  };
}

async function currentProjectMeta(): Promise<{ database: string; role: string; version: string }> {
  const rows = (await db.unsafe(
    `SELECT current_database() AS database, current_user AS role, version() AS version`,
  )) as unknown as Array<{ database: string; role: string; version: string }>;
  return rows[0];
}

// ─── Render ───────────────────────────────────────────────────────────────────
const PASS = "✓";
const FAIL = "✗";

interface Finding {
  surface: string;
  label:
    | "match"
    | "missing-table"
    | "missing-function"
    | "unexpected-present"
    | "table-acl-mismatch"
    | "function-execute-mismatch"
    | "security-mode-mismatch";
  detail: string;
}

function padCell(v: boolean): string {
  return v ? " ✓ " : " · ";
}

function renderTable(t: TableContract, actual: PrivMap | null): Finding[] {
  const findings: Finding[] = [];
  console.log(`\n▸ table ${t.table}`);
  if (actual === null) {
    console.log(`  ${FAIL} [missing-table] not found — apply upstream migration first`);
    findings.push({
      surface: t.table,
      label: "missing-table",
      detail: "table absent",
    });
    return findings;
  }
  console.log(
    `  role                SELECT INSERT UPDATE DELETE  |  expected S I U D  | status`,
  );
  for (const role of ROLES) {
    const got = actual[role];
    const want = t.expected[role];
    const rowOk = DML_PRIVS.every((p) => got[p] === want[p]);
    const gotCells = DML_PRIVS.map((p) => padCell(got[p])).join(" ");
    const wantCells = DML_PRIVS.map((p) => (want[p] ? "1" : "0")).join(" ");
    console.log(
      `  ${role.padEnd(20)}${gotCells}  |     ${wantCells}    | ${
        rowOk ? PASS + " match" : FAIL + " [table-acl-mismatch]"
      }`,
    );
    if (!rowOk) {
      const diffs = DML_PRIVS.filter((p) => got[p] !== want[p]).map(
        (p) => `${p}: got=${got[p]} want=${want[p]}`,
      );
      findings.push({
        surface: `${t.table}/${role}`,
        label: "table-acl-mismatch",
        detail: diffs.join("; "),
      });
    }
  }
  return findings;
}

function renderFunction(fn: FunctionContract, state: FunctionState): Finding[] {
  const findings: Finding[] = [];
  console.log(`\n▸ function ${fn.name}`);
  if (!state.present) {
    if (fn.mustExist) {
      console.log(`  ${FAIL} [missing-function] not found — cannot assert ACL`);
      findings.push({ surface: fn.name, label: "missing-function", detail: "function absent" });
    } else {
      console.log(`  ${PASS} absent (as expected)`);
    }
    return findings;
  }
  if (!fn.mustExist) {
    console.log(`  ${FAIL} [unexpected-present] contract expects this function to be absent`);
    findings.push({
      surface: fn.name,
      label: "unexpected-present",
      detail: `overloads=${state.overloadCount}`,
    });
  } else {
    console.log(`  present (${state.overloadCount} overload${state.overloadCount === 1 ? "" : "s"})`);
  }

  console.log(`  role                EXECUTE  |  expected  | status`);
  for (const role of ROLES) {
    const got = state.execute[role];
    const want = fn.expectedExecute[role];
    const ok = got === want;
    console.log(
      `  ${role.padEnd(20)}${padCell(got)}   |     ${want ? "1" : "0"}    | ${
        ok ? PASS + " match" : FAIL + " [function-execute-mismatch]"
      }`,
    );
    if (!ok) {
      findings.push({
        surface: `${fn.name}/${role}`,
        label: "function-execute-mismatch",
        detail: `EXECUTE got=${got} want=${want}`,
      });
    }
  }

  if (fn.expectedSecurityDefiner !== undefined) {
    const gotDefiner = state.anyDefiner;
    const ok = gotDefiner === fn.expectedSecurityDefiner;
    console.log(
      `  security mode: ${gotDefiner ? "DEFINER" : "INVOKER"} | expected ${
        fn.expectedSecurityDefiner ? "DEFINER" : "INVOKER"
      } | ${ok ? PASS + " match" : FAIL + " [security-mode-mismatch]"}`,
    );
    if (!ok) {
      findings.push({
        surface: fn.name,
        label: "security-mode-mismatch",
        detail: `SECURITY got=${gotDefiner ? "DEFINER" : "INVOKER"} want=${
          fn.expectedSecurityDefiner ? "DEFINER" : "INVOKER"
        }`,
      });
    }
  }
  return findings;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const meta = await currentProjectMeta();
  console.log("═".repeat(74));
  console.log(" Privilege matrix preflight — READ-ONLY");
  console.log("═".repeat(74));
  console.log(` host:           ${databaseHostname}`);
  console.log(` database:       ${meta.database}`);
  console.log(` connected as:   ${meta.role}`);
  console.log(` server:         ${meta.version.split(" ").slice(0, 2).join(" ")}`);
  console.log(` mode:           ${reportOnly ? "report-only (never fails)" : "strict (fails on drift)"}`);
  if (expectedProjectRef) {
    console.log(` expected ref:   ${expectedProjectRef} ✓ (hostname matched)`);
  } else {
    console.log(
      ` expected ref:   (not pinned — pass --expected-project-ref=<ref> to bind this run)`,
    );
  }

  const findings: Finding[] = [];

  console.log("\n── Table DML privilege matrix ──────────────────────────────────────────");
  for (const t of TABLE_CONTRACTS) {
    const present = await checkTablePresent(t.table);
    const actual = present ? await tablePrivMatrix(t.table) : null;
    findings.push(...renderTable(t, actual));
  }

  console.log("\n── Function EXECUTE privilege matrix ───────────────────────────────────");
  for (const fn of FUNCTION_CONTRACTS) {
    const state = await functionState(fn.name);
    findings.push(...renderFunction(fn, state));
  }

  console.log("\n── Summary ─────────────────────────────────────────────────────────────");
  if (findings.length === 0) {
    console.log(` ${PASS} every surface matches the pinned trust-boundary contract`);
  } else {
    console.log(` ${FAIL} ${findings.length} drift finding(s):`);
    for (const f of findings) {
      console.log(`   • [${f.label}] ${f.surface} — ${f.detail}`);
    }
    console.log("\n Remediation hints:");
    console.log("   • [missing-function] / [missing-table] → the upstream migration");
    console.log("       has not been applied on this database; do not proceed with a");
    console.log("       migration that assumes it exists.");
    console.log("   • [table-acl-mismatch] / [function-execute-mismatch] → the pinned");
    console.log("       contract disagrees with reality. Confirm which is correct and");
    console.log("       update the migration (or the contract) accordingly.");
    console.log("   • [security-mode-mismatch] → a function is DEFINER when it should");
    console.log("       be INVOKER (or vice versa). Never widen SECURITY DEFINER without");
    console.log("       a threat-model review.");
  }

  if (emitJson) {
    console.log("\n── JSON ────────────────────────────────────────────────────────────────");
    console.log(
      JSON.stringify(
        {
          host: databaseHostname,
          database: meta.database,
          connectedAs: meta.role,
          expectedProjectRef: expectedProjectRef || null,
          reportOnly,
          findings,
          ok: findings.length === 0,
        },
        null,
        2,
      ),
    );
  }

  await db.close();
  if (!reportOnly && findings.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (e) => {
  console.error("[privilege-matrix] fatal", e);
  try {
    await db.close();
  } catch {
    /* ignore */
  }
  process.exit(2);
});
