#!/usr/bin/env node
/**
 * Dedicated fail-closed delivery path for the immutable Quick Log
 * corrections/retractions migration. This runner is intentionally not generic.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnsafeSqlReason } from "./apply-pinned-production-migrations.mjs";
import { buildPsqlEnvironment, writeTextFile } from "./lib/candidateNumberToolRuntime.mjs";
import { hardenProductionPsqlEnvironment } from "./lib/productionSupabaseTls.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  SUPABASE_DATABASE_TARGETS,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export { findUnsafeSqlReason };

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const APPLY_CONFIRMATION = "APPLY QUICKLOG CORRECTIONS RETRACTIONS";
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH =
  ".github/workflows/apply-quicklog-corrections-retractions.yml";
export const EXPECTED_TARGET_OBJECT_COUNT = 13;

export const PINNED_MIGRATION = Object.freeze({
  version: "20260811090000",
  name: "quicklog_corrections_retractions",
  file: "20260811090000_quicklog_corrections_retractions.sql",
  sha256: "9531CDCCB095F871FBF75145B828A73224210E31CC638A24B4019B20A8763105",
});

export const ACCEPTED_LEDGER_NAMES = Object.freeze([
  PINNED_MIGRATION.name,
  `${PINNED_MIGRATION.version}_${PINNED_MIGRATION.name}`,
]);

export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${PINNED_MIGRATION.sha256}`,
  "-- protected wrapper; schema-reload=pgrst;catalog-contract=v1",
]);

export const EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS = Object.freeze({
  quicklog_correct_entry: Object.freeze({
    md5: "ccd14f03c4077aa058679237953bc1b8",
    bytes: 11331,
    prosrcMd5: "bd7777aaefa3f1908d53f3ff9fc6e6ab",
    prosrcBytes: 11000,
  }),
  quicklog_retract_entry: Object.freeze({
    md5: "de52ed273fa257aa618a61aabd48a3a2",
    bytes: 5179,
    prosrcMd5: "df9384e775dd0cd046f327a2535be20d",
    prosrcBytes: 4865,
  }),
  quicklog_revision_rebase_captured_at: Object.freeze({
    md5: "43b94f3c36ac037b2116dae1b6ae429f",
    bytes: 1296,
    prosrcMd5: "9e48f9dbd4014846a05297b3694a15a1",
    prosrcBytes: 1036,
  }),
  quicklog_revision_resolve_root: Object.freeze({
    md5: "0d1be0509551fd4da0eed6c2817a9268",
    bytes: 3046,
    prosrcMd5: "1be115a0f65382b7b473361b0d204722",
    prosrcBytes: 2732,
  }),
  quicklog_revision_sibling_env_ids: Object.freeze({
    md5: "2e594282e9bad1b3f9c836e37a7ab0d3",
    bytes: 465,
    prosrcMd5: "7637252398fa7f000b876e6e706ce35e",
    prosrcBytes: 246,
  }),
});

export const EXPECTED_DEPENDENCY_FINGERPRINTS = Object.freeze({
  has_role: Object.freeze({ md5: "d1d3c1bab8cfb8d7aed032a1b9efa698", bytes: 300 }),
  quicklog_try_parse_uuid: Object.freeze({
    md5: "dcc96d9294238fa4284be2cecc855757",
    bytes: 479,
    prosrcMd5: "a34d120aad5c37a33ac05fd9597624f4",
    prosrcBytes: 289,
  }),
});

export const QUICKLOG_CATALOG_SEARCH_PATH_SQL = "pg_catalog, public";

export const QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL = `
  'authenticated_role_contract', coalesce((
    select not authenticated_role.rolsuper
      and not authenticated_role.rolinherit
      and not authenticated_role.rolcreaterole
      and not authenticated_role.rolcreatedb
      and not authenticated_role.rolcanlogin
      and not authenticated_role.rolreplication
      and not authenticated_role.rolbypassrls
    from pg_roles authenticated_role
    where authenticated_role.rolname='authenticated'
  ), false),
  'app_role_contract', exists (
    select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='app_role' and e.enumlabel='operator'
  ),
  'auth_uid_contract', coalesce((
    select p.prorettype='uuid'::regtype and p.pronargs=0 and p.prokind='f' and not p.proretset
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.oid=to_regprocedure('auth.uid()') and n.nspname='auth'
  ), false),
  'has_role_contract', coalesce((
    select md5(pg_get_functiondef(p.oid))='${EXPECTED_DEPENDENCY_FINGERPRINTS.has_role.md5}'
      and octet_length(pg_get_functiondef(p.oid))=${EXPECTED_DEPENDENCY_FINGERPRINTS.has_role.bytes}
      and p.prorettype='boolean'::regtype and p.provolatile='s' and p.prosecdef
      and p.prokind='f' and not p.proretset and language_row.lanname='sql'
      and p.proconfig=array['search_path=public, pg_temp']::text[]
      and owner_role.rolname='postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type) = array[
          'authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres','service_role|EXECUTE|f|postgres'
        ]::text[]
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        left join pg_roles grantee on grantee.oid=acl.grantee
        join pg_roles grantor on grantor.oid=acl.grantor
      ), false)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE')
    from pg_proc p
    join pg_roles owner_role on owner_role.oid=p.proowner
    join pg_language language_row on language_row.oid=p.prolang
    where p.oid=to_regprocedure('public.has_role(uuid,public.app_role)')
  ), false),
  'user_roles_contract', coalesce((
    select t.relkind='r' and t.relpersistence='p' and not t.relispartition
      and not t.relhassubclass
      and not exists (select 1 from pg_inherits i where i.inhparent=t.oid)
      and t.relrowsecurity and not t.relforcerowsecurity and owner_role.rolname='postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s|%s',p.polname,p.polcmd,p.polpermissive,roles.names,coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) order by p.polname) = array[
          'Operators manage roles|*|t|authenticated|has_role(auth.uid(), ''operator''::app_role)|has_role(auth.uid(), ''operator''::app_role)',
          'Users view own roles|r|t|authenticated|((auth.uid() = user_id) OR has_role(auth.uid(), ''operator''::app_role))|'
        ]::text[]
        from pg_policy p
        cross join lateral (select string_agg(r.rolname,',' order by r.rolname) names from unnest(p.polroles) role_oid join pg_roles r on r.oid=role_oid) roles
        where p.polrelid=t.oid
      ), false)
      and coalesce((
        select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type) = array[
          'authenticated|SELECT|f|postgres',
          'postgres|DELETE|f|postgres','postgres|INSERT|f|postgres','postgres|REFERENCES|f|postgres','postgres|SELECT|f|postgres','postgres|TRIGGER|f|postgres','postgres|TRUNCATE|f|postgres','postgres|UPDATE|f|postgres',
          'service_role|DELETE|f|postgres','service_role|INSERT|f|postgres','service_role|REFERENCES|f|postgres','service_role|SELECT|f|postgres','service_role|TRIGGER|f|postgres','service_role|TRUNCATE|f|postgres','service_role|UPDATE|f|postgres'
        ]::text[]
        from aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) acl
        left join pg_roles grantee on grantee.oid=acl.grantee
        join pg_roles grantor on grantor.oid=acl.grantor
      ), false)
      and not has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and has_table_privilege('authenticated',t.oid,'SELECT')
      and not has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    from pg_class t
    join pg_namespace n on n.oid=t.relnamespace
    join pg_roles owner_role on owner_role.oid=t.relowner
    where n.nspname='public' and t.relname='user_roles'
  ), false),
  'quicklog_try_parse_uuid_contract', coalesce((
    select md5(pg_get_functiondef(p.oid))='${EXPECTED_DEPENDENCY_FINGERPRINTS.quicklog_try_parse_uuid.md5}'
      and octet_length(pg_get_functiondef(p.oid))=${EXPECTED_DEPENDENCY_FINGERPRINTS.quicklog_try_parse_uuid.bytes}
      and md5(p.prosrc)='${EXPECTED_DEPENDENCY_FINGERPRINTS.quicklog_try_parse_uuid.prosrcMd5}'
      and octet_length(p.prosrc)=${EXPECTED_DEPENDENCY_FINGERPRINTS.quicklog_try_parse_uuid.prosrcBytes}
      and p.prorettype='uuid'::regtype and p.provolatile='i' and p.proisstrict and not p.prosecdef
      and p.prokind='f' and not p.proretset and language_row.lanname='plpgsql'
      and p.proconfig=array['search_path=pg_catalog, pg_temp']::text[]
      and owner_role.rolname='postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type) = array[
          'postgres|EXECUTE|f|postgres'
        ]::text[]
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        left join pg_roles grantee on grantee.oid=acl.grantee
        join pg_roles grantor on grantor.oid=acl.grantor
      ), false)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    from pg_proc p
    join pg_roles owner_role on owner_role.oid=p.proowner
    join pg_language language_row on language_row.oid=p.prolang
    where p.oid=to_regprocedure('public.quicklog_try_parse_uuid(text)')
  ), false),
  'gen_random_uuid_contract', coalesce((
    select p.prorettype='uuid'::regtype and p.pronargs=0 and p.prokind='f'
      and not p.proretset and not p.prosecdef
      and n.nspname='pg_catalog'
      and to_regprocedure('gen_random_uuid()')=p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.oid=to_regprocedure('pg_catalog.gen_random_uuid()')
  ), false)`;

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 1,
  NO_DATABASE_URL: 2,
  TARGET_REJECTED: 3,
  FILE_REJECTED: 4,
  PSQL_NOT_INVOCABLE: 5,
  PREFLIGHT_FAILED: 6,
  LEDGER_DRIFT: 7,
  SCHEMA_DRIFT: 8,
  APPLY_FAILED: 9,
  POSTFLIGHT_FAILED: 10,
  POSTFLIGHT_CONTRACT_FAILED: 11,
  DEPLOY_HEAD_ADVANCED: 12,
  RECEIPT_MISMATCH: 13,
  PREREQUISITE_DRIFT: 14,
  PARTIAL_TARGET_DRIFT: 15,
  TLS_TRUST_REJECTED: 16,
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "supabase", "migrations");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeSha(value) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{40}$/.test(text) ? text : null;
}

function safeDigest(value) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

function safePositiveIntegerText(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return text;
}

export function validatePinnedMigrationFile({
  root = migrationsRoot,
  readFile = readFileSync,
} = {}) {
  const path = resolve(root, PINNED_MIGRATION.file);
  const rawValue = readFile(path);
  const raw = Buffer.isBuffer(rawValue) ? rawValue : Buffer.from(rawValue);
  const text = raw.toString("utf8");
  if (sha256(raw) !== PINNED_MIGRATION.sha256) {
    throw new Error(`hash_mismatch:${PINNED_MIGRATION.version}`);
  }
  if (text.includes("\r")) throw new Error(`crlf_not_allowed:${PINNED_MIGRATION.version}`);
  if (!text.endsWith("\n")) {
    throw new Error(`final_newline_missing:${PINNED_MIGRATION.version}`);
  }
  const unsafeReason = findUnsafeSqlReason(text);
  if (unsafeReason) throw new Error(`${unsafeReason}:${PINNED_MIGRATION.version}`);
  return Object.freeze({ ...PINNED_MIGRATION, path, text });
}

function catalogBooleanConjunction(variableName, keys) {
  return keys
    .map((key) => `coalesce((${variableName} ->> '${key}')::boolean, false)`)
    .join("\n      and ");
}

function buildTransactionalCatalogGuard(phase) {
  const tag =
    phase === "preapply"
      ? "quicklog_delivery_prerequisite_guard"
      : "quicklog_delivery_catalog_guard";
  const lines = [
    `do $${tag}$`,
    "declare",
    "  v_state json;",
    "begin",
    "  execute $quicklog_catalog_query$",
    QUICKLOG_CATALOG_STATE_QUERY_SQL,
    "  $quicklog_catalog_query$ into v_state;",
    "  if not (",
    `      ${catalogBooleanConjunction("v_state", PREREQUISITE_KEYS)}`,
    "  ) then",
    "    raise exception using errcode = '55000', message = 'quicklog delivery refused prerequisite drift under lock';",
    "  end if;",
  ];

  if (phase === "preapply") {
    lines.push(
      "  if coalesce((v_state ->> 'ledger_exact_count')::integer, -1) <> 0",
      "     or coalesce((v_state ->> 'ledger_conflict_count')::integer, -1) <> 0",
      "     or coalesce((v_state ->> 'target_object_count')::integer, -1) <> 0 then",
      "    raise exception using errcode = '55000', message = 'quicklog delivery refused concurrent target drift';",
      "  end if;",
    );
  } else {
    lines.push(
      "  if coalesce((v_state ->> 'ledger_exact_count')::integer, -1) <> 0",
      "     or coalesce((v_state ->> 'ledger_conflict_count')::integer, -1) <> 0",
      `     or coalesce((v_state ->> 'target_object_count')::integer, -1) <> ${EXPECTED_TARGET_OBJECT_COUNT}`,
      "     or not coalesce((v_state ->> 'target_table_exists')::boolean, false)",
      "     or not coalesce((v_state ->> 'retracted_at_exists')::boolean, false)",
      "     or not (",
      `       ${catalogBooleanConjunction("v_state", EFFECT_KEYS)}`,
      "     ) then",
      "    raise exception using errcode = '55000', message = 'quicklog delivery refused noncanonical target catalog';",
      "  end if;",
    );
  }

  lines.push("end", `$${tag}$;`);
  return lines.join("\n");
}

export function buildApplySql(migration) {
  if (
    migration?.version !== PINNED_MIGRATION.version ||
    migration?.name !== PINNED_MIGRATION.name ||
    migration?.file !== PINNED_MIGRATION.file ||
    migration?.sha256 !== PINNED_MIGRATION.sha256 ||
    typeof migration?.text !== "string" ||
    sha256(Buffer.from(migration.text, "utf8")) !== PINNED_MIGRATION.sha256 ||
    findUnsafeSqlReason(migration.text)
  ) {
    throw new Error("validated_migration_required");
  }

  const markers = `array[${LEDGER_STATEMENT_MARKERS.map(sqlLiteral).join(", ")}]::text[]`;
  return [
    "\\set ON_ERROR_STOP on",
    "set transaction isolation level read committed;",
    "set local lock_timeout = '8s';",
    "set local statement_timeout = '120s';",
    "set local search_path = pg_catalog, public, pg_temp;",
    "lock table supabase_migrations.schema_migrations in share row exclusive mode;",
    "lock table public.user_roles in share row exclusive mode;",
    "lock table public.diary_entries in share row exclusive mode;",
    "lock table public.grow_events in share row exclusive mode;",
    "lock table public.grows in share row exclusive mode;",
    "lock table public.tents in share row exclusive mode;",
    "lock table public.plants in share row exclusive mode;",
    "",
    buildTransactionalCatalogGuard("preapply"),
    "",
    `-- BEGIN EXACT PINNED FILE: ${PINNED_MIGRATION.file}`,
    migration.text,
    `-- END EXACT PINNED FILE: ${PINNED_MIGRATION.file}`,
    "",
    "revoke all on function public.quicklog_revision_resolve_root(uuid, uuid, uuid) from public, anon, authenticated, service_role;",
    "revoke all on function public.quicklog_revision_sibling_env_ids(uuid, public.grow_events) from public, anon, authenticated, service_role;",
    "revoke all on function public.quicklog_revision_rebase_captured_at(jsonb, timestamptz, timestamptz) from public, anon, authenticated, service_role;",
    "revoke all on function public.quicklog_retract_entry(text, uuid, uuid, text) from public, anon, authenticated, service_role;",
    "revoke all on function public.quicklog_correct_entry(text, jsonb, uuid, uuid, text) from public, anon, authenticated, service_role;",
    "grant execute on function public.quicklog_retract_entry(text, uuid, uuid, text) to authenticated, service_role;",
    "grant execute on function public.quicklog_correct_entry(text, jsonb, uuid, uuid, text) to authenticated, service_role;",
    "",
    "revoke all on public.quicklog_entry_revisions from authenticated;",
    "grant select on public.quicklog_entry_revisions to authenticated;",
    "do $quicklog_delivery_acl_guard$",
    "begin",
    "  if not coalesce((",
    "    select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type) = array[",
    "      'authenticated|SELECT|f|postgres',",
    "      'postgres|DELETE|f|postgres','postgres|INSERT|f|postgres','postgres|REFERENCES|f|postgres','postgres|SELECT|f|postgres','postgres|TRIGGER|f|postgres','postgres|TRUNCATE|f|postgres','postgres|UPDATE|f|postgres',",
    "      'service_role|DELETE|f|postgres','service_role|INSERT|f|postgres','service_role|REFERENCES|f|postgres','service_role|SELECT|f|postgres','service_role|TRIGGER|f|postgres','service_role|TRUNCATE|f|postgres','service_role|UPDATE|f|postgres'",
    "    ]::text[]",
    "    from pg_class t join pg_namespace n on n.oid=t.relnamespace",
    "    cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) acl",
    "    left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor",
    "    where n.nspname='public' and t.relname='quicklog_entry_revisions'",
    "  ),false) then",
    "    raise exception using errcode = '55000', message = 'quicklog delivery refused noncanonical target acl';",
    "  end if;",
    "end",
    "$quicklog_delivery_acl_guard$;",
    "",
    buildTransactionalCatalogGuard("postapply"),
    "",
    "notify pgrst, 'reload schema';",
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    `values (${sqlLiteral(PINNED_MIGRATION.version)}, ${sqlLiteral(PINNED_MIGRATION.name)}, ${markers});`,
    "",
  ].join("\n");
}

const functionFingerprintValues = Object.entries(EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS)
  .map(
    ([name, value]) =>
      `('${name}', '${value.md5}', ${value.bytes}, '${value.prosrcMd5}', ${value.prosrcBytes})`,
  )
  .join(",\n      ");

export const QUICKLOG_TARGET_INDEXES_CONTRACT_EXPRESSION_SQL = `coalesce((
    select array_agg(format('%s|%s|%s|%s|%s',c.relname,i.indisvalid,i.indisready,i.indislive,pg_get_indexdef(i.indexrelid)) order by c.relname) = array[
      'quicklog_entry_revisions_pkey|t|t|t|CREATE UNIQUE INDEX quicklog_entry_revisions_pkey ON public.quicklog_entry_revisions USING btree (id)',
      'quicklog_entry_revisions_root_rev|t|t|t|CREATE UNIQUE INDEX quicklog_entry_revisions_root_rev ON public.quicklog_entry_revisions USING btree (root_id, revision_no)',
      'quicklog_entry_revisions_single_retraction|t|t|t|CREATE UNIQUE INDEX quicklog_entry_revisions_single_retraction ON public.quicklog_entry_revisions USING btree (root_id) WHERE (kind = ''retraction''::text)',
      'quicklog_entry_revisions_user|t|t|t|CREATE INDEX quicklog_entry_revisions_user ON public.quicklog_entry_revisions USING btree (user_id, created_at DESC)'
    ]::text[] from pg_index i join pg_class c on c.oid=i.indexrelid
    where i.indrelid=to_regclass('public.quicklog_entry_revisions')
  ),false)`;

export const QUICKLOG_DIARY_RETRACTED_INDEX_CONTRACT_EXPRESSION_SQL = `coalesce((
    select count(*)=1 and bool_and(
      i.indisvalid and i.indisready and i.indislive
      and pg_get_indexdef(i.indexrelid)='CREATE INDEX diary_entries_retracted ON public.diary_entries USING btree (user_id, retracted_at DESC) WHERE (retracted_at IS NOT NULL)'
    )
    from pg_index i join pg_class c on c.oid=i.indexrelid
    where i.indrelid=to_regclass('public.diary_entries') and c.relname='diary_entries_retracted'
  ),false)`;

export const QUICKLOG_TARGET_FUNCTION_SECURITY_CONTRACT_EXPRESSION_SQL = `coalesce((
    select count(*)=5 and bool_and(
      case
        when o.proname in ('quicklog_retract_entry','quicklog_correct_entry') then acl.entries = array[
          'authenticated|EXECUTE|f|postgres','postgres|EXECUTE|f|postgres','service_role|EXECUTE|f|postgres'
        ]::text[]
        else acl.entries = array['postgres|EXECUTE|f|postgres']::text[]
      end
      and not has_function_privilege('anon',o.oid,'EXECUTE')
      and case
        when o.proname in ('quicklog_retract_entry','quicklog_correct_entry') then
          has_function_privilege('authenticated',o.oid,'EXECUTE')
          and has_function_privilege('service_role',o.oid,'EXECUTE')
        else not has_function_privilege('authenticated',o.oid,'EXECUTE')
      end
    )
    from observed_functions o
    cross join lateral (
      select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),function_acl.privilege_type,function_acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),function_acl.privilege_type) entries
      from aclexplode(coalesce(o.proacl,acldefault('f',o.proowner))) function_acl
      left join pg_roles grantee on grantee.oid=function_acl.grantee
      join pg_roles grantor on grantor.oid=function_acl.grantor
    ) acl
  ),false)`;

export const QUICKLOG_CATALOG_STATE_QUERY_SQL = `with target_ledger as (
  select sm.version, sm.name, sm.statements
  from supabase_migrations.schema_migrations sm
  where sm.version = '${PINNED_MIGRATION.version}'
     or sm.name = '${ACCEPTED_LEDGER_NAMES[0]}'
     or sm.name = '${ACCEPTED_LEDGER_NAMES[1]}'
), migration_schema as (
  select n.* from pg_namespace n where n.nspname = 'supabase_migrations'
), migration_ledger as (
  select c.* from pg_class c join migration_schema n on n.oid = c.relnamespace
  where c.relname = 'schema_migrations'
), target as (
  select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'quicklog_entry_revisions'
), diary as (
  select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'diary_entries'
), expected_functions(name, definition_md5, definition_bytes, prosrc_md5, prosrc_bytes) as (
  values
      ${functionFingerprintValues}
), observed_functions as (
  select p.*, n.nspname, r.rolname as owner_name, l.lanname,
         md5(pg_get_functiondef(p.oid)) as definition_md5,
         octet_length(pg_get_functiondef(p.oid)) as definition_bytes,
         md5(p.prosrc) as prosrc_md5,
         octet_length(p.prosrc) as prosrc_bytes
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r on r.oid = p.proowner
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
    and p.proname in (
      'quicklog_revision_resolve_root', 'quicklog_revision_sibling_env_ids',
      'quicklog_revision_rebase_captured_at', 'quicklog_retract_entry',
      'quicklog_correct_entry'
    )
), exact_ledger as (
  select * from target_ledger
  where version = '${PINNED_MIGRATION.version}'
    and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
)
select json_build_object(
  'ledger_exact_count', (select count(*)::integer from exact_ledger),
  'ledger_conflict_count', (
    select (count(*) - count(*) filter (
      where version = '${PINNED_MIGRATION.version}'
        and name in ('${ACCEPTED_LEDGER_NAMES[0]}', '${ACCEPTED_LEDGER_NAMES[1]}')
    ))::integer from target_ledger
  ),
  'ledger_exact_names', coalesce((select json_agg(name order by name) from exact_ledger), '[]'::json),
  'ledger_statements_contract', coalesce((
    select count(*) = 1 and bool_and(statements = array[
      '${LEDGER_STATEMENT_MARKERS[0]}', '${LEDGER_STATEMENT_MARKERS[1]}'
    ]::text[]) from exact_ledger
  ), false),
  'migration_ledger_contract', coalesce((
    select ledger.relkind = 'r' and ledger.relpersistence = 'p'
      and not ledger.relispartition and not ledger.relrowsecurity
      and not ledger.relforcerowsecurity and owner_role.rolname = current_user
      and current_user = 'postgres'
      and has_schema_privilege(current_user, ledger.relnamespace, 'USAGE,CREATE')
      and has_table_privilege(current_user, ledger.oid, 'SELECT,INSERT,UPDATE')
      and coalesce((
        select array_agg(format('%s|%s|%s|%s', a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, coalesce(pg_get_expr(d.adbin,d.adrelid),'')) order by a.attnum)
          = array['version|text|t|','name|text|f|','statements|text[]|f|']::text[]
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=ledger.oid and a.attnum>0 and not a.attisdropped
      ), false)
      and coalesce((select count(*)=1 and bool_and(conname='schema_migrations_pkey' and contype='p' and convalidated and pg_get_constraintdef(oid,true)='PRIMARY KEY (version)') from pg_constraint where conrelid=ledger.oid), false)
      and not exists (select 1 from pg_trigger where tgrelid=ledger.oid and not tgisinternal)
      and not exists (select 1 from pg_rewrite where ev_class=ledger.oid)
    from migration_ledger ledger join pg_roles owner_role on owner_role.oid=ledger.relowner
  ), false),
  'current_user_contract', current_user = 'postgres',
  'roles_contract', (select count(*)=3 from pg_roles where rolname in ('anon','authenticated','service_role')),
${QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL},
  'grow_events_contract', coalesce((
    select c.relkind='r' and c.relpersistence='p' and not c.relispartition and r.rolname='postgres'
      and not exists (
        select 1 from (values
          ('id','uuid'),('user_id','uuid'),('source','text'),('event_type','text'),
          ('created_at','timestamp with time zone'),('is_deleted','boolean'),
          ('deleted_at','timestamp with time zone'),('note','text'),
          ('occurred_at','timestamp with time zone'),('grow_id','uuid'),
          ('tent_id','uuid'),('plant_id','uuid')
        ) expected(name,type_name)
        where not exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname=expected.name and format_type(a.atttypid,a.atttypmod)=expected.type_name and a.attnum>0 and not a.attisdropped)
      )
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
    where n.nspname='public' and c.relname='grow_events'
  ), false),
  'diary_entries_contract', coalesce((
    select c.relkind='r' and c.relpersistence='p' and not c.relispartition and r.rolname='postgres'
      and not exists (
        select 1 from (values ('id','uuid'),('user_id','uuid'),('details','jsonb'),('note','text'),('entry_at','timestamp with time zone'),('grow_id','uuid'),('tent_id','uuid'),('plant_id','uuid')) expected(name,type_name)
        where not exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname=expected.name and format_type(a.atttypid,a.atttypmod)=expected.type_name and a.attnum>0 and not a.attisdropped)
      )
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
    where n.nspname='public' and c.relname='diary_entries'
  ), false),
  'grows_contract', coalesce((
    select c.relkind='r' and c.relpersistence='p' and r.rolname='postgres'
      and exists(select 1 from pg_attribute where attrelid=c.oid and attname='id' and atttypid='uuid'::regtype and attnum>0 and not attisdropped)
      and exists(select 1 from pg_attribute where attrelid=c.oid and attname='user_id' and atttypid='uuid'::regtype and attnum>0 and not attisdropped)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='public' and c.relname='grows'
  ), false),
  'tents_contract', coalesce((
    select c.relkind='r' and c.relpersistence='p' and r.rolname='postgres'
      and not exists (select 1 from (values ('id'),('user_id'),('grow_id')) expected(name) where not exists(select 1 from pg_attribute where attrelid=c.oid and attname=expected.name and atttypid='uuid'::regtype and attnum>0 and not attisdropped))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='public' and c.relname='tents'
  ), false),
  'plants_contract', coalesce((
    select c.relkind='r' and c.relpersistence='p' and r.rolname='postgres'
      and not exists (select 1 from (values ('id'),('user_id'),('grow_id'),('tent_id')) expected(name) where not exists(select 1 from pg_attribute where attrelid=c.oid and attname=expected.name and atttypid='uuid'::regtype and attnum>0 and not attisdropped))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='public' and c.relname='plants'
  ), false),
  'referenced_keys_contract',
    coalesce((select count(*)>0 from pg_constraint where conrelid=to_regclass('public.grow_events') and contype in ('p','u') and convalidated and conkey=array[(select attnum from pg_attribute where attrelid=to_regclass('public.grow_events') and attname='id') ]::smallint[]),false)
    and coalesce((select count(*)>0 from pg_constraint where conrelid=to_regclass('public.diary_entries') and contype in ('p','u') and convalidated and conkey=array[(select attnum from pg_attribute where attrelid=to_regclass('public.diary_entries') and attname='id') ]::smallint[]),false),
  'apply_privileges_contract',
    has_schema_privilege(current_user,'public','USAGE,CREATE')
    and has_table_privilege(current_user,'public.diary_entries','SELECT,UPDATE')
    and has_table_privilege(current_user,'public.grow_events','SELECT,UPDATE')
    and has_table_privilege(current_user,'public.grows','SELECT')
    and has_table_privilege(current_user,'public.tents','SELECT')
    and has_table_privilege(current_user,'public.plants','SELECT'),
  'target_object_count', (
    (case when to_regclass('public.quicklog_entry_revisions') is null then 0 else 1 end)
    + (select count(*) from pg_attribute a where a.attrelid=to_regclass('public.diary_entries') and a.attname='retracted_at' and a.attnum>0 and not a.attisdropped)
    + (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('quicklog_entry_revisions_root_rev','quicklog_entry_revisions_single_retraction','quicklog_entry_revisions_user','diary_entries_retracted'))
    + (select count(*) from observed_functions)
    + (select count(*) from pg_policy where polrelid=to_regclass('public.quicklog_entry_revisions'))
  )::integer,
  'target_table_exists', to_regclass('public.quicklog_entry_revisions') is not null,
  'retracted_at_exists', exists(select 1 from pg_attribute where attrelid=to_regclass('public.diary_entries') and attname='retracted_at' and attnum>0 and not attisdropped),
  'target_table_contract', coalesce((
    select t.relkind='r' and t.relpersistence='p' and not t.relispartition
      and not t.relhassubclass
      and not exists (select 1 from pg_inherits i where i.inhparent=t.oid)
      and t.relrowsecurity and not t.relforcerowsecurity and r.rolname='postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s',a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attnum) order by a.attnum) = array[
          'id|uuid|t|gen_random_uuid()|1','grow_event_id|uuid|f||2','diary_entry_id|uuid|f||3',
          'root_id|uuid|t||4','user_id|uuid|t||5','actor_id|uuid|t||6',
          'revision_no|integer|t||7','kind|text|t||8','reason_code|text|t||9',
          'reason_note|text|f||10','previous_state|jsonb|t|''{}''::jsonb|11',
          'new_state|jsonb|f||12','created_at|timestamp with time zone|t|now()|13'
        ]::text[]
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
      ),false)
    from target t join pg_roles r on r.oid=t.relowner
  ),false),
  'retracted_at_contract', coalesce((
    select format_type(a.atttypid,a.atttypmod)='timestamp with time zone' and not a.attnotnull and d.oid is null
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=to_regclass('public.diary_entries') and a.attname='retracted_at' and a.attnum>0 and not a.attisdropped
  ),false),
  'target_constraints_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s|%s|%s',conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid,true)) order by conname) = array[
      'quicklog_entry_revisions_diary_entry_id_fkey|f|t|f|f|FOREIGN KEY (diary_entry_id) REFERENCES diary_entries(id) ON DELETE SET NULL',
      'quicklog_entry_revisions_grow_event_id_fkey|f|t|f|f|FOREIGN KEY (grow_event_id) REFERENCES grow_events(id) ON DELETE SET NULL',
      'quicklog_entry_revisions_kind_check|c|t|f|f|CHECK (kind = ANY (ARRAY[''correction''::text, ''retraction''::text]))',
      'quicklog_entry_revisions_pkey|p|t|f|f|PRIMARY KEY (id)',
      'quicklog_entry_revisions_reason_code_check|c|t|f|f|CHECK (reason_code = ANY (ARRAY[''wrong_plant''::text, ''wrong_tent''::text, ''wrong_time''::text, ''typo''::text, ''wrong_value''::text, ''duplicate''::text, ''test_entry''::text, ''accidental''::text, ''other''::text]))',
      'quicklog_entry_revisions_reason_note_check|c|t|f|f|CHECK (reason_note IS NULL OR char_length(reason_note) <= 500)',
      'quicklog_entry_revisions_revision_no_check|c|t|f|f|CHECK (revision_no >= 1)'
    ]::text[] from pg_constraint where conrelid=to_regclass('public.quicklog_entry_revisions')
  ),false),
  'target_indexes_contract', ${QUICKLOG_TARGET_INDEXES_CONTRACT_EXPRESSION_SQL},
  'diary_retracted_index_contract', ${QUICKLOG_DIARY_RETRACTED_INDEX_CONTRACT_EXPRESSION_SQL},
  'target_policies_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s|%s|%s',p.polname,p.polcmd,p.polpermissive,roles.names,coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) order by p.polname) = array[
      'Operators view all quicklog revisions|r|t|authenticated|has_role(auth.uid(), ''operator''::app_role)|',
      'Users view own quicklog revisions|r|t|authenticated|(auth.uid() = user_id)|'
    ]::text[]
    from pg_policy p
    cross join lateral (select string_agg(r.rolname,',' order by r.rolname) names from unnest(p.polroles) role_oid join pg_roles r on r.oid=role_oid) roles
    where p.polrelid=to_regclass('public.quicklog_entry_revisions')
  ),false),
  'target_triggers_rules_contract',
    exists(select 1 from target)
    and not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.quicklog_entry_revisions') and not tgisinternal)
    and not exists(select 1 from pg_rewrite where ev_class=to_regclass('public.quicklog_entry_revisions')),
  'target_functions_contract', coalesce((
    select count(*)=5 and bool_and(
      o.definition_md5=e.definition_md5 and o.definition_bytes=e.definition_bytes
      and o.prosrc_md5=e.prosrc_md5 and o.prosrc_bytes=e.prosrc_bytes
      and o.owner_name='postgres' and o.proconfig=array['search_path=public, pg_temp']::text[]
      and case e.name
        when 'quicklog_revision_sibling_env_ids' then o.lanname='sql' and o.provolatile='s' and o.prosecdef
        when 'quicklog_revision_rebase_captured_at' then o.lanname='plpgsql' and o.provolatile='i' and not o.prosecdef
        else o.lanname='plpgsql' and o.provolatile='v' and o.prosecdef
      end
    ) from expected_functions e join observed_functions o on o.proname=e.name
  ),false),
  'target_function_overloads_contract', (select count(*)=5 from observed_functions)
    and to_regprocedure('public.quicklog_revision_resolve_root(uuid,uuid,uuid)') is not null
    and to_regprocedure('public.quicklog_revision_sibling_env_ids(uuid,public.grow_events)') is not null
    and to_regprocedure('public.quicklog_revision_rebase_captured_at(jsonb,timestamptz,timestamptz)') is not null
    and to_regprocedure('public.quicklog_retract_entry(text,uuid,uuid,text)') is not null
    and to_regprocedure('public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)') is not null,
  'target_function_security_contract', ${QUICKLOG_TARGET_FUNCTION_SECURITY_CONTRACT_EXPRESSION_SQL},
  'target_acl_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s',coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable,grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'),acl.privilege_type) = array[
      'authenticated|SELECT|f|postgres',
      'postgres|DELETE|f|postgres','postgres|INSERT|f|postgres','postgres|REFERENCES|f|postgres','postgres|SELECT|f|postgres','postgres|TRIGGER|f|postgres','postgres|TRUNCATE|f|postgres','postgres|UPDATE|f|postgres',
      'service_role|DELETE|f|postgres','service_role|INSERT|f|postgres','service_role|REFERENCES|f|postgres','service_role|SELECT|f|postgres','service_role|TRIGGER|f|postgres','service_role|TRUNCATE|f|postgres','service_role|UPDATE|f|postgres'
    ]::text[]
    from target t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) acl
    left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor
  ),false),
  'client_access_contract', coalesce((
    select not has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and has_table_privilege('authenticated',t.oid,'SELECT')
      and not has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    from target t
  ),false)
)`;

/** One transaction-enforced read-only row. No database content rows are returned. */
export const PREFLIGHT_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
set local search_path = ${QUICKLOG_CATALOG_SEARCH_PATH_SQL};
${QUICKLOG_CATALOG_STATE_QUERY_SQL}::text;
`;

const PREREQUISITE_KEYS = Object.freeze([
  "migration_ledger_contract",
  "current_user_contract",
  "roles_contract",
  "authenticated_role_contract",
  "app_role_contract",
  "auth_uid_contract",
  "has_role_contract",
  "user_roles_contract",
  "quicklog_try_parse_uuid_contract",
  "gen_random_uuid_contract",
  "grow_events_contract",
  "diary_entries_contract",
  "grows_contract",
  "tents_contract",
  "plants_contract",
  "referenced_keys_contract",
  "apply_privileges_contract",
]);

const EFFECT_KEYS = Object.freeze([
  "target_table_contract",
  "retracted_at_contract",
  "target_constraints_contract",
  "target_indexes_contract",
  "diary_retracted_index_contract",
  "target_policies_contract",
  "target_triggers_rules_contract",
  "target_functions_contract",
  "target_function_overloads_contract",
  "target_function_security_contract",
  "target_acl_contract",
  "client_access_contract",
]);

const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  ...PREREQUISITE_KEYS,
  "target_object_count",
  "target_table_exists",
  "retracted_at_exists",
  ...EFFECT_KEYS,
]);

const BOOLEAN_KEYS = Object.freeze([
  "ledger_statements_contract",
  ...PREREQUISITE_KEYS,
  "target_table_exists",
  "retracted_at_exists",
  ...EFFECT_KEYS,
]);

export function parsePreflightStdout(stdout) {
  const lines = String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error(`preflight_row_count:${lines.length}`);
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("preflight_result_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("preflight_result_shape");
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...RESULT_KEYS].sort())) {
    throw new Error("preflight_result_shape");
  }
  for (const key of ["ledger_exact_count", "ledger_conflict_count", "target_object_count"]) {
    if (!Number.isInteger(value[key]) || value[key] < 0) throw new Error("preflight_result_shape");
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] !== "boolean") throw new Error("preflight_result_shape");
  }
  if (
    !Array.isArray(value.ledger_exact_names) ||
    value.ledger_exact_names.length !== value.ledger_exact_count ||
    value.ledger_exact_names.some((name) => !ACCEPTED_LEDGER_NAMES.includes(name)) ||
    new Set(value.ledger_exact_names).size !== value.ledger_exact_names.length
  ) {
    throw new Error("preflight_result_shape");
  }
  return Object.freeze({
    ...value,
    ledger_exact_names: Object.freeze([...value.ledger_exact_names]),
  });
}

export function prerequisitesLive(result) {
  return PREREQUISITE_KEYS.every((key) => result?.[key] === true);
}

export function schemaEffectLive(result) {
  return (
    prerequisitesLive(result) &&
    result?.ledger_statements_contract === true &&
    result?.target_object_count === EXPECTED_TARGET_OBJECT_COUNT &&
    result?.target_table_exists === true &&
    result?.retracted_at_exists === true &&
    EFFECT_KEYS.every((key) => result?.[key] === true)
  );
}

export function classifyPreflight(result) {
  if (!result || typeof result !== "object") return { status: "invalid", reason: "result_missing" };
  if (result.ledger_conflict_count !== 0 || result.ledger_exact_count > 1) {
    return { status: "ledger_drift", reason: "target_collision" };
  }
  const missingPrerequisite = PREREQUISITE_KEYS.find((key) => result[key] !== true);
  if (missingPrerequisite) {
    return { status: "prerequisite_drift", reason: missingPrerequisite };
  }
  if (result.ledger_exact_count === 0 && result.target_object_count !== 0) {
    return { status: "partial_target_drift", reason: "target_objects_present" };
  }
  if (result.ledger_exact_count === 0) return { status: "apply" };
  if (result.ledger_exact_count !== 1) return { status: "invalid", reason: "ledger_shape" };
  if (!schemaEffectLive(result)) {
    return { status: "schema_drift", reason: "recorded_effect_mismatch" };
  }
  return { status: "verify_only" };
}

export function buildPreflightReceipt({ state, headSha }) {
  const safeHeadSha = safeSha(headSha);
  if (!safeHeadSha) throw new Error("receipt_head_sha_rejected");
  const canonicalState = Object.fromEntries(RESULT_KEYS.map((key) => [key, state?.[key]]));
  const payload = {
    receipt_schema_version: 1,
    tool: "apply-quicklog-corrections-retractions",
    project_ref: PRODUCTION_PROJECT_REF,
    head_sha: safeHeadSha,
    migration_version: PINNED_MIGRATION.version,
    migration_name: PINNED_MIGRATION.name,
    migration_file: PINNED_MIGRATION.file,
    migration_sha256: PINNED_MIGRATION.sha256,
    state: canonicalState,
  };
  const digest = sha256(Buffer.from(JSON.stringify(payload), "utf8")).toLowerCase();
  return Object.freeze({
    project_ref: payload.project_ref,
    head_sha: payload.head_sha,
    migration_version: payload.migration_version,
    migration_sha256: payload.migration_sha256,
    receipt_id: `quicklog-corrections-retractions-preflight:${digest}`,
    digest,
  });
}

const AUDIT_STATES = new Set([
  "apply",
  "verify_only",
  "ledger_drift",
  "schema_drift",
  "prerequisite_drift",
  "partial_target_drift",
  "invalid",
]);
const AUDIT_REASONS = new Set([
  "input_rejected",
  "database_secret_missing",
  "target_identity_rejected",
  "tls_trust_rejected",
  "file_validation_rejected",
  "psql_not_invocable",
  "query_failed",
  "preflight_result_rejected",
  "target_collision",
  "recorded_effect_mismatch",
  "target_objects_present",
  "receipt_mismatch",
  "deploy_head_advanced",
  "apply_failed",
  "postflight_failed",
  "postflight_result_rejected",
  "postflight_contract_failed",
  ...PREREQUISITE_KEYS,
]);

export function sanitizeAuditExtras(extra = {}) {
  const safe = {};
  if (extra.operation === "PREFLIGHT" || extra.operation === "APPLY")
    safe.operation = extra.operation;
  if (typeof extra.safe_to_apply === "boolean") safe.safe_to_apply = extra.safe_to_apply;
  const digest = safeDigest(extra.receipt_digest);
  if (digest) safe.receipt_digest = digest;
  if (AUDIT_STATES.has(extra.ledger_state)) safe.ledger_state = extra.ledger_state;
  if (typeof extra.schema_effect_live === "boolean")
    safe.schema_effect_live = extra.schema_effect_live;
  if (typeof extra.prerequisites_live === "boolean")
    safe.prerequisites_live = extra.prerequisites_live;
  if (AUDIT_REASONS.has(extra.reason_code)) safe.reason_code = extra.reason_code;
  return safe;
}

function runReadOnlyQuery({ childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl(
      "psql",
      [
        "-X",
        "-q",
        "-A",
        "-t",
        "-v",
        "ON_ERROR_STOP=1",
        "--single-transaction",
        "-c",
        PREFLIGHT_SQL,
      ],
      { encoding: "utf8", env: childEnv },
    );
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  if (result?.status !== 0) return { ok: false, kind: "query_failed" };
  return { ok: true, stdout: result.stdout };
}

function runApplyFile({ path, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl(
      "psql",
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--file", path],
      { encoding: "utf8", env: childEnv },
    );
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  if (result?.status !== 0) return { ok: false, kind: "apply_failed" };
  return { ok: true };
}

function makeArtifactWriters({ reportPath, auditPath, receiptPath, now, logger }) {
  const writeReport = (status, lines) =>
    writeTextFile(
      reportPath,
      [
        "### Quick Log corrections/retractions delivery",
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
        "No connection string, password, database row, raw query output, or raw database error is included.",
        "",
      ].join("\n"),
      logger,
      "Quick Log delivery report",
    );
  const writeAudit = (outcome, base, extra = {}) =>
    writeTextFile(
      auditPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-quicklog-corrections-retractions",
          target_env: "production",
          project_ref: PRODUCTION_PROJECT_REF,
          checked_at: now().toISOString(),
          outcome,
          migration_version: PINNED_MIGRATION.version,
          migration_name: PINNED_MIGRATION.name,
          migration_sha256: PINNED_MIGRATION.sha256,
          expected_head_sha: safeSha(base.expectedHeadSha),
          observed_head_sha: safeSha(base.observedHeadSha),
          repository: base.repository,
          repository_id: base.repositoryId,
          workflow_path: EXPECTED_WORKFLOW_PATH,
          run_id: base.runId,
          run_attempt: base.runAttempt,
          ...sanitizeAuditExtras({ operation: base.operation, ...extra }),
        },
        null,
        2,
      )}\n`,
      logger,
      "Quick Log delivery audit",
    );
  const writeReceipt = (stateDigest, base) =>
    writeTextFile(
      receiptPath,
      `${JSON.stringify(
        {
          schema_version: 1,
          tool: "apply-quicklog-corrections-retractions",
          operation: "PREFLIGHT",
          outcome: "safe_to_apply",
          safe_to_apply: true,
          repository: base.repository,
          repository_id: base.repositoryId,
          workflow_path: EXPECTED_WORKFLOW_PATH,
          run_id: base.runId,
          run_attempt: base.runAttempt,
          event: base.event,
          branch: base.branch,
          head_sha: base.expectedHeadSha,
          project_ref: PRODUCTION_PROJECT_REF,
          migration_version: PINNED_MIGRATION.version,
          migration_name: PINNED_MIGRATION.name,
          migration_sha256: PINNED_MIGRATION.sha256,
          state_digest: stateDigest,
        },
        null,
        2,
      )}\n`,
      logger,
      "Quick Log PREFLIGHT receipt",
    );
  return { writeReport, writeAudit, writeReceipt };
}

export function runQuickLogCorrectionsRetractionsDelivery({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const operation = String(env.OPERATION ?? "").trim();
  const expectedHeadSha = String(env.EXPECTED_HEAD_SHA ?? "").trim();
  const observedHeadSha = String(env.GITHUB_SHA ?? "").trim();
  const currentDeployHeadSha = String(env.CURRENT_DEPLOY_HEAD_SHA ?? "").trim();
  const reviewedReceiptDigest = safeDigest(env.PREFLIGHT_RECEIPT_DIGEST);
  const repository = env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY ? EXPECTED_REPOSITORY : null;
  const repositoryId = safePositiveIntegerText(env.GITHUB_REPOSITORY_ID);
  const runId = safePositiveIntegerText(env.GITHUB_RUN_ID);
  const runAttemptText = safePositiveIntegerText(env.GITHUB_RUN_ATTEMPT);
  const runAttempt = runAttemptText === null ? null : Number(runAttemptText);
  const expectedWorkflowRef = `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/heads/verdant-grow-diary`;
  const base = {
    operation,
    expectedHeadSha,
    observedHeadSha,
    repository,
    repositoryId,
    runId,
    runAttempt,
    event: env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "workflow_dispatch" : null,
    branch: env.GITHUB_REF_NAME === "verdant-grow-diary" ? "verdant-grow-diary" : null,
  };
  const { writeReport, writeAudit, writeReceipt } = makeArtifactWriters({
    reportPath: env.REPORT_PATH ?? "",
    auditPath: env.AUDIT_PATH ?? "",
    receiptPath: env.PREFLIGHT_RECEIPT_PATH ?? "",
    now,
    logger,
  });

  if (
    !["PREFLIGHT", "APPLY"].includes(operation) ||
    env.TARGET_ENV !== "production" ||
    env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
    safeSha(expectedHeadSha) === null ||
    expectedHeadSha !== observedHeadSha ||
    repository === null ||
    repositoryId === null ||
    runId === null ||
    runAttempt === null ||
    env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
    base.event !== "workflow_dispatch" ||
    base.branch !== "verdant-grow-diary"
  ) {
    logger.error("Quick Log delivery inputs were rejected before database access.");
    writeReport("BLOCKED - confirmation rejected", ["No database process was started."]);
    writeAudit("input_rejected", base, { reason_code: "input_rejected" });
    return EXIT.INPUT_REJECTED;
  }
  if (operation === "APPLY" && currentDeployHeadSha !== expectedHeadSha) {
    logger.error("The deploy branch advanced during environment review.");
    writeReport("BLOCKED - deploy branch advanced", [
      "Run a new PREFLIGHT from the current deploy head.",
    ]);
    writeAudit("deploy_head_advanced", base, { reason_code: "deploy_head_advanced" });
    return EXIT.DEPLOY_HEAD_ADVANCED;
  }
  if (
    operation === "APPLY" &&
    (env.CONFIRM_APPLY !== APPLY_CONFIRMATION || reviewedReceiptDigest === null)
  ) {
    logger.error("APPLY confirmation or reviewed receipt was rejected.");
    writeReport("BLOCKED - APPLY confirmation rejected", ["No database process was started."]);
    writeAudit("input_rejected", base, { reason_code: "input_rejected" });
    return EXIT.INPUT_REJECTED;
  }

  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    logger.error("The protected production database URL is not configured.");
    writeReport("BLOCKED - database secret missing", ["No database process was started."]);
    writeAudit("no_database_url", base, { reason_code: "database_secret_missing" });
    return EXIT.NO_DATABASE_URL;
  }

  let childEnv;
  try {
    assertSupabaseDatabaseTargetIdentity({ targetEnv: "production", databaseUrl });
    childEnv = buildPsqlEnvironment(env, databaseUrl, "production");
  } catch {
    logger.error("Production database identity was rejected.");
    writeReport("BLOCKED - target identity rejected", ["No database process was started."]);
    writeAudit("target_rejected", base, { reason_code: "target_identity_rejected" });
    return EXIT.TARGET_REJECTED;
  }

  try {
    childEnv = hardenProductionPsqlEnvironment({ sourceEnv: env, childEnv });
  } catch {
    logger.error("Production database TLS trust was rejected.");
    writeReport("BLOCKED - production TLS trust rejected", [
      "No database process was started.",
      "Repair the protected production CA secret before running PREFLIGHT or APPLY.",
    ]);
    writeAudit("tls_trust_rejected", base, { reason_code: "tls_trust_rejected" });
    return EXIT.TLS_TRUST_REJECTED;
  }

  let migration;
  try {
    migration = validatePinnedMigrationFile({ readFile });
  } catch {
    logger.error("Pinned migration validation failed.");
    writeReport("BLOCKED - migration artifact rejected", ["No database process was started."]);
    writeAudit("file_rejected", base, { reason_code: "file_validation_rejected" });
    return EXIT.FILE_REJECTED;
  }

  const preflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!preflight.ok) {
    logger.error("Read-only Quick Log delivery preflight did not complete.");
    writeReport("BLOCKED - preflight failed", ["No migration SQL was submitted."]);
    writeAudit("preflight_failed", base, {
      reason_code: preflight.kind === "not_invocable" ? "psql_not_invocable" : "query_failed",
    });
    return preflight.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
  }

  let state;
  let classification;
  try {
    state = parsePreflightStdout(preflight.stdout);
    classification = classifyPreflight(state);
  } catch {
    logger.error("Read-only preflight result was rejected.");
    writeReport("BLOCKED - preflight malformed", ["No migration SQL was submitted."]);
    writeAudit("preflight_failed", base, { reason_code: "preflight_result_rejected" });
    return EXIT.PREFLIGHT_FAILED;
  }
  const receipt = buildPreflightReceipt({ state, headSha: expectedHeadSha });
  const receiptLine = `State-bound PREFLIGHT receipt: ${receipt.digest}`;

  if (classification.status === "ledger_drift" || classification.status === "invalid") {
    writeReport("BLOCKED - migration ledger drift", ["Nothing was written.", receiptLine]);
    writeAudit("ledger_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      reason_code:
        classification.reason === "target_collision"
          ? "target_collision"
          : "preflight_result_rejected",
    });
    return EXIT.LEDGER_DRIFT;
  }
  if (classification.status === "prerequisite_drift") {
    writeReport("BLOCKED - prerequisite drift", ["Nothing was written.", receiptLine]);
    writeAudit("prerequisite_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      prerequisites_live: false,
      reason_code: classification.reason,
    });
    return EXIT.PREREQUISITE_DRIFT;
  }
  if (classification.status === "partial_target_drift") {
    writeReport("BLOCKED - partial target drift", [
      "The non-idempotent migration will not apply over any pre-existing target object.",
      "Nothing was written.",
      receiptLine,
    ]);
    writeAudit("partial_target_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      reason_code: "target_objects_present",
    });
    return EXIT.PARTIAL_TARGET_DRIFT;
  }
  if (classification.status === "schema_drift") {
    writeReport("BLOCKED - recorded schema effect drift", [
      "The exact ledger row exists but its catalog effect is not exact.",
      "Nothing was written.",
      receiptLine,
    ]);
    writeAudit("schema_drift", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      schema_effect_live: false,
      prerequisites_live: prerequisitesLive(state),
      reason_code: "recorded_effect_mismatch",
    });
    return EXIT.SCHEMA_DRIFT;
  }

  if (operation === "PREFLIGHT") {
    if (classification.status === "apply") {
      logger.log("Quick Log corrections/retractions PREFLIGHT is SAFE_TO_APPLY.");
      writeReport("PASS - SAFE_TO_APPLY", ["This PREFLIGHT was read-only.", receiptLine]);
      writeAudit("safe_to_apply", base, {
        safe_to_apply: true,
        receipt_digest: receipt.digest,
        ledger_state: "apply",
        schema_effect_live: false,
        prerequisites_live: true,
      });
      writeReceipt(receipt.digest, base);
      return EXIT.OK;
    }
    logger.log("Quick Log corrections/retractions are already applied and verified.");
    writeReport("PASS - already applied", ["This PREFLIGHT was read-only.", receiptLine]);
    writeAudit("already_applied_verified", base, {
      safe_to_apply: false,
      receipt_digest: receipt.digest,
      ledger_state: "verify_only",
      schema_effect_live: true,
      prerequisites_live: true,
    });
    return EXIT.OK;
  }

  if (reviewedReceiptDigest !== receipt.digest) {
    writeReport("BLOCKED - PREFLIGHT receipt mismatch", [
      "No migration file was submitted.",
      receiptLine,
    ]);
    writeAudit("receipt_mismatch", base, {
      ledger_state: classification.status,
      receipt_digest: receipt.digest,
      reason_code: "receipt_mismatch",
    });
    return EXIT.RECEIPT_MISMATCH;
  }
  if (classification.status === "verify_only") {
    logger.log("Quick Log corrections/retractions are already applied and verified.");
    writeReport("PASS - already applied", ["No persistent write was attempted.", receiptLine]);
    writeAudit("already_applied_verified", base, {
      ledger_state: "verify_only",
      receipt_digest: receipt.digest,
      schema_effect_live: true,
      prerequisites_live: true,
    });
    return EXIT.OK;
  }

  const temporaryRoot = mkdtempSync(
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-quicklog-delivery-"),
  );
  const applyPath = join(temporaryRoot, `apply-${PINNED_MIGRATION.version}.sql`);
  try {
    writeFileSync(applyPath, buildApplySql(migration), { encoding: "utf8", mode: 0o600 });
    const applied = runApplyFile({ path: applyPath, childEnv, spawnImpl });
    if (!applied.ok) {
      writeReport("FAIL - apply transaction rolled back", ["No partial success is assumed."]);
      writeAudit("apply_failed", base, {
        receipt_digest: receipt.digest,
        ledger_state: "apply",
        reason_code: "apply_failed",
      });
      return applied.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const postflight = runReadOnlyQuery({ childEnv, spawnImpl });
  if (!postflight.ok) {
    writeReport("FAIL - postflight unavailable", ["Treat the migration as unverified."]);
    writeAudit("postflight_failed", base, {
      receipt_digest: receipt.digest,
      reason_code: "postflight_failed",
    });
    return EXIT.POSTFLIGHT_FAILED;
  }
  let postflightState;
  let postflightClassification;
  try {
    postflightState = parsePreflightStdout(postflight.stdout);
    postflightClassification = classifyPreflight(postflightState);
  } catch {
    writeReport("FAIL - postflight malformed", ["Treat the migration as unverified."]);
    writeAudit("postflight_failed", base, {
      receipt_digest: receipt.digest,
      reason_code: "postflight_result_rejected",
    });
    return EXIT.POSTFLIGHT_FAILED;
  }
  if (postflightClassification.status !== "verify_only") {
    writeReport("FAIL - postflight contract mismatch", [
      "The exact ledger row and complete catalog effect were not proven.",
    ]);
    writeAudit("postflight_contract_failed", base, {
      ledger_state: postflightClassification.status,
      receipt_digest: receipt.digest,
      schema_effect_live: schemaEffectLive(postflightState),
      prerequisites_live: prerequisitesLive(postflightState),
      reason_code: "postflight_contract_failed",
    });
    return EXIT.POSTFLIGHT_CONTRACT_FAILED;
  }

  logger.log("Quick Log corrections/retractions migration applied atomically and verified.");
  writeReport("PASS - applied and verified", [
    "The exact migration, schema reload, and ledger marker committed together.",
    "Postflight verified thirteen ledger columns, retracted_at, exact constraints/indexes/policies, five functions, and client access fences.",
  ]);
  writeAudit("applied_verified", base, {
    ledger_state: "verify_only",
    receipt_digest: receipt.digest,
    schema_effect_live: true,
    prerequisites_live: true,
  });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = runQuickLogCorrectionsRetractionsDelivery();
