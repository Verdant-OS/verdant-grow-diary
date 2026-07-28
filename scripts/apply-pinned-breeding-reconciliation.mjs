#!/usr/bin/env node
/**
 * Manual, fail-closed production runner for Verdant's reviewed breeding
 * workflow reconciliation migration.
 *
 * This is intentionally not a generic migration runner. It will only read the
 * single file pinned below, only accept its reviewed LF byte hash, and only
 * connect to the pinned production Supabase project.
 *
 * It differs from scripts/apply-pinned-production-migrations.mjs in one
 * load-bearing way: the breeding reconciliation OWNS ITS TRANSACTION (a single
 * top-level BEGIN … COMMIT pair followed by a post-commit NOTIFY). The runner
 * therefore:
 *   - never passes psql's single-transaction wrapper flag,
 *   - allows exactly that one BEGIN/COMMIT pair in the unsafe-SQL scan,
 *   - records this migration's own ledger marker (20260728163100) only AFTER
 *     the file's own COMMIT succeeded AND the exact postconditions verified,
 *   - supports rerunning after the state where the file committed but the
 *     ledger marker was never recorded (the migration's documented "safe
 *     rerun" input): the file is safe to re-run and the marker insert is
 *     idempotent and collision-guarded.
 *
 * Preconditions (fail closed, zero writes if unmet):
 *   - The three reviewed reconciliation migrations from the existing lane
 *     (20260728090000 / 20260728090736 / 20260728103000) must already be
 *     recorded EXACTLY in supabase_migrations.schema_migrations.
 *   - The connection role must be postgres on the pinned production project.
 *
 * Verify-only mode: when the 20260728163100 marker is already recorded
 * exactly AND the breeding contract is present, the runner performs ZERO
 * writes — preflight and postflight are read-only catalog queries.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  sanitizeSupabaseDatabaseUrlForPsql,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
export const APPLY_CONFIRMATION = "APPLY PINNED BREEDING RECONCILIATION";

export const PINNED_BREEDING_MIGRATION = Object.freeze({
  version: "20260728163100",
  name: "production_breeding_workflow_reconciliation",
  file: "20260728163100_production_breeding_workflow_reconciliation.sql",
  sha256: "D8C9D83BE772C8B2422403F1B1291AE6C9C33FCF6D7D08B7CB5F221233D96E70",
});

/**
 * The historical marker the migration records inside its own transaction.
 * The runner never inserts this row itself — it only verifies it afterward.
 */
export const HISTORICAL_BREEDING_ROW = Object.freeze({
  version: "20260707120000",
  name: "breeding_workflow_v1",
});

/**
 * The three-file reconciliation lane must have completed first. These exact
 * ledger rows are a hard precondition — this lane refuses to run against a
 * production database that has not been reconciled.
 */
export const REQUIRED_PRIOR_RECONCILIATION_ROWS = Object.freeze([
  Object.freeze({ version: "20260728090000", name: "production_schema_reconciliation" }),
  Object.freeze({ version: "20260728090736", name: "ai_credit_pack_portability" }),
  Object.freeze({ version: "20260728103000", name: "schema_audit_trust_hardening" }),
]);

export const BREEDING_RPC_SIGNATURE =
  "public.breeding_log_save_event(text,uuid,uuid,text,uuid,timestamptz,text,text,text,jsonb)";

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 2,
  NO_DATABASE_URL: 3,
  TARGET_REJECTED: 4,
  FILE_REJECTED: 5,
  PSQL_NOT_INVOCABLE: 6,
  PREFLIGHT_FAILED: 7,
  LEDGER_DRIFT: 8,
  APPLY_FAILED: 9,
  POSTFLIGHT_FAILED: 10,
  MARKER_FAILED: 11,
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "supabase", "migrations");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stripSqlCommentsAndQuotedText(text) {
  let output = "";
  let index = 0;
  while (index < text.length) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "-" && next === "-") {
      index += 2;
      while (index < text.length && text[index] !== "\n") index++;
      output += "\n";
      index++;
      continue;
    }
    if (current === "/" && next === "*") {
      let depth = 1;
      index += 2;
      while (index < text.length && depth > 0) {
        if (text[index] === "/" && text[index + 1] === "*") {
          depth++;
          index += 2;
        } else if (text[index] === "*" && text[index + 1] === "/") {
          depth--;
          index += 2;
        } else {
          if (text[index] === "\n") output += "\n";
          index++;
        }
      }
      continue;
    }
    if (current === "'" || current === '"') {
      const quote = current;
      output += " ";
      index++;
      while (index < text.length) {
        if (text[index] === quote && text[index + 1] === quote) {
          index += 2;
        } else if (text[index] === quote) {
          index++;
          break;
        } else {
          if (text[index] === "\n") output += "\n";
          index++;
        }
      }
      continue;
    }
    if (current === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index))?.[0];
      if (tag) {
        output += " ";
        index += tag.length;
        const closing = text.indexOf(tag, index);
        if (closing === -1) {
          while (index < text.length) {
            if (text[index] === "\n") output += "\n";
            index++;
          }
        } else {
          while (index < closing) {
            if (text[index] === "\n") output += "\n";
            index++;
          }
          index += tag.length;
        }
        continue;
      }
    }

    output += current;
    index++;
  }
  return output;
}

/**
 * Unsafe-SQL scan for a migration that owns its transaction.
 *
 * Exactly one top-level `BEGIN;` followed by exactly one `COMMIT;` (in that
 * order) is REQUIRED — that is the file's own transaction. Every other
 * transaction-control statement (a second BEGIN/COMMIT, ROLLBACK, ABORT,
 * START TRANSACTION, END, PREPARE TRANSACTION, COMMIT/ROLLBACK PREPARED,
 * SAVEPOINT at the top level) is refused, as are psql external-input
 * metacommands and statements that cannot run inside a transaction.
 */
export function findBreedingUnsafeSqlReason(text) {
  const topLevel = stripSqlCommentsAndQuotedText(text);

  if (/^\s*\\(?:(?:i|ir|include|include_relative)\b|!)/im.test(topLevel)) {
    return "psql_external_input";
  }
  if (
    /\b(?:vacuum|create\s+database|drop\s+database|alter\s+system|create\s+tablespace|drop\s+tablespace)\b/i.test(
      topLevel,
    ) ||
    /\b(?:create\s+(?:unique\s+)?index|reindex)\b[\s\S]{0,500}\bconcurrently\b/i.test(topLevel) ||
    /\bcopy\b[\s\S]{0,500}\bprogram\b/i.test(topLevel)
  ) {
    return "transaction_forbidden_statement";
  }

  const controlMatches = [
    ...topLevel.matchAll(
      /^\s*(begin(?:\s+(?:work|transaction))?|start\s+transaction|commit(?:\s+(?:work|transaction))?|end(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?|abort(?:\s+work)?|prepare\s+transaction|commit\s+prepared|rollback\s+prepared|savepoint\s+[\w$]+|release\s+savepoint\s+[\w$]+|rollback\s+to\s+savepoint\s+[\w$]+)\s*;/gim,
    ),
  ].map((match) => match[1].toLowerCase().replace(/\s+/g, " ").trim());

  const nonOwnershipControls = controlMatches.filter(
    (statement) => statement !== "begin" && statement !== "commit",
  );
  if (nonOwnershipControls.length > 0) {
    return "transaction_ownership_shape";
  }

  if (controlMatches.length !== 2) {
    return "transaction_ownership_shape";
  }
  if (!/^begin$/.test(controlMatches[0]) || !/^commit$/.test(controlMatches[1])) {
    return "transaction_ownership_shape";
  }
  return null;
}

/**
 * Validate exact Git-blob-compatible bytes for the single pinned file and
 * return its checked content so the apply step never re-reads a potentially
 * changed copy from disk.
 */
export function validatePinnedBreedingMigration({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  const migration = PINNED_BREEDING_MIGRATION;
  const path = resolve(root, migration.file);
  const raw = readFile(path);
  const text = raw.toString("utf8");
  const observedHash = sha256(raw);

  if (observedHash !== migration.sha256) {
    throw new Error(`hash_mismatch:${migration.version}`);
  }
  if (text.includes("\r")) {
    throw new Error(`crlf_not_allowed:${migration.version}`);
  }
  if (!text.endsWith("\n")) {
    throw new Error(`final_newline_missing:${migration.version}`);
  }

  const unsafeReason = findBreedingUnsafeSqlReason(text);
  if (unsafeReason) {
    throw new Error(`${unsafeReason}:${migration.version}`);
  }

  return Object.freeze({ ...migration, path, text });
}

/** Extract the pinned RPC body for exact prosrc comparison after apply. */
export function extractBreedingRpcBody(text) {
  const marker = "CREATE FUNCTION public.breeding_log_save_event(";
  const start = text.indexOf(marker);
  if (start < 0 || text.indexOf(marker, start + marker.length) >= 0) {
    throw new Error("canonical_rpc_marker");
  }
  const bodyMarker = "AS $function$";
  const bodyStartMarker = text.indexOf(bodyMarker, start);
  if (bodyStartMarker < 0) {
    throw new Error("canonical_rpc_body_marker");
  }
  const bodyStart = bodyStartMarker + bodyMarker.length;
  const bodyEnd = text.indexOf("$function$;", bodyStart);
  if (bodyEnd < 0) {
    throw new Error("canonical_rpc_body_terminator");
  }
  return text.slice(bodyStart, bodyEnd);
}

const LEDGER_TARGET_ROWS = [
  ...REQUIRED_PRIOR_RECONCILIATION_ROWS,
  HISTORICAL_BREEDING_ROW,
  PINNED_BREEDING_MIGRATION,
]
  .map(({ version, name }) => `(${sqlLiteral(version)}, ${sqlLiteral(name)})`)
  .join(",");

export const PREFLIGHT_SQL = `
with expected(version, name) as (
  values ${LEDGER_TARGET_ROWS}
),
targets as (
  select
    e.version,
    e.name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('version', sm.version, 'name', sm.name)
          order by sm.version
        )
        from supabase_migrations.schema_migrations sm
        where sm.version = e.version or sm.name = e.name
      ),
      '[]'::jsonb
    ) as matches
  from expected e
)
select jsonb_build_object(
  'current_user', current_user,
  'ledger_columns', (
    select jsonb_object_agg(column_name, data_type)
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name in ('version', 'name', 'statements')
  ),
  'targets', (
    select jsonb_agg(
      jsonb_build_object('version', version, 'name', name, 'matches', matches)
      order by version
    )
    from targets
  ),
  'contract', jsonb_build_object(
    'breeding_events_table', to_regclass('public.breeding_events') is not null,
    'rpc_function', to_regprocedure(${sqlLiteral(BREEDING_RPC_SIGNATURE)}) is not null,
    'owner_trigger', exists (
      select 1
      from pg_catalog.pg_trigger tg
      where tg.tgrelid = to_regclass('public.breeding_events')
        and tg.tgname = 'trg_validate_breeding_event_owner'
        and not tg.tgisinternal
    )
  ),
  'dependencies', jsonb_build_object(
    'grow_events', to_regclass('public.grow_events') is not null,
    'plants', to_regclass('public.plants') is not null,
    'tents', to_regclass('public.tents') is not null,
    'grows', to_regclass('public.grows') is not null,
    'quicklog_idempotency', to_regclass('public.quicklog_idempotency') is not null,
    'action_queue', to_regclass('public.action_queue') is not null
  )
)::text;
`;

function ledgerRowState(targets, expected) {
  const row = Array.isArray(targets)
    ? targets.find((candidate) => candidate?.version === expected.version)
    : null;
  if (!row || !Array.isArray(row.matches)) return "invalid";
  if (row.matches.length === 0) return "absent";
  if (
    row.matches.length === 1 &&
    row.matches[0]?.version === expected.version &&
    row.matches[0]?.name === expected.name
  ) {
    return "exact";
  }
  return "collision";
}

/**
 * Classify the production state for this lane.
 *
 *   blocked      — the three-file reconciliation is not recorded exactly.
 *   collision    — any pinned version/name matches a different ledger row.
 *   verify_only  — marker exact and contract fully present: zero writes.
 *   apply        — marker absent: run the pinned file (the migration itself
 *                  fail-closes any partial/noncanonical contract state before
 *                  changing persistent state, and documents the committed-
 *                  but-unrecorded state as a safe rerun input).
 *   invalid      — marker exact but the contract is not fully present, or
 *                  the preflight payload is malformed.
 */
export function classifyBreedingState(preflight) {
  const targets = preflight?.targets;
  if (!Array.isArray(targets)) return { status: "invalid", reason: "target_shape" };

  for (const prior of REQUIRED_PRIOR_RECONCILIATION_ROWS) {
    const state = ledgerRowState(targets, prior);
    if (state === "collision") {
      return { status: "collision", reason: `prior_collision:${prior.version}` };
    }
    if (state !== "exact") {
      return { status: "blocked", reason: `prior_reconciliation_missing:${prior.version}` };
    }
  }

  const historicalState = ledgerRowState(targets, HISTORICAL_BREEDING_ROW);
  if (historicalState === "collision" || historicalState === "invalid") {
    return { status: "collision", reason: "historical_marker_collision" };
  }

  const markerState = ledgerRowState(targets, PINNED_BREEDING_MIGRATION);
  if (markerState === "collision" || markerState === "invalid") {
    return { status: "collision", reason: "marker_collision" };
  }

  const contract = preflight?.contract;
  const contractStates = [
    contract?.breeding_events_table === true,
    contract?.rpc_function === true,
    contract?.owner_trigger === true,
  ];
  const contractComplete = contractStates.every(Boolean);

  if (markerState === "exact") {
    if (!contractComplete) {
      return { status: "invalid", reason: "marker_without_contract" };
    }
    return { status: "verify_only" };
  }
  return {
    status: "apply",
    contractState: contractComplete
      ? "complete_unrecorded"
      : contractStates.some(Boolean)
        ? "partial"
        : "absent",
  };
}

export function validatePreflight(preflight) {
  if (preflight?.current_user !== "postgres") {
    throw new Error("unexpected_database_role");
  }
  const columns = preflight?.ledger_columns;
  if (
    !columns ||
    columns.version !== "text" ||
    columns.name !== "text" ||
    columns.statements !== "ARRAY"
  ) {
    throw new Error("unexpected_ledger_shape");
  }
  const dependencies = preflight?.dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error("missing_dependencies");
  }
  for (const name of [
    "grow_events",
    "plants",
    "tents",
    "grows",
    "quicklog_idempotency",
    "action_queue",
  ]) {
    if (dependencies[name] !== true) throw new Error(`missing_dependency:${name}`);
  }
  return classifyBreedingState(preflight);
}

export const POSTFLIGHT_SQL = `
with expected(version, name) as (
  values ${LEDGER_TARGET_ROWS}
),
ledger as (
  select
    count(*) filter (where sm.version is not null) as exact_count,
    count(*) filter (
      where sm.version is null or sm.version <> e.version or coalesce(sm.name, '') <> e.name
    ) as mismatch_count,
    (
      select count(*)
      from expected collision_expected
      join supabase_migrations.schema_migrations collision
        on collision.version = collision_expected.version
        or collision.name = collision_expected.name
      where collision.version <> collision_expected.version
        or coalesce(collision.name, '') <> collision_expected.name
    ) as collision_count
  from expected e
  left join supabase_migrations.schema_migrations sm
    on sm.version = e.version and sm.name = e.name
),
rpc as (
  select
    p.prosecdef,
    pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
    coalesce(
      (
        select setting
        from unnest(p.proconfig) as setting
        where setting like 'search_path=%'
      ),
      ''
    ) as search_path_setting,
    p.prosrc,
    coalesce(
      (
        select jsonb_agg(
          format(
            '%s|%s',
            coalesce(pg_catalog.pg_get_userbyid(acl.grantee), 'PUBLIC'),
            acl.privilege_type
          )
          order by 1
        )
        from pg_catalog.aclexplode(p.proacl) acl
      ),
      '[]'::jsonb
    ) as acl_rows
  from pg_catalog.pg_proc p
  where p.oid = to_regprocedure(${sqlLiteral(BREEDING_RPC_SIGNATURE)})
),
table_facts as (
  select
    c.relrowsecurity,
    coalesce(
      (
        select jsonb_agg(
          format(
            '%s|%s|%s|%s|%s',
            pol.policyname,
            pol.permissive,
            pol.cmd,
            array_to_string(pol.roles, ','),
            regexp_replace(coalesce(pol.qual, ''), '\\s+', '', 'g')
          )
          order by pol.policyname
        )
        from pg_catalog.pg_policies pol
        where pol.schemaname = 'public' and pol.tablename = 'breeding_events'
      ),
      '[]'::jsonb
    ) as policy_shape,
    coalesce(
      (
        select jsonb_agg(
          format(
            '%s|%s',
            coalesce(pg_catalog.pg_get_userbyid(acl.grantee), 'PUBLIC'),
            acl.privilege_type
          )
          order by 1
        )
        from pg_catalog.aclexplode(c.relacl) acl
        where coalesce(pg_catalog.pg_get_userbyid(acl.grantee), 'PUBLIC')
          in ('authenticated', 'anon', 'PUBLIC')
      ),
      '[]'::jsonb
    ) as api_acl_rows,
    coalesce(
      (
        select jsonb_agg(i.relname order by i.relname)
        from pg_catalog.pg_index x
        join pg_catalog.pg_class i on i.oid = x.indexrelid
        where x.indrelid = c.oid
      ),
      '[]'::jsonb
    ) as index_names,
    exists (
      select 1
      from pg_catalog.pg_trigger tg
      where tg.tgrelid = c.oid
        and tg.tgname = 'trg_validate_breeding_event_owner'
        and not tg.tgisinternal
        and tg.tgenabled = 'O'
    ) as owner_trigger_enabled
  from pg_catalog.pg_class c
  where c.oid = to_regclass('public.breeding_events')
)
select jsonb_build_object(
  'ledger_exact_count', (select exact_count from ledger),
  'ledger_mismatch_count', (select mismatch_count from ledger),
  'ledger_collision_count', (select collision_count from ledger),
  'rpc_present', exists (select 1 from rpc),
  'rpc_security_definer', (select prosecdef from rpc),
  'rpc_owner', (select owner_name from rpc),
  'rpc_search_path', (select search_path_setting from rpc),
  'rpc_prosrc', (select prosrc from rpc),
  'rpc_acl_rows', (select acl_rows from rpc),
  'table_present', exists (select 1 from table_facts),
  'table_rls_enabled', (select relrowsecurity from table_facts),
  'table_policy_shape', (select policy_shape from table_facts),
  'table_api_acl_rows', (select api_acl_rows from table_facts),
  'table_index_names', (select index_names from table_facts),
  'owner_trigger_enabled', (select owner_trigger_enabled from table_facts)
)::text;
`;

export const EXPECTED_RPC_ACL_ROWS = Object.freeze([
  "authenticated|EXECUTE",
  "postgres|EXECUTE",
  "service_role|EXECUTE",
]);

export const EXPECTED_POLICY_SHAPE = Object.freeze([
  "Users view own breeding_events|PERMISSIVE|SELECT|authenticated|(auth.uid()=user_id)",
]);

export const EXPECTED_API_ACL_ROWS = Object.freeze(["authenticated|SELECT"]);

export const EXPECTED_INDEX_NAMES = Object.freeze([
  "breeding_events_pkey",
  "idx_breeding_events_donor",
  "idx_breeding_events_user",
]);

/**
 * Exact postconditions before the ledger marker may be recorded. The ledger
 * marker check itself is separate (validateMarkerRecorded) because the marker
 * is only inserted after these pass.
 */
export function validatePostflightContract({ after, expectedRpcBody }) {
  if (after?.rpc_present !== true) throw new Error("rpc_missing");
  if (after?.rpc_security_definer !== true) throw new Error("rpc_not_security_definer");
  if (after?.rpc_owner !== "postgres") throw new Error("rpc_owner_mismatch");
  const searchPath = String(after?.rpc_search_path ?? "");
  if (!/^search_path=(["']?public["']?),\s*(["']?pg_temp["']?)$/.test(searchPath)) {
    throw new Error("rpc_search_path_mismatch");
  }
  if (
    typeof expectedRpcBody !== "string" ||
    typeof after?.rpc_prosrc !== "string" ||
    sha256(Buffer.from(after.rpc_prosrc, "utf8")) !== sha256(Buffer.from(expectedRpcBody, "utf8"))
  ) {
    throw new Error("rpc_body_mismatch");
  }
  if (JSON.stringify(after?.rpc_acl_rows) !== JSON.stringify([...EXPECTED_RPC_ACL_ROWS])) {
    throw new Error("rpc_acl_mismatch");
  }
  if (after?.table_present !== true) throw new Error("table_missing");
  if (after?.table_rls_enabled !== true) throw new Error("table_rls_disabled");
  if (JSON.stringify(after?.table_policy_shape) !== JSON.stringify([...EXPECTED_POLICY_SHAPE])) {
    throw new Error("table_policy_mismatch");
  }
  if (JSON.stringify(after?.table_api_acl_rows) !== JSON.stringify([...EXPECTED_API_ACL_ROWS])) {
    throw new Error("table_api_acl_mismatch");
  }
  if (JSON.stringify(after?.table_index_names) !== JSON.stringify([...EXPECTED_INDEX_NAMES])) {
    throw new Error("table_index_mismatch");
  }
  if (after?.owner_trigger_enabled !== true) throw new Error("owner_trigger_missing");
  if (after?.ledger_collision_count !== 0) throw new Error("ledger_collision");
  if (after?.ledger_mismatch_count > 1) throw new Error("ledger_postcondition");
}

/** After the marker insert (or in verify-only mode) every pinned row is exact. */
export function validateMarkerRecorded(after) {
  if (
    after?.ledger_exact_count !== REQUIRED_PRIOR_RECONCILIATION_ROWS.length + 2 ||
    after?.ledger_mismatch_count !== 0 ||
    after?.ledger_collision_count !== 0
  ) {
    throw new Error("marker_postcondition");
  }
}

/**
 * Collision-guarded, idempotent marker insert. Runs in its own implicit
 * transaction (single psql -c) and is only issued after the migration's own
 * COMMIT and the exact contract postconditions.
 */
export const MARKER_SQL = `
set local lock_timeout = '4s';
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $marker$
declare
  v_collision integer;
begin
  select count(*)
    into v_collision
  from supabase_migrations.schema_migrations sm
  where (sm.version = ${sqlLiteral(PINNED_BREEDING_MIGRATION.version)}
     or sm.name = ${sqlLiteral(PINNED_BREEDING_MIGRATION.name)})
    and not (
      sm.version = ${sqlLiteral(PINNED_BREEDING_MIGRATION.version)}
      and sm.name = ${sqlLiteral(PINNED_BREEDING_MIGRATION.name)}
    );
  if v_collision <> 0 then
    raise exception using
      errcode = '55000',
      message = 'pinned breeding marker refused a ledger collision';
  end if;

  insert into supabase_migrations.schema_migrations (version, name, statements)
  select
    ${sqlLiteral(PINNED_BREEDING_MIGRATION.version)},
    ${sqlLiteral(PINNED_BREEDING_MIGRATION.name)},
    array[${sqlLiteral(
      `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_BREEDING_MIGRATION.sha256}`,
    )}]::text[]
  where not exists (
    select 1
    from supabase_migrations.schema_migrations sm
    where sm.version = ${sqlLiteral(PINNED_BREEDING_MIGRATION.version)}
      and sm.name = ${sqlLiteral(PINNED_BREEDING_MIGRATION.name)}
  );
end
$marker$;
`;

function compactError(error) {
  if (error instanceof SupabaseDatabaseTargetIdentityError) {
    return error.code;
  }
  return error instanceof Error ? error.name : "unknown_error";
}

function writeSafeFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  } catch {
    logger.error("Could not write a sanitized breeding-runner artifact.");
  }
}

function makeArtifactWriters({ reportPath, auditPath, now, logger }) {
  const writeReport = (status, lines) => {
    writeSafeFile(
      reportPath,
      [
        "### Pinned breeding reconciliation apply",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, query result rows, or raw database error is included.",
        "",
      ].join("\n"),
      logger,
    );
  };

  const writeAudit = (outcome, extra = {}) => {
    writeSafeFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-pinned-breeding-reconciliation",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome,
          migration_version: PINNED_BREEDING_MIGRATION.version,
          ...(extra.ledgerState ? { ledger_state: extra.ledgerState } : {}),
          ...(extra.contractState ? { contract_state: extra.contractState } : {}),
          ...(extra.note ? { note: extra.note } : {}),
        },
        null,
        2,
      )}\n`,
      logger,
    );
  };

  return { writeReport, writeAudit };
}

function buildPsqlEnvironment(sourceEnv, databaseUrl) {
  const childEnv = {};
  const pathValue = sourceEnv.PATH ?? sourceEnv.Path;
  if (typeof pathValue === "string") childEnv.PATH = pathValue;
  for (const key of [
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (typeof sourceEnv[key] === "string") childEnv[key] = sourceEnv[key];
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, "production");
  childEnv.PGDATABASE = connection.databaseUrl;
  childEnv.PGSSLMODE = connection.sslMode;
  return childEnv;
}

function runPsqlQuery({ sql, childEnv, spawnImpl }) {
  const result = spawnImpl("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.error?.code === "ENOENT") {
    return { ok: false, kind: "not_invocable" };
  }
  if (result.error || result.status !== 0) {
    return { ok: false, kind: "query_failed" };
  }
  const output = String(result.stdout ?? "").trim();
  try {
    return { ok: true, value: JSON.parse(output) };
  } catch {
    return { ok: false, kind: "invalid_json" };
  }
}

function runPsqlStatement({ sql, childEnv, spawnImpl }) {
  const result = spawnImpl("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.error?.code === "ENOENT") return { ok: false, kind: "not_invocable" };
  if (result.error || result.status !== 0) return { ok: false, kind: "statement_failed" };
  return { ok: true };
}

/**
 * Run the pinned file WITHOUT psql's single-transaction wrapper: the
 * migration owns its transaction (one top-level BEGIN … COMMIT), and its
 * post-commit `NOTIFY pgrst` must execute outside that transaction exactly
 * as authored.
 */
function runPsqlFile({ path, childEnv, spawnImpl }) {
  const result = spawnImpl("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--file", path], {
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
  });
  if (result.error?.code === "ENOENT") return { ok: false, kind: "not_invocable" };
  if (result.error || result.status !== 0) return { ok: false, kind: "apply_failed" };
  return { ok: true };
}

export function runPinnedBreedingReconciliation({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  now = () => new Date(),
  logger = console,
  reportPath = env.REPORT_PATH ?? null,
  auditPath = env.AUDIT_PATH ?? null,
} = {}) {
  const { writeReport, writeAudit } = makeArtifactWriters({ reportPath, auditPath, now, logger });

  if (env.TARGET_ENV !== "production") {
    logger.error("TARGET_ENV must be exactly 'production'.");
    writeReport("REFUSED - wrong target env", ["TARGET_ENV was not 'production'."]);
    writeAudit("input_rejected", { note: "target_env" });
    return EXIT.INPUT_REJECTED;
  }
  if (env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF) {
    logger.error("The production project confirmation did not match.");
    writeReport("REFUSED - project confirmation", ["confirm_project_ref did not match."]);
    writeAudit("input_rejected", { note: "confirm_project_ref" });
    return EXIT.INPUT_REJECTED;
  }
  if (env.CONFIRM_APPLY !== APPLY_CONFIRMATION) {
    logger.error("The apply confirmation phrase did not match.");
    writeReport("REFUSED - confirmation phrase", ["confirm_apply did not match."]);
    writeAudit("input_rejected", { note: "confirm_apply" });
    return EXIT.INPUT_REJECTED;
  }
  if (typeof env.SUPABASE_DB_URL !== "string" || env.SUPABASE_DB_URL.trim() === "") {
    logger.error("SUPABASE_DB_URL is required.");
    writeReport("REFUSED - missing database URL", ["SUPABASE_DB_URL was absent."]);
    writeAudit("no_database_url");
    return EXIT.NO_DATABASE_URL;
  }

  let validated;
  try {
    validated = validatePinnedBreedingMigration({ readFile });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "file_rejected";
    logger.error(`Pinned breeding migration file rejected: ${reason}`);
    writeReport("REFUSED - pinned file rejected", [`Reason code: ${reason}`]);
    writeAudit("file_rejected", { note: reason });
    return EXIT.FILE_REJECTED;
  }

  let expectedRpcBody;
  try {
    expectedRpcBody = extractBreedingRpcBody(validated.text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "canonical_rpc";
    logger.error(`Pinned breeding migration RPC extraction failed: ${reason}`);
    writeReport("REFUSED - pinned file rejected", [`Reason code: ${reason}`]);
    writeAudit("file_rejected", { note: reason });
    return EXIT.FILE_REJECTED;
  }

  let childEnv;
  try {
    childEnv = buildPsqlEnvironment(env, env.SUPABASE_DB_URL);
  } catch (error) {
    const code = compactError(error);
    logger.error(`The database target was rejected: ${code}`);
    writeReport("REFUSED - database target rejected", [`Reason code: ${code}`]);
    writeAudit("target_rejected", { note: code });
    return EXIT.TARGET_REJECTED;
  }

  const preflightResult = runPsqlQuery({ sql: PREFLIGHT_SQL, childEnv, spawnImpl });
  if (!preflightResult.ok) {
    const exitCode =
      preflightResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
    logger.error("The production preflight did not complete.");
    writeReport("FAILED - preflight unavailable", [`Reason code: ${preflightResult.kind}`]);
    writeAudit("preflight_failed", { note: preflightResult.kind });
    return exitCode;
  }

  let ledger;
  try {
    ledger = validatePreflight(preflightResult.value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "preflight_contract_failed";
    logger.error(`The production preflight contract failed: ${reason}`);
    writeReport("FAILED - preflight contract mismatch", [`Reason code: ${reason}`]);
    writeAudit("preflight_contract_failed", { note: reason });
    return EXIT.PREFLIGHT_FAILED;
  }

  if (ledger.status === "blocked" || ledger.status === "collision" || ledger.status === "invalid") {
    logger.error(`The migration ledger refused this dispatch: ${ledger.reason}`);
    writeReport("REFUSED - ledger state", [
      `Ledger status: ${ledger.status}`,
      `Reason code: ${ledger.reason}`,
    ]);
    writeAudit("ledger_drift", { ledgerState: ledger.status, note: ledger.reason });
    return EXIT.LEDGER_DRIFT;
  }

  if (ledger.status === "apply") {
    const applyResult = runPsqlFile({ path: validated.path, childEnv, spawnImpl });
    if (!applyResult.ok) {
      const exitCode =
        applyResult.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
      logger.error("The pinned breeding migration did not apply.");
      writeReport("FAILED - apply", [
        "The migration's own transaction rolled back; no partial state persists.",
        `Reason code: ${applyResult.kind}`,
      ]);
      writeAudit("apply_failed", {
        ledgerState: ledger.status,
        contractState: ledger.contractState,
        note: applyResult.kind,
      });
      return exitCode;
    }
  }

  const postflightResult = runPsqlQuery({ sql: POSTFLIGHT_SQL, childEnv, spawnImpl });
  if (!postflightResult.ok) {
    logger.error("The production postflight did not complete.");
    writeReport("FAILED - postflight unavailable", [`Reason code: ${postflightResult.kind}`]);
    writeAudit("postflight_failed", { ledgerState: ledger.status, note: postflightResult.kind });
    return EXIT.POSTFLIGHT_FAILED;
  }

  try {
    validatePostflightContract({ after: postflightResult.value, expectedRpcBody });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "postflight_contract_failed";
    logger.error(`The production postflight contract failed: ${reason}`);
    writeReport("FAILED - postflight contract mismatch", [
      `Reason code: ${reason}`,
      "The ledger marker was NOT recorded.",
    ]);
    writeAudit("postflight_contract_failed", { ledgerState: ledger.status, note: reason });
    return EXIT.POSTFLIGHT_FAILED;
  }

  if (ledger.status === "apply") {
    const markerResult = runPsqlStatement({ sql: MARKER_SQL, childEnv, spawnImpl });
    if (!markerResult.ok) {
      logger.error("The breeding ledger marker was not recorded.");
      writeReport("FAILED - ledger marker", [
        "The migration itself committed and verified; only the marker insert failed.",
        "Re-dispatching is safe: the runner detects the committed state and records the marker.",
        `Reason code: ${markerResult.kind}`,
      ]);
      writeAudit("marker_failed", {
        ledgerState: ledger.status,
        contractState: ledger.contractState,
        note: markerResult.kind,
      });
      return EXIT.MARKER_FAILED;
    }
  }

  const finalLedgerResult = runPsqlQuery({ sql: POSTFLIGHT_SQL, childEnv, spawnImpl });
  if (!finalLedgerResult.ok) {
    logger.error("The final ledger verification did not complete.");
    writeReport("FAILED - final ledger verification unavailable", [
      `Reason code: ${finalLedgerResult.kind}`,
    ]);
    writeAudit("postflight_failed", { ledgerState: ledger.status, note: finalLedgerResult.kind });
    return EXIT.POSTFLIGHT_FAILED;
  }
  try {
    validateMarkerRecorded(finalLedgerResult.value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "marker_postcondition";
    logger.error(`The final ledger verification failed: ${reason}`);
    writeReport("FAILED - final ledger verification", [`Reason code: ${reason}`]);
    writeAudit("postflight_contract_failed", { ledgerState: ledger.status, note: reason });
    return EXIT.POSTFLIGHT_FAILED;
  }

  const outcome = ledger.status === "verify_only" ? "already_applied_verified" : "applied_verified";
  const statusLine =
    ledger.status === "verify_only"
      ? "VERIFIED - already applied (zero writes performed)"
      : "APPLIED - migration committed, contract verified, marker recorded";
  logger.log(statusLine);
  writeReport(statusLine, [
    `Migration: ${PINNED_BREEDING_MIGRATION.file}`,
    `Pinned SHA-256: ${PINNED_BREEDING_MIGRATION.sha256}`,
    `Ledger state at dispatch: ${ledger.status}` +
      (ledger.contractState ? ` (contract: ${ledger.contractState})` : ""),
  ]);
  writeAudit(outcome, { ledgerState: ledger.status, contractState: ledger.contractState });
  return EXIT.OK;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = runPinnedBreedingReconciliation();
}
