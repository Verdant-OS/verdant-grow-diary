#!/usr/bin/env node
/**
 * Production-only, ledger-only reconciliation for three immutable restored
 * migrations whose data backfills must never run late against grower rows.
 *
 * PREFLIGHT reads only pg_catalog and supabase_migrations.schema_migrations.
 * APPLY repeats the exact state under an advisory lock plus a ledger-table
 * lock, then performs plain collision-guarded ledger inserts. It never reads
 * or writes an application row and never executes a restored migration body.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPsqlEnvironment, writeTextFile } from "./lib/candidateNumberToolRuntime.mjs";
import { hardenProductionPsqlEnvironment } from "./lib/productionSupabaseTls.mjs";
import { SOLO_FOUNDER_POLICY } from "./lib/solo-founder-production-authorization.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  SUPABASE_DATABASE_TARGETS,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";

export const PRODUCTION_PROJECT_REF = SUPABASE_DATABASE_TARGETS.production.projectRef;
export const EXPECTED_REPOSITORY = "Verdant-OS/verdant-grow-diary";
export const EXPECTED_WORKFLOW_PATH = ".github/workflows/reconcile-restored-history-ledger.yml";
export const CANDIDATE_PR_NUMBER = 1113;
export const APPLY_CONFIRMATION = "APPLY RESTORED HISTORY LEDGER RECONCILIATION";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = resolve(
  repoRoot,
  "config",
  "restored-history-ledger-reconciliation.json",
);

export const RECONCILIATION_TARGETS = Object.freeze([
  Object.freeze({
    version: "20260710003638",
    name: "pheno_hunt_setup_backfill",
    source_path: "supabase/migrations/20260710003638_pheno_hunt_setup_backfill.sql",
    source_sha256: "8945dbff9369d88ecad8d9a19c19cbb30d7c5a415107662e6b9203dfb84c5c4e",
    proof: "catalog_only",
  }),
  Object.freeze({
    version: "20260710013255",
    name: "staff_role_grant_trigger_and_backfill",
    source_path: "supabase/migrations/20260710013255_staff_role_grant_trigger_and_backfill.sql",
    source_sha256: "8b443cc919ba4a74f02059e98d0c8f5743ba5a3bb97569a1e16d046ed7f90850",
    proof: "shifted_ledger_and_catalog",
    canonical_ledger_witness: Object.freeze({
      version: "20260709015800",
      name: "20260709015758_d49efeac-492c-4f7b-9746-3638f44fa287",
    }),
  }),
  Object.freeze({
    version: "20260725033124",
    name: "core_schema_forward_repair",
    source_path: "supabase/migrations/20260725033124_core_schema_forward_repair.sql",
    source_sha256: "c1c9fde7176c1e60b044a9d83a9f4ccfc4745163d5ab2d218fbd080ece40e36b",
    proof: "catalog_only",
  }),
]);

export const EXPECTED_FUNCTION_FINGERPRINTS = Object.freeze({
  staff: Object.freeze({ bytes: 568, md5: "8fff4227736bfa249a7e690c5f75997e" }),
  quicklog: Object.freeze({ bytes: 11988, md5: "2258b67627bcdfea4f17c07621598223" }),
});

const shiftedStaffWitness = RECONCILIATION_TARGETS[1].canonical_ledger_witness;

export const STAFF_SHIFTED_WITNESS_CONTRACT_SQL = `(select coalesce(
  count(*)=1 and bool_and(
    version=${sqlLiteral(shiftedStaffWitness.version)}
    and name=${sqlLiteral(shiftedStaffWitness.name)}
  ),false)
  from supabase_migrations.schema_migrations
  where version=${sqlLiteral(shiftedStaffWitness.version)}
    or name=${sqlLiteral(shiftedStaffWitness.name)})`;

export const STAFF_LEGACY_SAFETY_QUERY_SQL = `with legacy_staff_function as (
  select p.oid,p.prosecdef,p.proconfig,pg_catalog.pg_get_userbyid(p.proowner) as owner,
    pg_catalog.pg_get_function_result(p.oid) as result_type
  from pg_catalog.pg_proc p
  where p.oid=pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_email()')
)
select
  coalesce((select prosecdef and owner='postgres' and result_type='trigger'
    and proconfig=array['search_path=public, pg_temp']::text[] from legacy_staff_function),false)
    as staff_legacy_function_contract,
  coalesce((select
    not pg_catalog.has_function_privilege('anon',oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')
    from legacy_staff_function),false) as staff_legacy_acl_contract,
  coalesce((select not exists(
    select 1 from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgfoid=f.oid
  ) from legacy_staff_function f),false) as staff_no_legacy_trigger_contract`;

export const EXIT = Object.freeze({
  OK: 0,
  INPUT_REJECTED: 1,
  NO_DATABASE_URL: 2,
  TARGET_REJECTED: 3,
  MANIFEST_REJECTED: 4,
  PSQL_NOT_INVOCABLE: 5,
  PREFLIGHT_FAILED: 6,
  STATE_REJECTED: 7,
  RECEIPT_MISMATCH: 8,
  APPLY_FAILED: 9,
  POSTFLIGHT_FAILED: 10,
  DEPLOY_HEAD_ADVANCED: 11,
  TLS_TRUST_REJECTED: 12,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? text : null;
}

function exactJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function loadReconciliationManifest({ path = MANIFEST_PATH, readFile = readFileSync } = {}) {
  const raw = readFile(path);
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("manifest_json_rejected");
  }
  const targets = manifest?.reconciliations?.map((entry) => {
    const { reason: _reason, ...contract } = entry;
    return contract;
  });
  if (
    manifest?.schema_version !== 1 ||
    manifest?.tool !== "reconcile-restored-history-ledger" ||
    !exactJson(manifest?.target, {
      environment: "production",
      project_ref: PRODUCTION_PROJECT_REF,
      database: "postgres",
    }) ||
    !exactJson(manifest?.candidate, {
      repository: EXPECTED_REPOSITORY,
      pr_number: CANDIDATE_PR_NUMBER,
    }) ||
    !exactJson(manifest?.access_contract, {
      read_relations: ["pg_catalog.*", "supabase_migrations.schema_migrations"],
      write_relations: ["supabase_migrations.schema_migrations"],
      application_row_access: "forbidden",
    }) ||
    !exactJson(targets, RECONCILIATION_TARGETS) ||
    manifest.reconciliations.some(
      (entry) => typeof entry.reason !== "string" || entry.reason.trim().length < 40,
    )
  ) {
    throw new Error("manifest_contract_rejected");
  }
  return Object.freeze({ manifest, sha256: sha256(bytes) });
}

export function validateCandidateMigrationBlobs({
  candidateHeadSha,
  spawnImpl = spawnSync,
  targets = RECONCILIATION_TARGETS,
} = {}) {
  const head = safeSha(candidateHeadSha);
  if (
    !head ||
    !exactJson(
      targets,
      RECONCILIATION_TARGETS.map((entry) => ({ ...entry })),
    )
  ) {
    throw new Error("candidate_blob_input_rejected");
  }
  return Object.freeze(
    targets.map((target) => {
      let result;
      try {
        result = spawnImpl("git", ["cat-file", "blob", `${head}:${target.source_path}`], {
          encoding: null,
          maxBuffer: 1024 * 1024,
        });
      } catch {
        throw new Error(`candidate_blob_unavailable:${target.version}`);
      }
      if (result?.error || result?.status !== 0 || result.stdout === undefined) {
        throw new Error(`candidate_blob_unavailable:${target.version}`);
      }
      const bytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
      const observed = sha256(bytes);
      if (observed !== target.source_sha256) {
        throw new Error(`candidate_blob_hash_mismatch:${target.version}`);
      }
      return Object.freeze({
        version: target.version,
        name: target.name,
        path: target.source_path,
        sha256: observed,
      });
    }),
  );
}

const expectedValuesSql = RECONCILIATION_TARGETS.map(
  (entry) =>
    `(${sqlLiteral(entry.version)},${sqlLiteral(entry.name)},${sqlLiteral(entry.source_sha256)},` +
    `${sqlLiteral(`restored-history-ledger-reconciliation:${entry.version}:${entry.source_sha256}`)})`,
).join(",\n    ");

export const RESULT_KEYS = Object.freeze([
  "current_database",
  "current_user",
  "ledger_total_count",
  "ledger_contract",
  "target_collision_count",
  "target_states",
  "staff_shifted_witness_contract",
  "pheno_constraint_contract",
  "pheno_comment_contract",
  "staff_source_length",
  "staff_source_md5",
  "staff_function_contract",
  "staff_acl_contract",
  "staff_legacy_function_contract",
  "staff_legacy_acl_contract",
  "staff_no_legacy_trigger_contract",
  "staff_trigger_contract",
  "quicklog_source_length",
  "quicklog_source_md5",
  "quicklog_request_hash_column_contract",
  "plant_type_column_contract",
  "plant_type_constraint_contract",
  "plant_type_comment_contract",
  "quicklog_function_contract",
  "quicklog_acl_contract",
  "quicklog_comment_contract",
]);

export const CATALOG_STATE_QUERY_SQL = `with expected(version,name,source_sha256,idempotency_key) as (
  values
    ${expectedValuesSql}
), ledger_relation as (
  select c.oid,c.relowner,c.relnamespace,c.relam,c.relkind,c.relpersistence,
    c.relispartition,c.relhasrules,c.relrowsecurity,c.relforcerowsecurity,c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='supabase_migrations' and c.relname='schema_migrations'
), ledger_contract as (
  select coalesce((select
    r.relkind='r' and r.relpersistence='p' and not r.relispartition and not r.relhasrules
    and not r.relrowsecurity and not r.relforcerowsecurity
    and pg_catalog.pg_get_userbyid(r.relowner)='postgres' and current_user='postgres'
    and coalesce((select am.amtype='t' and am.amname='heap'
      from pg_catalog.pg_am am where am.oid=r.relam),false)
    and coalesce((select array_agg(pg_catalog.format(
      '%s|%s|%s|%s|%s|%s|%s|%s|%s',a.attnum,a.attname,
      pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,
      a.attgenerated,a.attidentity,d.oid is null,a.attacl is null,
      a.attcollation=t.typcollation and (a.attcollation=0 or exists(
        select 1 from pg_catalog.pg_collation cl
        join pg_catalog.pg_namespace cn on cn.oid=cl.collnamespace
        where cl.oid=a.attcollation and cn.nspname='pg_catalog'
          and cl.collname='default' and cl.collprovider='d' and cl.collisdeterministic
      ))) order by a.attnum)
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_type t on t.oid=a.atttypid
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),array[]::text[])
      = array[
        '1|version|text|t|||t|t|t','2|statements|text[]|f|||t|t|t','3|name|text|f|||t|t|t',
        '4|created_by|text|f|||t|t|t','5|idempotency_key|text|f|||t|t|t','6|rollback|text[]|f|||t|t|t'
      ]::text[]
    and coalesce((select array_agg(pg_catalog.format(
      '%s|%s|%s|%s|%s|%s',c.conname,c.contype,c.convalidated,
      c.condeferrable,c.condeferred,pg_catalog.pg_get_constraintdef(c.oid,true)
    ) order by c.conname) from pg_catalog.pg_constraint c where c.conrelid=r.oid),array[]::text[])
      = array[
        'schema_migrations_idempotency_key_key|u|t|f|f|UNIQUE (idempotency_key)',
        'schema_migrations_pkey|p|t|f|f|PRIMARY KEY (version)'
      ]::text[]
    and coalesce((select count(*)=2 and bool_and(
      i.indisunique and i.indisvalid and i.indisready and i.indislive
      and i.indimmediate and not i.indisexclusion and not i.indnullsnotdistinct
      and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indnatts=1
      and ic.relkind='i' and ic.relpersistence='p' and am.amname='btree'
      and oc.opcmethod=am.oid and oc.opcname='text_ops' and oc.opcdefault
      and ocn.nspname='pg_catalog'
      and c.oid is not null and ic.relname=c.conname
      and ((c.conname='schema_migrations_pkey' and c.contype='p' and i.indisprimary
          and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=i.indrelid
            and a.attnum=i.indkey[0] and a.attname='version'
            and i.indcollation[0]=a.attcollation))
        or (c.conname='schema_migrations_idempotency_key_key' and c.contype='u'
          and not i.indisprimary
          and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=i.indrelid
            and a.attnum=i.indkey[0] and a.attname='idempotency_key'
            and i.indcollation[0]=a.attcollation))))
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ic on ic.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=ic.relam
      join pg_catalog.pg_opclass oc on oc.oid=i.indclass[0]
      join pg_catalog.pg_namespace ocn on ocn.oid=oc.opcnamespace
      left join pg_catalog.pg_constraint c on c.conrelid=i.indrelid and c.conindid=i.indexrelid
      where i.indrelid=r.oid),false)
    and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=r.oid and not t.tgisinternal)
    and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=r.oid
      and (t.tgtype::integer & 4)<>0)
    and not exists(select 1 from pg_catalog.pg_rewrite w where w.ev_class=r.oid)
    and not exists(select 1 from pg_catalog.pg_inherits h where h.inhrelid=r.oid or h.inhparent=r.oid)
    and not exists(select 1 from pg_catalog.pg_publication p where p.pubinsert and (
      p.puballtables
      or exists(select 1 from pg_catalog.pg_publication_rel pr
        where pr.prpubid=p.oid and pr.prrelid=r.oid)
      or exists(select 1 from pg_catalog.pg_publication_namespace pn
        where pn.pnpubid=p.oid and pn.pnnspid=r.relnamespace)
    ))
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(r.relacl,pg_catalog.acldefault('r',r.relowner))) x
      where x.grantee<>r.relowner)
    and coalesce((select count(*)=3 and bool_and(
      not ar.rolsuper and not ar.rolcreaterole
      and not pg_catalog.has_table_privilege(ar.oid,r.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not pg_catalog.has_any_column_privilege(ar.oid,r.oid,
        'SELECT,INSERT,UPDATE,REFERENCES')
      and not exists(select 1 from pg_catalog.pg_roles reachable
        where reachable.oid<>ar.oid
          and pg_catalog.pg_has_role(ar.oid,reachable.oid,'MEMBER')
          and (reachable.rolsuper or reachable.rolcreaterole
            or pg_catalog.has_table_privilege(reachable.oid,r.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            or pg_catalog.has_any_column_privilege(reachable.oid,r.oid,
              'SELECT,INSERT,UPDATE,REFERENCES')))
    ) from pg_catalog.pg_roles ar
      where ar.rolname in('anon','authenticated','service_role')),false)
    and pg_catalog.has_table_privilege(current_user,r.oid,'SELECT,INSERT')
  from ledger_relation r),false) as contract
), target_rows as (
  select e.version,e.name,e.source_sha256,e.idempotency_key,
    count(sm.*) filter(where sm.version=e.version and sm.name=e.name
      and sm.idempotency_key=e.idempotency_key)::int as exact_count,
    coalesce(bool_and(
      sm.statements=array['-- restored-history-ledger-reconciliation:v1; source_sha256='||e.source_sha256||'; application_row_access=forbidden']::text[]
      and sm.created_by='codex-protected-runner' and sm.idempotency_key=e.idempotency_key
      and sm.rollback='{}'::text[]
    ) filter(where sm.version=e.version and sm.name=e.name
      and sm.idempotency_key=e.idempotency_key),false) as row_contract
  from expected e left join supabase_migrations.schema_migrations sm
    on sm.version=e.version or sm.name=e.name or sm.idempotency_key=e.idempotency_key
  group by e.version,e.name,e.source_sha256,e.idempotency_key
), staff_function as (
  select p.oid,length(pg_catalog.pg_get_functiondef(p.oid))::int as source_length,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as source_md5,p.prosecdef,p.proconfig,
    pg_catalog.pg_get_userbyid(p.proowner) as owner,pg_catalog.pg_get_function_result(p.oid) as result_type
  from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_allowlist()')
), quicklog_function as (
  select p.oid,length(pg_catalog.pg_get_functiondef(p.oid))::int as source_length,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as source_md5,p.prosecdef,p.proconfig,
    p.proargnames,p.pronargs,p.pronargdefaults,pg_catalog.oidvectortypes(p.proargtypes) as arg_types,
    pg_catalog.pg_get_userbyid(p.proowner) as owner,pg_catalog.pg_get_function_result(p.oid) as result_type
  from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(
    'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamp with time zone,jsonb,jsonb,jsonb)')
), quicklog_request_hash_column as (
  select count(*)::int as count,coalesce(bool_and(
    a.atttypid=pg_catalog.to_regtype('pg_catalog.text') and a.atttypmod=(-1)
    and a.attndims=0 and not a.attnotnull and not a.atthasdef
    and a.attgenerated='' and a.attidentity='' and a.attacl is null
    and a.attcollation=t.typcollation and d.oid is null
  ),false) as contract
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_type t on t.oid=a.atttypid
  left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid=pg_catalog.to_regclass('public.quicklog_idempotency')
    and a.attname='request_hash' and a.attnum>0 and not a.attisdropped
), plant_type_column as (
  select count(*)::int as count,coalesce(bool_and(
    a.atttypid=pg_catalog.to_regtype('pg_catalog.text') and a.atttypmod=(-1)
    and a.attndims=0 and a.attnotnull and a.atthasdef
    and a.attgenerated='' and a.attidentity='' and a.attacl is null
    and a.attcollation=t.typcollation and d.oid is not null
    and pg_catalog.pg_get_expr(d.adbin,d.adrelid,true)='''unknown''::text'
  ),false) as contract
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_type t on t.oid=a.atttypid
  left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid=pg_catalog.to_regclass('public.plants')
    and a.attname='plant_type' and a.attnum>0 and not a.attisdropped
), plant_type_constraint as (
  select count(*)::int as count,coalesce(bool_and(
    c.contype='c' and c.convalidated and not c.condeferrable and not c.condeferred
    and not c.connoinherit and c.conislocal and c.coninhcount=0 and c.conparentid=0
    and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a
      where a.attrelid=c.conrelid and a.attname='plant_type'
        and a.attnum>0 and not a.attisdropped)]::smallint[]
    and pg_catalog.pg_get_constraintdef(c.oid,true)=
      'CHECK (plant_type = ANY (ARRAY[''autoflower''::text, ''photoperiod''::text, ''unknown''::text]))'
  ),false) as contract
  from pg_catalog.pg_constraint c
  where c.conrelid=pg_catalog.to_regclass('public.plants')
    and c.conname='plants_plant_type_check'
), staff_acl as (
  select coalesce((select array_agg(pg_catalog.pg_get_userbyid(x.grantee)||':'||x.privilege_type||':'||x.is_grantable
      order by pg_catalog.pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable)
    from staff_function f cross join lateral pg_catalog.aclexplode(
      coalesce((select p.proacl from pg_catalog.pg_proc p where p.oid=f.oid),pg_catalog.acldefault('f',(select p.proowner from pg_catalog.pg_proc p where p.oid=f.oid)))) x),array[]::text[]) as grants
), quicklog_acl as (
  select coalesce((select array_agg(pg_catalog.pg_get_userbyid(x.grantee)||':'||x.privilege_type||':'||x.is_grantable
      order by pg_catalog.pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable)
    from quicklog_function f cross join lateral pg_catalog.aclexplode(
      coalesce((select p.proacl from pg_catalog.pg_proc p where p.oid=f.oid),pg_catalog.acldefault('f',(select p.proowner from pg_catalog.pg_proc p where p.oid=f.oid)))) x),array[]::text[]) as grants
), legacy_staff_safety as (
  ${STAFF_LEGACY_SAFETY_QUERY_SQL}
), staff_triggers as (
  select count(*)::int as count,
    coalesce(bool_and(t.tgenabled='O' and t.tgfoid=pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_allowlist()')
      and t.tgnargs=0 and pg_catalog.octet_length(t.tgargs)=0
      and ((t.tgrelid=pg_catalog.to_regclass('auth.users')
          and t.tgname='on_auth_user_created_grant_staff' and t.tgtype::int=5
          and t.tgqual is null and t.tgattr::text='')
        or (t.tgrelid=pg_catalog.to_regclass('auth.users')
          and t.tgname='on_auth_user_confirmed_grant_staff' and t.tgtype::int=17
          and t.tgattr::text=(select a.attnum::text from pg_catalog.pg_attribute a
            where a.attrelid=t.tgrelid and a.attname='email_confirmed_at'
              and a.attnum>0 and not a.attisdropped)
          and lower(pg_catalog.regexp_replace(
            pg_catalog.pg_get_expr(t.tgqual,t.tgrelid),'\\s+','','g'
          ))='((old.email_confirmed_atisnull)and(new.email_confirmed_atisnotnull))'))),false) as contract
  from pg_catalog.pg_trigger t where not t.tgisinternal
    and (t.tgname in('on_auth_user_created_grant_staff','on_auth_user_confirmed_grant_staff')
      or t.tgfoid in(
        pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_allowlist()'),
        pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_email()')
      ))
)
select pg_catalog.json_build_object(
  'current_database',pg_catalog.current_database(),'current_user',current_user,
  'ledger_total_count',(select count(*)::int from supabase_migrations.schema_migrations),
  'ledger_contract',(select contract from ledger_contract),
  'target_collision_count',(select count(*)::int from supabase_migrations.schema_migrations sm
    where exists(select 1 from expected e
      where sm.version=e.version or sm.name=e.name or sm.idempotency_key=e.idempotency_key)
      and not exists(select 1 from expected e
        where sm.version=e.version and sm.name=e.name and sm.idempotency_key=e.idempotency_key)),
  'target_states',(select pg_catalog.json_agg(pg_catalog.json_build_object(
    'version',version,'name',name,'exact_count',exact_count,'row_contract',row_contract) order by version) from target_rows),
  'staff_shifted_witness_contract',${STAFF_SHIFTED_WITNESS_CONTRACT_SQL},
  'pheno_constraint_contract',coalesce((select count(*)=1 and bool_and(
    pg_catalog.pg_get_constraintdef(c.oid,true)='CHECK (notes IS NULL OR char_length(notes) >= 1 AND char_length(notes) <= 4000)')
    from pg_catalog.pg_constraint c where c.conrelid=pg_catalog.to_regclass('public.pheno_hunts')
      and c.conname='pheno_hunts_notes_length'),false),
  'pheno_comment_contract',coalesce((select pg_catalog.col_description(a.attrelid,a.attnum)=
    'When guided setup was completed. NULL = setup in progress (workspace shows the setup progress card). Legacy hunts backfilled to created_at.'
    from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.pheno_hunts')
      and a.attname='setup_completed_at' and a.attnum>0 and not a.attisdropped),false),
  'staff_source_length',coalesce((select source_length from staff_function),0),
  'staff_source_md5',coalesce((select source_md5 from staff_function),''),
  'staff_function_contract',coalesce((select prosecdef and owner='postgres' and result_type='trigger'
    and proconfig=array['search_path=public, pg_temp']::text[] from staff_function),false),
  'staff_acl_contract',(select grants=array['postgres:EXECUTE:true','service_role:EXECUTE:false']::text[] from staff_acl),
  'staff_legacy_function_contract',(select staff_legacy_function_contract from legacy_staff_safety),
  'staff_legacy_acl_contract',(select staff_legacy_acl_contract from legacy_staff_safety),
  'staff_no_legacy_trigger_contract',(select staff_no_legacy_trigger_contract from legacy_staff_safety),
  'staff_trigger_contract',(select count=2 and contract from staff_triggers),
  'quicklog_source_length',coalesce((select source_length from quicklog_function),0),
  'quicklog_source_md5',coalesce((select source_md5 from quicklog_function),''),
  'quicklog_request_hash_column_contract',(select count=1 and contract from quicklog_request_hash_column),
  'plant_type_column_contract',(select count=1 and contract from plant_type_column),
  'plant_type_constraint_contract',(select count=1 and contract from plant_type_constraint),
  'plant_type_comment_contract',coalesce((select pg_catalog.col_description(a.attrelid,a.attnum)=
    'Declared plant type: autoflower | photoperiod | unknown. Grower-entered only, never inferred. unknown blocks cross-plant ranking and strong AI readiness.'
    from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.plants')
      and a.attname='plant_type' and a.attnum>0 and not a.attisdropped),false),
  'quicklog_function_contract',coalesce((select prosecdef and owner='postgres' and result_type='jsonb'
    and proconfig=array['search_path=public, pg_temp']::text[] and pronargs=12 and pronargdefaults=9
    and arg_types='text, uuid, text, uuid, uuid, text, text, jsonb, timestamp with time zone, jsonb, jsonb, jsonb'
    and proargnames=array['p_idempotency_key','p_grow_id','p_event_type','p_tent_id','p_plant_id','p_note','p_photo_url','p_sensor_snapshot','p_occurred_at','p_details','p_water','p_feed']::text[]
    from quicklog_function),false),
  'quicklog_acl_contract',(select grants=array['authenticated:EXECUTE:false','postgres:EXECUTE:true','service_role:EXECUTE:false']::text[] from quicklog_acl),
  'quicklog_comment_contract',coalesce((select pg_catalog.obj_description(f.oid,'pg_proc')=
    'Authenticated Quick Log event writer. Persists canonical Captured logged_at separately from occurred_at and preserves atomic per-user idempotency.' from quicklog_function f),false)
)`;

export const PREFLIGHT_SQL = `set transaction read only;
set local lock_timeout='8s';
set local statement_timeout='30s';
set local search_path=pg_catalog,pg_temp;
${CATALOG_STATE_QUERY_SQL};`;

export function parsePreflightStdout(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error(`preflight_row_count:${lines.length}`);
  let state;
  try {
    state = JSON.parse(lines[0]);
  } catch {
    throw new Error("preflight_result_json");
  }
  if (
    !state ||
    Array.isArray(state) ||
    !exactJson(Object.keys(state).sort(), [...RESULT_KEYS].sort())
  ) {
    throw new Error("preflight_result_shape");
  }
  if (state.current_database !== "postgres" || typeof state.current_user !== "string")
    throw new Error("preflight_result_shape");
  if (
    !Number.isSafeInteger(state.ledger_total_count) ||
    state.ledger_total_count < 0 ||
    !Number.isSafeInteger(state.target_collision_count) ||
    state.target_collision_count < 0
  )
    throw new Error("preflight_result_shape");
  for (const key of RESULT_KEYS.filter((key) => key.endsWith("_contract")))
    if (typeof state[key] !== "boolean") throw new Error("preflight_result_shape");
  for (const key of ["staff_source_length", "quicklog_source_length"])
    if (!Number.isSafeInteger(state[key]) || state[key] < 0)
      throw new Error("preflight_result_shape");
  for (const key of ["staff_source_md5", "quicklog_source_md5"])
    if (!/^(?:[0-9a-f]{32})?$/.test(state[key])) throw new Error("preflight_result_shape");
  if (!Array.isArray(state.target_states) || state.target_states.length !== 3)
    throw new Error("preflight_result_shape");
  for (let index = 0; index < RECONCILIATION_TARGETS.length; index += 1) {
    const row = state.target_states[index];
    const expected = RECONCILIATION_TARGETS[index];
    if (
      !row ||
      !exactJson(Object.keys(row).sort(), ["exact_count", "name", "row_contract", "version"]) ||
      row.version !== expected.version ||
      row.name !== expected.name ||
      !Number.isSafeInteger(row.exact_count) ||
      row.exact_count < 0 ||
      typeof row.row_contract !== "boolean"
    )
      throw new Error("preflight_result_shape");
  }
  return Object.freeze({
    ...state,
    target_states: Object.freeze(state.target_states.map(Object.freeze)),
  });
}

const CATALOG_CONTRACT_KEYS = RESULT_KEYS.filter(
  (key) => key.endsWith("_contract") && key !== "ledger_contract",
);

export function classifyPreflight(state) {
  if (!state || state.current_user !== "postgres" || state.ledger_contract !== true)
    return Object.freeze({ status: "prerequisite_drift", reason: "ledger_contract" });
  if (state.target_collision_count !== 0 || state.target_states.some((row) => row.exact_count > 1))
    return Object.freeze({ status: "ledger_drift", reason: "target_collision" });
  if (
    state.staff_source_length !== EXPECTED_FUNCTION_FINGERPRINTS.staff.bytes ||
    state.staff_source_md5 !== EXPECTED_FUNCTION_FINGERPRINTS.staff.md5
  )
    return Object.freeze({ status: "catalog_drift", reason: "staff_fingerprint" });
  if (
    state.quicklog_source_length !== EXPECTED_FUNCTION_FINGERPRINTS.quicklog.bytes ||
    state.quicklog_source_md5 !== EXPECTED_FUNCTION_FINGERPRINTS.quicklog.md5
  )
    return Object.freeze({ status: "catalog_drift", reason: "quicklog_fingerprint" });
  const failed = CATALOG_CONTRACT_KEYS.find((key) => state[key] !== true);
  if (failed) return Object.freeze({ status: "catalog_drift", reason: failed });
  const counts = state.target_states.map((row) => row.exact_count);
  if (counts.every((count) => count === 0)) return Object.freeze({ status: "apply" });
  if (counts.every((count) => count === 1) && state.target_states.every((row) => row.row_contract))
    return Object.freeze({ status: "verify_only" });
  return Object.freeze({ status: "ledger_drift", reason: "partial_or_untrusted_reconciliation" });
}

export function buildStateReceipt({
  state,
  deployHeadSha,
  candidatePrNumber,
  candidateHeadSha,
  targetMigrations,
  manifestSha256,
  context,
  authorization,
}) {
  const deployHead = safeSha(deployHeadSha);
  const candidateHead = safeSha(candidateHeadSha);
  const manifestDigest = safeDigest(manifestSha256);
  if (
    !deployHead ||
    !candidateHead ||
    candidatePrNumber !== CANDIDATE_PR_NUMBER ||
    !manifestDigest ||
    !exactJson(
      targetMigrations,
      RECONCILIATION_TARGETS.map((entry) => ({
        version: entry.version,
        name: entry.name,
        path: entry.source_path,
        sha256: entry.source_sha256,
      })),
    ) ||
    !context ||
    context.repository !== EXPECTED_REPOSITORY ||
    safePositiveIntegerText(context.repositoryId) === null ||
    safePositiveIntegerText(context.runId) === null ||
    context.runAttempt !== 1 ||
    context.event !== "workflow_dispatch" ||
    context.branch !== "verdant-grow-diary" ||
    !authorization
  ) {
    throw new Error("receipt_input_rejected");
  }
  // Bind the reviewed database/catalog state to immutable repository inputs,
  // but not to the workflow run that observed it. PREFLIGHT and APPLY must be
  // separate fresh workflow runs, so run_id/run_attempt are authenticated by
  // the artifact verifier and carried as provenance rather than hashed into
  // the cross-run state digest.
  const stablePayload = {
    schema_version: 1,
    tool: "reconcile-restored-history-ledger",
    project_ref: PRODUCTION_PROJECT_REF,
    deploy_head_sha: deployHead,
    candidate_pr_number: candidatePrNumber,
    candidate_head_sha: candidateHead,
    manifest_sha256: manifestDigest,
    target_migrations: targetMigrations,
    repository: context.repository,
    repository_id: context.repositoryId,
    workflow_path: EXPECTED_WORKFLOW_PATH,
    event: context.event,
    branch: context.branch,
    authorization,
    preflight_classification:
      classifyPreflight(state).status === "apply"
        ? "safe_to_reconcile"
        : "already_reconciled_verified",
    state: Object.fromEntries(RESULT_KEYS.map((key) => [key, state[key]])),
  };
  return Object.freeze({
    ...stablePayload,
    run_id: context.runId,
    run_attempt: context.runAttempt,
    digest: sha256(JSON.stringify(stablePayload)),
  });
}

export function buildApplySql({ manifest, state }) {
  if (classifyPreflight(state).status !== "apply") throw new Error("apply_state_rejected");
  const expectedState = sqlLiteral(
    JSON.stringify(Object.fromEntries(RESULT_KEYS.map((key) => [key, state[key]]))),
  );
  const values = manifest.reconciliations
    .map((entry) => {
      const marker = `-- restored-history-ledger-reconciliation:v1; source_sha256=${entry.source_sha256}; application_row_access=forbidden`;
      const key = `restored-history-ledger-reconciliation:${entry.version}:${entry.source_sha256}`;
      return `(${sqlLiteral(entry.version)},array[${sqlLiteral(marker)}]::text[],${sqlLiteral(entry.name)},'codex-protected-runner',${sqlLiteral(key)},'{}'::text[])`;
    })
    .join(",\n  ");
  return `\\set ON_ERROR_STOP on
begin;
set local lock_timeout='8s';
set local statement_timeout='30s';
set local search_path=pg_catalog,pg_temp;
select pg_catalog.pg_advisory_xact_lock(20260825,1113);
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $reconcile_guard$
declare v_state json;
begin
  execute $catalog$${CATALOG_STATE_QUERY_SQL}$catalog$ into v_state;
  if v_state::jsonb <> ${expectedState}::jsonb then
    raise exception using errcode='55000',message='restored-history ledger reconciliation state changed under lock';
  end if;
end
$reconcile_guard$;
insert into supabase_migrations.schema_migrations
  (version,statements,name,created_by,idempotency_key,rollback)
values
  ${values};
commit;
`;
}

export function buildPostflightSql() {
  return PREFLIGHT_SQL;
}

function runPsqlQuery({ sql, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl(
      "psql",
      ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-c", sql],
      { encoding: "utf8", env: childEnv },
    );
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  return result?.status === 0
    ? { ok: true, stdout: result.stdout }
    : { ok: false, kind: "query_failed" };
}

function runPsqlFile({ path, childEnv, spawnImpl }) {
  let result;
  try {
    result = spawnImpl("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--file", path], {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    return { ok: false, kind: "not_invocable" };
  }
  if (result?.error) return { ok: false, kind: "not_invocable" };
  return result?.status === 0 ? { ok: true } : { ok: false, kind: "apply_failed" };
}

function buildAuthorization(env, base) {
  if (!(
    env.GITHUB_RUN_ATTEMPT === "1" &&
    env.SOLO_FOUNDER_ACKNOWLEDGEMENT === SOLO_FOUNDER_POLICY.acknowledgement &&
    env.SOLO_FOUNDER_DELIVERY_MODE === SOLO_FOUNDER_POLICY.deliveryMode &&
    env.SOLO_FOUNDER_VERIFIED_USER_ID === String(SOLO_FOUNDER_POLICY.founderUserId) &&
    env.SOLO_FOUNDER_VERIFIED_LOGIN === SOLO_FOUNDER_POLICY.founderLogin &&
    env.SOLO_FOUNDER_VERIFIED_ENVIRONMENT === SOLO_FOUNDER_POLICY.environmentName &&
    env.SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED === "true" &&
    env.SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED === "true" &&
    env.SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED === "true" &&
    env.SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS === String(SOLO_FOUNDER_POLICY.minimumReviewSeconds) &&
    env.SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS === String(SOLO_FOUNDER_POLICY.maximumReviewSeconds) &&
    env.EXPECTED_CANDIDATE_PR_NUMBER === String(CANDIDATE_PR_NUMBER) &&
    env.CURRENT_CANDIDATE_PR_NUMBER === String(CANDIDATE_PR_NUMBER) &&
    safeSha(base.expectedCandidateHeadSha) !== null &&
    base.currentCandidateHeadSha === base.expectedCandidateHeadSha
  ))
    return null;
  return Object.freeze({
    delivery_mode: SOLO_FOUNDER_POLICY.deliveryMode,
    founder_github_user_id: SOLO_FOUNDER_POLICY.founderUserId,
    founder_github_login: SOLO_FOUNDER_POLICY.founderLogin,
    production_environment: SOLO_FOUNDER_POLICY.environmentName,
    solo_founder_acknowledgement_verified: true,
    environment_contract_verified: true,
    environment_approval_verified: true,
    minimum_review_seconds: SOLO_FOUNDER_POLICY.minimumReviewSeconds,
    maximum_review_seconds: SOLO_FOUNDER_POLICY.maximumReviewSeconds,
  });
}

function artifactWriters({ env, now, logger, base, manifestSha256, authorization }) {
  const common = {
    schema_version: 1,
    tool: "reconcile-restored-history-ledger",
    target_env: "production",
    project_ref: PRODUCTION_PROJECT_REF,
    checked_at: now().toISOString(),
    operation: base.operation,
    deploy_head_sha: safeSha(base.expectedHeadSha),
    candidate_pr_number: CANDIDATE_PR_NUMBER,
    candidate_head_sha: safeSha(base.expectedCandidateHeadSha),
    manifest_sha256: manifestSha256,
    repository: base.repository,
    repository_id: base.repositoryId,
    workflow_path: EXPECTED_WORKFLOW_PATH,
    run_id: base.runId,
    run_attempt: base.runAttempt,
    event: base.event,
    branch: base.branch,
    ...(authorization ?? {}),
  };
  return {
    report(status, lines = []) {
      writeTextFile(
        env.REPORT_PATH ?? "",
        [
          "### Restored-history ledger reconciliation",
          "",
          `**Status:** ${status}`,
          "",
          ...lines,
          "",
          "Artifacts contain no credential, application row, raw query output, or raw database error.",
          "",
        ].join("\n"),
        logger,
        "ledger reconciliation report",
      );
    },
    audit(outcome, extra = {}) {
      writeTextFile(
        env.AUDIT_PATH ?? "",
        `${JSON.stringify({ ...common, outcome, ...(safeDigest(extra.receipt_digest) ? { receipt_digest: extra.receipt_digest } : {}), ...(typeof extra.reason_code === "string" ? { reason_code: extra.reason_code } : {}) }, null, 2)}\n`,
        logger,
        "ledger reconciliation audit",
      );
    },
    receipt(receipt) {
      writeTextFile(
        env.PREFLIGHT_RECEIPT_PATH ?? "",
        `${JSON.stringify(
          {
            schema_version: 1,
            tool: "reconcile-restored-history-ledger",
            operation: "PREFLIGHT",
            outcome: "safe_to_reconcile",
            safe_to_apply: true,
            repository: base.repository,
            repository_id: base.repositoryId,
            workflow_path: EXPECTED_WORKFLOW_PATH,
            run_id: base.runId,
            run_attempt: base.runAttempt,
            event: base.event,
            branch: base.branch,
            deploy_head_sha: safeSha(base.expectedHeadSha),
            candidate_pr_number: CANDIDATE_PR_NUMBER,
            candidate_head_sha: safeSha(base.expectedCandidateHeadSha),
            project_ref: PRODUCTION_PROJECT_REF,
            manifest_sha256: manifestSha256,
            target_migrations: receipt.target_migrations,
            state_digest: receipt.digest,
            ...authorization,
          },
          null,
          2,
        )}\n`,
        logger,
        "ledger reconciliation PREFLIGHT receipt",
      );
    },
  };
}

export function runRestoredHistoryLedgerReconciliation({
  env = process.env,
  spawnImpl = spawnSync,
  readFile = readFileSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const operation = String(env.OPERATION ?? "").trim();
  const expectedHeadSha = String(env.EXPECTED_HEAD_SHA ?? "").trim();
  const base = {
    operation,
    expectedHeadSha,
    expectedCandidateHeadSha: String(env.EXPECTED_CANDIDATE_HEAD_SHA ?? "").trim(),
    currentCandidateHeadSha: String(env.CURRENT_CANDIDATE_HEAD_SHA ?? "").trim(),
    repository: env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY ? EXPECTED_REPOSITORY : null,
    repositoryId: safePositiveIntegerText(env.GITHUB_REPOSITORY_ID),
    runId: safePositiveIntegerText(env.GITHUB_RUN_ID),
    runAttempt:
      safePositiveIntegerText(env.GITHUB_RUN_ATTEMPT) === null
        ? null
        : Number(env.GITHUB_RUN_ATTEMPT),
    event: env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "workflow_dispatch" : null,
    branch: env.GITHUB_REF_NAME === "verdant-grow-diary" ? "verdant-grow-diary" : null,
  };
  let loaded;
  try {
    loaded = loadReconciliationManifest({ readFile });
  } catch {
    return EXIT.MANIFEST_REJECTED;
  }
  const authorization = buildAuthorization(env, base);
  const artifacts = artifactWriters({
    env,
    now,
    logger,
    base,
    manifestSha256: loaded.sha256,
    authorization,
  });
  const expectedWorkflowRef = `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/heads/verdant-grow-diary`;
  if (
    !authorization ||
    !["PREFLIGHT", "APPLY"].includes(operation) ||
    env.TARGET_ENV !== "production" ||
    env.CONFIRM_PROJECT_REF !== PRODUCTION_PROJECT_REF ||
    safeSha(expectedHeadSha) === null ||
    expectedHeadSha !== env.GITHUB_SHA ||
    env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY ||
    base.repositoryId === null ||
    base.runId === null ||
    env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_REF_NAME !== "verdant-grow-diary"
  ) {
    artifacts.report("BLOCKED - input rejected", ["No database process was started."]);
    artifacts.audit("input_rejected");
    return EXIT.INPUT_REJECTED;
  }
  if (env.CURRENT_DEPLOY_HEAD_SHA !== expectedHeadSha) {
    artifacts.report("BLOCKED - deploy head advanced", [
      "Run a new PREFLIGHT from the current deploy head.",
    ]);
    artifacts.audit("deploy_head_advanced");
    return EXIT.DEPLOY_HEAD_ADVANCED;
  }
  const reviewedDigest = safeDigest(env.PREFLIGHT_RECEIPT_DIGEST);
  if (
    operation === "APPLY" &&
    (env.CONFIRM_APPLY !== APPLY_CONFIRMATION ||
      !reviewedDigest ||
      safePositiveIntegerText(env.PREFLIGHT_RUN_ID) === null)
  ) {
    artifacts.report("BLOCKED - APPLY confirmation rejected", ["No database process was started."]);
    artifacts.audit("input_rejected");
    return EXIT.INPUT_REJECTED;
  }
  let targetMigrations;
  try {
    targetMigrations = validateCandidateMigrationBlobs({
      candidateHeadSha: base.expectedCandidateHeadSha,
      spawnImpl,
    });
  } catch {
    artifacts.report("BLOCKED - candidate migration blobs rejected", [
      "No database process was started.",
    ]);
    artifacts.audit("candidate_blobs_rejected");
    return EXIT.MANIFEST_REJECTED;
  }
  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  if (!databaseUrl) {
    artifacts.report("BLOCKED - database secret missing");
    artifacts.audit("no_database_url");
    return EXIT.NO_DATABASE_URL;
  }
  let childEnv;
  try {
    assertSupabaseDatabaseTargetIdentity({ targetEnv: "production", databaseUrl });
    childEnv = buildPsqlEnvironment(env, databaseUrl, "production");
  } catch {
    artifacts.report("BLOCKED - production target rejected");
    artifacts.audit("target_rejected");
    return EXIT.TARGET_REJECTED;
  }
  try {
    childEnv = hardenProductionPsqlEnvironment({ sourceEnv: env, childEnv });
  } catch {
    artifacts.report("BLOCKED - production TLS rejected");
    artifacts.audit("tls_trust_rejected");
    return EXIT.TLS_TRUST_REJECTED;
  }
  const preflight = runPsqlQuery({ sql: PREFLIGHT_SQL, childEnv, spawnImpl });
  if (!preflight.ok) {
    artifacts.report("BLOCKED - preflight failed");
    artifacts.audit("preflight_failed");
    return preflight.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.PREFLIGHT_FAILED;
  }
  let state, classification, receipt;
  try {
    state = parsePreflightStdout(preflight.stdout);
    classification = classifyPreflight(state);
    receipt = buildStateReceipt({
      state,
      deployHeadSha: expectedHeadSha,
      candidatePrNumber: CANDIDATE_PR_NUMBER,
      candidateHeadSha: base.expectedCandidateHeadSha,
      targetMigrations,
      manifestSha256: loaded.sha256,
      context: base,
      authorization,
    });
  } catch {
    artifacts.report("BLOCKED - preflight result rejected");
    artifacts.audit("state_rejected");
    return EXIT.STATE_REJECTED;
  }
  if (!["apply", "verify_only"].includes(classification.status)) {
    artifacts.report("BLOCKED - ledger or catalog drift", [
      `Reason code: ${classification.reason}`,
    ]);
    artifacts.audit("state_rejected", { reason_code: classification.reason });
    return EXIT.STATE_REJECTED;
  }
  if (operation === "PREFLIGHT") {
    if (classification.status === "apply") {
      artifacts.report("PASS - SAFE_TO_RECONCILE", [
        `State-bound PREFLIGHT receipt: ${receipt.digest}`,
      ]);
      artifacts.audit("safe_to_reconcile", { receipt_digest: receipt.digest });
      artifacts.receipt(receipt);
    } else {
      artifacts.report("PASS - already applied and verified", [`State digest: ${receipt.digest}`]);
      artifacts.audit("already_applied_verified", { receipt_digest: receipt.digest });
    }
    return EXIT.OK;
  }
  if (reviewedDigest !== receipt.digest) {
    artifacts.report("BLOCKED - PREFLIGHT receipt mismatch");
    artifacts.audit("receipt_mismatch", { receipt_digest: receipt.digest });
    return EXIT.RECEIPT_MISMATCH;
  }
  if (classification.status === "verify_only") {
    artifacts.report("PASS - already applied and verified");
    artifacts.audit("already_applied_verified", { receipt_digest: receipt.digest });
    return EXIT.OK;
  }
  const temporaryRoot = mkdtempSync(
    join(env.RUNNER_TEMP || env.TEMP || env.TMP || tmpdir(), "verdant-restored-ledger-"),
  );
  const applyPath = join(temporaryRoot, "apply.sql");
  try {
    writeFileSync(applyPath, buildApplySql({ manifest: loaded.manifest, state }), {
      encoding: "utf8",
      mode: 0o600,
    });
    const applied = runPsqlFile({ path: applyPath, childEnv, spawnImpl });
    if (!applied.ok) {
      artifacts.report("FAIL - ledger transaction rolled back");
      artifacts.audit("apply_failed", { receipt_digest: receipt.digest });
      return applied.kind === "not_invocable" ? EXIT.PSQL_NOT_INVOCABLE : EXIT.APPLY_FAILED;
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
  const postflight = runPsqlQuery({ sql: buildPostflightSql(), childEnv, spawnImpl });
  if (!postflight.ok) {
    artifacts.report("FAIL - postflight unavailable");
    artifacts.audit("postflight_failed", { receipt_digest: receipt.digest });
    return EXIT.POSTFLIGHT_FAILED;
  }
  try {
    if (classifyPreflight(parsePreflightStdout(postflight.stdout)).status !== "verify_only")
      throw new Error("postflight_contract");
  } catch {
    artifacts.report("FAIL - postflight contract mismatch");
    artifacts.audit("postflight_failed", { receipt_digest: receipt.digest });
    return EXIT.POSTFLIGHT_FAILED;
  }
  artifacts.report("PASS - applied and verified", [
    "Only three exact migration-ledger rows were inserted; no application relation was read or written.",
  ]);
  artifacts.audit("applied_verified", { receipt_digest: receipt.digest });
  return EXIT.OK;
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = runRestoredHistoryLedgerReconciliation();
