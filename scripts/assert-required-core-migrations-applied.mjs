#!/usr/bin/env node
/**
 * Read-only deploy gate for Verdant's required core schema.
 *
 * Security properties:
 * - the selected environment is mapped to a pinned Supabase project ref;
 * - the URL identity is proven before psql is invoked;
 * - ambient PG* and DATABASE_URL fallbacks are ignored;
 * - the identity-checked connection is provided through discrete child-process
 *   libpq variables, never through argv;
 * - raw psql stderr and connection strings are never printed or persisted;
 * - only ordinary and partitioned public relations satisfy a requirement.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hardenProductionPsqlEnvironment } from "./lib/productionSupabaseTls.mjs";
import {
  assertSupabaseDatabaseTargetIdentity,
  buildLibpqConnectionEnvironment,
  databaseTargetForEnvironment,
  sanitizeSupabaseDatabaseUrlForPsql,
  SupabaseDatabaseTargetIdentityError,
} from "./lib/supabaseDatabaseTargetIdentity.mjs";
import {
  EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS,
  QUICKLOG_CATALOG_SEARCH_PATH_SQL,
  QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL,
  QUICKLOG_DIARY_RETRACTED_INDEX_CONTRACT_EXPRESSION_SQL,
  QUICKLOG_TARGET_FUNCTION_SECURITY_CONTRACT_EXPRESSION_SQL,
  QUICKLOG_TARGET_INDEXES_CONTRACT_EXPRESSION_SQL,
} from "./apply-quicklog-corrections-retractions.mjs";
import {
  manifestForScope,
  QUICKLOG_CORRECTIONS_CATALOG_CONTRACT,
  schemaKey,
} from "./required-core-migrations.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  MISSING_COLUMNS: 1,
  MALFORMED_MANIFEST: 2,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  SCHEMA_QUERY_FAILED: 5,
  TARGET_IDENTITY_INVALID: 6,
  QUICKLOG_CATALOG_CONTRACT_FAILED: 7,
  TLS_TRUST_REJECTED: 8,
});

const QUICKLOG_CATALOG_CONTRACT_KEYS = Object.freeze([
  "authenticated_role_contract",
  "app_role_contract",
  "auth_uid_contract",
  "has_role_contract",
  "user_roles_contract",
  "quicklog_try_parse_uuid_contract",
  "gen_random_uuid_contract",
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
  "manual_delegate_contract",
  "target_acl_contract",
  "client_access_contract",
]);

const QUICKLOG_CATALOG_FAILURE_KEYS = new Set([
  ...QUICKLOG_CATALOG_CONTRACT_KEYS,
  "catalog_result_malformed",
]);

const quickLogFunctionFingerprintValues = Object.entries(EXPECTED_FUNCTION_DEFINITION_FINGERPRINTS)
  .map(
    ([name, value]) =>
      `('${name}', '${value.md5}', ${value.bytes}, '${value.prosrcMd5}', ${value.prosrcBytes})`,
  )
  .join(",\n      ");

/**
 * Catalog-only Quick Log schema-effect proof. This deliberately does not read
 * supabase_migrations.schema_migrations: the least-privilege sandbox verifier
 * can prove RLS/ACL/function safety without being granted migration-ledger row
 * access. Migration-ledger state is reported separately as NOT_MEASURED.
 */
export const QUICKLOG_CORRECTIONS_CATALOG_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
set local search_path = ${QUICKLOG_CATALOG_SEARCH_PATH_SQL};
with target as (
  select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'quicklog_entry_revisions'
), expected_functions(name, definition_md5, definition_bytes, prosrc_md5, prosrc_bytes) as (
  values
      ${quickLogFunctionFingerprintValues}
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
), manual_contract_function_ids(kind, oid) as (
  values
    (
      'wrapper',
      to_regprocedure(
        'public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'
      )
    ),
    (
      'delegate',
      to_regprocedure(
        'public.quicklog_save_manual_pre_logged_at(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'
      )
    )
), manual_contract_functions as (
  select ids.kind, p.*, r.rolname as owner_name, l.lanname,
         md5(translate(p.prosrc, chr(13), '')) as normalized_prosrc_md5,
         length(translate(p.prosrc, chr(13), '')) as normalized_prosrc_bytes
  from manual_contract_function_ids ids
  join pg_proc p on p.oid = ids.oid
  join pg_roles r on r.oid = p.proowner
  join pg_language l on l.oid = p.prolang
), manual_helper_function_ids(
  signature, function_name, return_type, security_definer, is_strict,
  volatility, argument_count, argument_names, function_config,
  source_bytes, source_md5
) as (
  values
    (
      'public.quicklog_try_parse_logged_at(text)', 'quicklog_try_parse_logged_at',
      'timestamp with time zone'::regtype, false, true, 'i', 1,
      array['p_value']::text[], array['search_path=pg_catalog, pg_temp']::text[],
      414, '77f1aa70a70a9714057ef226b6996149'
    ),
    (
      'public.quicklog_try_parse_uuid(text)', 'quicklog_try_parse_uuid',
      'uuid'::regtype, false, true, 'i', 1,
      array['p_value']::text[], array['search_path=pg_catalog, pg_temp']::text[],
      289, 'a34d120aad5c37a33ac05fd9597624f4'
    ),
    (
      'public.quicklog_stamp_diary_logged_at()', 'quicklog_stamp_diary_logged_at',
      'trigger'::regtype, true, false, 'v', 0,
      null::text[], array['search_path=public, pg_temp']::text[],
      276, 'd9df46d36eb5d7aac767a3c87e53e92f'
    ),
    (
      'public.quicklog_stamp_grow_event_logged_at()', 'quicklog_stamp_grow_event_logged_at',
      'trigger'::regtype, true, false, 'v', 0,
      null::text[], array['search_path=public, pg_temp']::text[],
      276, 'd9df46d36eb5d7aac767a3c87e53e92f'
    )
), manual_helper_functions as (
  select expected.*, p.*, r.rolname as owner_name, l.lanname,
         case expected.function_name
           when 'quicklog_try_parse_uuid' then md5(p.prosrc)
           else md5(translate(p.prosrc, chr(13), ''))
         end as normalized_prosrc_md5,
         case expected.function_name
           when 'quicklog_try_parse_uuid' then length(p.prosrc)
           else length(translate(p.prosrc, chr(13), ''))
         end as normalized_prosrc_bytes
  from manual_helper_function_ids expected
  join pg_proc p on p.oid = to_regprocedure(expected.signature)
  join pg_roles r on r.oid = p.proowner
  join pg_language l on l.oid = p.prolang
)
select json_build_object(
${QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL},
  'target_table_contract', coalesce((
    select t.relkind = 'r' and t.relpersistence = 'p' and not t.relispartition
      and not t.relhassubclass
      and not exists (select 1 from pg_inherits i where i.inhparent = t.oid)
      and t.relrowsecurity and not t.relforcerowsecurity and r.rolname = 'postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s', a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, coalesce(pg_get_expr(d.adbin,d.adrelid),''), a.attnum) order by a.attnum) = array[
          'id|uuid|t|gen_random_uuid()|1','grow_event_id|uuid|f||2','diary_entry_id|uuid|f||3',
          'root_id|uuid|t||4','user_id|uuid|t||5','actor_id|uuid|t||6',
          'revision_no|integer|t||7','kind|text|t||8','reason_code|text|t||9',
          'reason_note|text|f||10','previous_state|jsonb|t|''{}''::jsonb|11',
          'new_state|jsonb|f||12','created_at|timestamp with time zone|t|now()|13'
        ]::text[]
        from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      ), false)
    from target t join pg_roles r on r.oid = t.relowner
  ), false),
  'retracted_at_contract', coalesce((
    select format_type(a.atttypid,a.atttypmod) = 'timestamp with time zone'
      and not a.attnotnull and d.oid is null
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = to_regclass('public.diary_entries') and a.attname = 'retracted_at'
      and a.attnum > 0 and not a.attisdropped
  ), false),
  'target_constraints_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s|%s|%s', conname, contype, convalidated, condeferrable, condeferred, pg_get_constraintdef(oid,true)) order by conname) = array[
      'quicklog_entry_revisions_diary_entry_id_fkey|f|t|f|f|FOREIGN KEY (diary_entry_id) REFERENCES diary_entries(id) ON DELETE SET NULL',
      'quicklog_entry_revisions_grow_event_id_fkey|f|t|f|f|FOREIGN KEY (grow_event_id) REFERENCES grow_events(id) ON DELETE SET NULL',
      'quicklog_entry_revisions_kind_check|c|t|f|f|CHECK (kind = ANY (ARRAY[''correction''::text, ''retraction''::text]))',
      'quicklog_entry_revisions_pkey|p|t|f|f|PRIMARY KEY (id)',
      'quicklog_entry_revisions_reason_code_check|c|t|f|f|CHECK (reason_code = ANY (ARRAY[''wrong_plant''::text, ''wrong_tent''::text, ''wrong_time''::text, ''typo''::text, ''wrong_value''::text, ''duplicate''::text, ''test_entry''::text, ''accidental''::text, ''other''::text]))',
      'quicklog_entry_revisions_reason_note_check|c|t|f|f|CHECK (reason_note IS NULL OR char_length(reason_note) <= 500)',
      'quicklog_entry_revisions_revision_no_check|c|t|f|f|CHECK (revision_no >= 1)'
    ]::text[] from pg_constraint where conrelid = to_regclass('public.quicklog_entry_revisions')
  ), false),
  'target_indexes_contract', ${QUICKLOG_TARGET_INDEXES_CONTRACT_EXPRESSION_SQL},
  'diary_retracted_index_contract', ${QUICKLOG_DIARY_RETRACTED_INDEX_CONTRACT_EXPRESSION_SQL},
  'target_policies_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s|%s|%s', p.polname, p.polcmd, p.polpermissive, roles.names, coalesce(pg_get_expr(p.polqual,p.polrelid),''), coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) order by p.polname) = array[
      'Operators view all quicklog revisions|r|t|authenticated|has_role(auth.uid(), ''operator''::app_role)|',
      'Users view own quicklog revisions|r|t|authenticated|(auth.uid() = user_id)|'
    ]::text[]
    from pg_policy p
    cross join lateral (select string_agg(r.rolname, ',' order by r.rolname) names from unnest(p.polroles) role_oid join pg_roles r on r.oid = role_oid) roles
    where p.polrelid = to_regclass('public.quicklog_entry_revisions')
  ), false),
  'target_triggers_rules_contract',
    exists(select 1 from target)
    and not exists(select 1 from pg_trigger where tgrelid = to_regclass('public.quicklog_entry_revisions') and not tgisinternal)
    and not exists(select 1 from pg_rewrite where ev_class = to_regclass('public.quicklog_entry_revisions')),
  'target_functions_contract', coalesce((
    select count(*) = 5 and bool_and(
      o.definition_md5 = e.definition_md5 and o.definition_bytes = e.definition_bytes
      and o.prosrc_md5 = e.prosrc_md5 and o.prosrc_bytes = e.prosrc_bytes
      and o.owner_name = 'postgres' and o.proconfig = array['search_path=public, pg_temp']::text[]
      and case e.name
        when 'quicklog_revision_sibling_env_ids' then o.lanname = 'sql' and o.provolatile = 's' and o.prosecdef
        when 'quicklog_revision_rebase_captured_at' then o.lanname = 'plpgsql' and o.provolatile = 'i' and not o.prosecdef
        else o.lanname = 'plpgsql' and o.provolatile = 'v' and o.prosecdef
      end
    ) from expected_functions e join observed_functions o on o.proname = e.name
  ), false),
  'target_function_overloads_contract', (select count(*) = 5 from observed_functions)
    and to_regprocedure('public.quicklog_revision_resolve_root(uuid,uuid,uuid)') is not null
    and to_regprocedure('public.quicklog_revision_sibling_env_ids(uuid,public.grow_events)') is not null
    and to_regprocedure('public.quicklog_revision_rebase_captured_at(jsonb,timestamptz,timestamptz)') is not null
    and to_regprocedure('public.quicklog_retract_entry(text,uuid,uuid,text)') is not null
    and to_regprocedure('public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)') is not null,
  'target_function_security_contract', ${QUICKLOG_TARGET_FUNCTION_SECURITY_CONTRACT_EXPRESSION_SQL},
  'manual_delegate_contract', coalesce((
    select count(*) = 2
      and bool_and(
        f.prokind = 'f'
        and f.prorettype = 'jsonb'::regtype
        and not f.proretset
        and f.lanname = 'plpgsql'
        and f.provolatile = 'v'
        and f.prosecdef
        and not f.proisstrict
        and not f.proleakproof
        and f.proparallel = 'u'
        and f.pronargs = 12
        and f.pronargdefaults = 9
        and pg_get_function_arguments(f.oid) = 'p_target_type text, p_target_id uuid, p_action text, p_volume_ml numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_temperature_c numeric DEFAULT NULL::numeric, p_humidity_pct numeric DEFAULT NULL::numeric, p_vpd_kpa numeric DEFAULT NULL::numeric, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_details jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text'
        and f.proargnames = array[
          'p_target_type','p_target_id','p_action','p_volume_ml','p_note',
          'p_temperature_c','p_humidity_pct','p_vpd_kpa','p_occurred_at',
          'p_details','p_idempotency_key','p_stage'
        ]::text[]
        and f.proconfig = array['search_path=public, pg_temp']::text[]
        and f.owner_name = 'postgres'
      )
      and count(*) filter (
        where f.kind = 'wrapper'
          and f.normalized_prosrc_md5 = '0d3098b81787fa90898da921345c0dbc'
          and f.normalized_prosrc_bytes = 7752
      ) = 1
      and count(*) filter (
        where f.kind = 'delegate'
          and f.normalized_prosrc_md5 = '7ec296e422f7f47c8b2793b051840798'
          and f.normalized_prosrc_bytes = 6734
      ) = 1
      and (
        select wrapper.proowner
        from manual_contract_functions wrapper
        where wrapper.kind = 'wrapper'
      ) = (
        select delegate.proowner
        from manual_contract_functions delegate
        where delegate.kind = 'delegate'
      )
      and (
        select count(*) = 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'quicklog_save_manual_pre_logged_at'
      )
      and (
        select count(*) = 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'quicklog_save_manual'
      )
      and coalesce((
        select array_agg(
          format(
            '%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type, acl.is_grantable, grantor.rolname
          )
          order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
        ) = array[
          'authenticated|EXECUTE|f|postgres',
          'postgres|EXECUTE|f|postgres',
          'service_role|EXECUTE|f|postgres'
        ]::text[]
        from manual_contract_functions wrapper
        cross join lateral aclexplode(
          coalesce(wrapper.proacl, acldefault('f', wrapper.proowner))
        ) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        join pg_roles grantor on grantor.oid = acl.grantor
        where wrapper.kind = 'wrapper'
      ), false)
      and coalesce((
        select array_agg(
          format(
            '%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type, acl.is_grantable, grantor.rolname
          )
          order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
        ) = array['postgres|EXECUTE|f|postgres']::text[]
        from manual_contract_functions delegate
        cross join lateral aclexplode(
          coalesce(delegate.proacl, acldefault('f', delegate.proowner))
        ) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        join pg_roles grantor on grantor.oid = acl.grantor
        where delegate.kind = 'delegate'
      ), false)
      and not exists (
        select 1
        from manual_contract_functions delegate
        cross join lateral aclexplode(
          coalesce(delegate.proacl, acldefault('f', delegate.proowner))
        ) acl
        where delegate.kind = 'delegate'
          and acl.privilege_type = 'EXECUTE'
          and acl.grantee <> delegate.proowner
      )
      and (
        select count(*) = 4
          and bool_and(
            helper.prokind = 'f'
            and helper.proname = helper.function_name
            and not helper.proretset
            and helper.prorettype = helper.return_type
            and helper.lanname = 'plpgsql'
            and helper.owner_name = 'postgres'
            and helper.prosecdef = helper.security_definer
            and helper.proisstrict = helper.is_strict
            and not helper.proleakproof
            and helper.provolatile::text = helper.volatility
            and helper.proparallel = 'u'
            and helper.pronargs = helper.argument_count
            and helper.pronargdefaults = 0
            and helper.proargmodes is null
            and helper.proallargtypes is null
            and helper.proargnames is not distinct from helper.argument_names
            and helper.proconfig = helper.function_config
            and (
              (
                helper.normalized_prosrc_bytes = helper.source_bytes
                and helper.normalized_prosrc_md5 = helper.source_md5
              )
              or (
                helper.function_name = 'quicklog_try_parse_uuid'
                and helper.normalized_prosrc_bytes = 290
                and helper.normalized_prosrc_md5 = '4b132ee2034f8e2887da1af582295ad8'
              )
            )
            and coalesce((
              select array_agg(
                format(
                  '%s|%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'),
                  acl.privilege_type, acl.is_grantable, grantor.rolname
                )
                order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
              ) = array['postgres|EXECUTE|f|postgres']::text[]
              from aclexplode(
                coalesce(helper.proacl, acldefault('f', helper.proowner))
              ) acl
              left join pg_roles grantee on grantee.oid = acl.grantee
              join pg_roles grantor on grantor.oid = acl.grantor
            ), false)
            and not has_function_privilege('anon', helper.oid, 'EXECUTE')
            and not has_function_privilege('authenticated', helper.oid, 'EXECUTE')
            and not has_function_privilege('service_role', helper.oid, 'EXECUTE')
          )
        from manual_helper_functions helper
      )
      and (
        select count(*) = 4
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'quicklog_try_parse_logged_at',
            'quicklog_try_parse_uuid',
            'quicklog_stamp_diary_logged_at',
            'quicklog_stamp_grow_event_logged_at'
          )
      )
      and not has_function_privilege(
        'anon',
        to_regprocedure('public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        to_regprocedure('public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        to_regprocedure('public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        to_regprocedure('public.quicklog_save_manual_pre_logged_at(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        to_regprocedure('public.quicklog_save_manual_pre_logged_at(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        to_regprocedure('public.quicklog_save_manual_pre_logged_at(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamp with time zone,jsonb,text,text)'),
        'EXECUTE'
      )
      and (
        select count(*) = 2
        from pg_attribute a
        where (a.attrelid, a.attname) in (
          (to_regclass('public.grow_events'), 'logged_at'),
          (to_regclass('public.diary_entries'), 'logged_at')
        )
          and a.attnum > 0
          and not a.attisdropped
          and format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
          and not a.attnotnull
          and a.atttypmod = -1
          and a.attgenerated = ''
          and a.attidentity = ''
          and not exists (
            select 1 from pg_attrdef d
            where d.adrelid = a.attrelid and d.adnum = a.attnum
          )
      )
      and exists (
        select 1
        from pg_attribute a
        where a.attrelid = to_regclass('public.quicklog_idempotency')
          and a.attname = 'request_hash'
          and a.attnum > 0
          and not a.attisdropped
          and format_type(a.atttypid, a.atttypmod) = 'text'
          and not a.attnotnull
          and a.atttypmod = -1
          and a.attgenerated = ''
          and a.attidentity = ''
          and not exists (
            select 1 from pg_attrdef d
            where d.adrelid = a.attrelid and d.adnum = a.attnum
          )
      )
      and exists (
        select 1
        from pg_trigger t
        where t.tgrelid = to_regclass('public.grow_events')
          and t.tgname = 'trg_quicklog_stamp_grow_event_logged_at'
          and not t.tgisinternal
          and t.tgenabled in ('O', 'A')
          and t.tgtype = 7
          and t.tgqual is null
          and t.tgnargs = 0
          and octet_length(t.tgargs) = 0
          and t.tgparentid = 0
          and t.tgfoid = to_regprocedure('public.quicklog_stamp_grow_event_logged_at()')
      )
      and exists (
        select 1
        from pg_trigger t
        where t.tgrelid = to_regclass('public.diary_entries')
          and t.tgname = 'trg_quicklog_stamp_diary_logged_at'
          and not t.tgisinternal
          and t.tgenabled in ('O', 'A')
          and t.tgtype = 7
          and t.tgqual is null
          and t.tgnargs = 0
          and octet_length(t.tgargs) = 0
          and t.tgparentid = 0
          and t.tgfoid = to_regprocedure('public.quicklog_stamp_diary_logged_at()')
      )
    from manual_contract_functions f
  ), false),
  'target_acl_contract', coalesce((
    select array_agg(format('%s|%s|%s|%s', coalesce(grantee.rolname,'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname) order by coalesce(grantee.rolname,'PUBLIC'), acl.privilege_type) = array[
      'authenticated|SELECT|f|postgres',
      'postgres|DELETE|f|postgres','postgres|INSERT|f|postgres','postgres|REFERENCES|f|postgres','postgres|SELECT|f|postgres','postgres|TRIGGER|f|postgres','postgres|TRUNCATE|f|postgres','postgres|UPDATE|f|postgres',
      'service_role|DELETE|f|postgres','service_role|INSERT|f|postgres','service_role|REFERENCES|f|postgres','service_role|SELECT|f|postgres','service_role|TRIGGER|f|postgres','service_role|TRUNCATE|f|postgres','service_role|UPDATE|f|postgres'
    ]::text[]
    from target t cross join lateral aclexplode(coalesce(t.relacl, acldefault('r',t.relowner))) acl
    left join pg_roles grantee on grantee.oid = acl.grantee join pg_roles grantor on grantor.oid = acl.grantor
  ), false),
  'client_access_contract', coalesce((
    select not has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and has_table_privilege('authenticated', t.oid, 'SELECT')
      and not has_table_privilege('authenticated', t.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    from target t
  ), false)
)::text;
`;

function writeTextFile(path, contents, logger) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  } catch {
    logger.error("Warning: could not write a core-schema gate artifact.");
  }
}

function buildExpected(manifest) {
  const expected = [];
  const malformed = [];
  for (const entry of manifest) {
    try {
      expected.push({
        key: schemaKey(entry),
        table: entry.table,
        column: entry.column,
        migration: entry.migration,
        present: null,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Malformed manifest entry.";
      malformed.push({
        entry: `${entry?.table ?? "(missing)"}.${entry?.column ?? "(missing)"}`,
        reason,
      });
      expected.push({
        key: null,
        table: entry?.table ?? null,
        column: entry?.column ?? null,
        migration: entry?.migration ?? null,
        present: null,
        malformed: true,
        reason,
      });
    }
  }
  return { expected, malformed };
}

export function buildPsqlEnvironment(sourceEnv, databaseUrl, targetEnv) {
  // psql needs process-location/locale basics, not the runner's full secret
  // environment. An allowlist also keeps unrelated protected-environment
  // secrets out of the child.
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
    if (typeof sourceEnv[key] === "string") {
      childEnv[key] = sourceEnv[key];
    }
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, targetEnv);
  return { ...childEnv, ...buildLibpqConnectionEnvironment(connection) };
}

export function parseQuickLogCatalogContract(stdout) {
  const lines = String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error("catalog_result_malformed");

  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("catalog_result_malformed");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("catalog_result_malformed");
  }
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...QUICKLOG_CATALOG_CONTRACT_KEYS].sort())
  ) {
    throw new Error("catalog_result_malformed");
  }
  for (const key of QUICKLOG_CATALOG_CONTRACT_KEYS) {
    if (typeof value[key] !== "boolean") throw new Error("catalog_result_malformed");
  }
  return Object.freeze({ ...value });
}

function quickLogCatalogContractFailures(result) {
  return QUICKLOG_CATALOG_CONTRACT_KEYS.filter((key) => result?.[key] !== true);
}

function createArtifactWriters({ targetEnv, reportPath, auditPath, expected, logger, now }) {
  const writeAudit = (outcome, note = "", extras = {}) => {
    if (!auditPath) return;
    const observed = expected.filter((entry) => entry.present !== null);
    const safeQuickLogFailures = Array.isArray(extras.quicklog_catalog_contract_failures)
      ? extras.quicklog_catalog_contract_failures.filter(
          (value) => typeof value === "string" && QUICKLOG_CATALOG_FAILURE_KEYS.has(value),
        )
      : null;
    const payload = {
      schema_version: 1,
      tool: "assert-required-core-migrations-applied",
      target_env: targetEnv,
      checked_at: now().toISOString(),
      outcome,
      schema_verified: outcome === "verified",
      expected_count: expected.length,
      present_count: observed.filter((entry) => entry.present === true).length,
      missing_count: observed.filter((entry) => entry.present === false).length,
      expected,
      ...(note ? { note } : {}),
      // Safe connection identity only — never credentials, never raw URL.
      ...(extras.identity
        ? {
            database_identity: {
              project_ref: extras.identity.projectRef,
              connection_mode: extras.identity.connectionMode,
              hostname: extras.identity.hostname,
              port: extras.identity.port,
            },
          }
        : {}),
      ...(typeof extras.psql_status === "number" || typeof extras.psql_status === "string"
        ? { psql_status: Number(extras.psql_status) }
        : {}),
      ...(typeof extras.quicklog_catalog_contract_verified === "boolean"
        ? {
            quicklog_catalog_contract_verified: extras.quicklog_catalog_contract_verified,
            quicklog_catalog_contract_failures: safeQuickLogFailures ?? [],
          }
        : {}),
      ...(extras.migration_ledger_status === "not_measured"
        ? { migration_ledger_status: "not_measured" }
        : {}),
    };
    writeTextFile(auditPath, `${JSON.stringify(payload, null, 2)}\n`, logger);
  };

  const writeReport = (status, lines) => {
    if (!reportPath) return;
    const safeTarget = targetEnv === "sandbox" ? "SANDBOX" : "PRODUCTION";
    writeTextFile(
      reportPath,
      [
        `### Core-schema deploy guard - ${safeTarget}`,
        "",
        `**Status:** ${status}`,
        "",
        ...lines,
        "",
      ].join("\n"),
      logger,
    );
  };

  return { writeAudit, writeReport };
}

export function runRequiredCoreMigrationsApplied({
  env = process.env,
  spawnImpl = spawnSync,
  logger = console,
  now = () => new Date(),
} = {}) {
  const targetEnv = env.TARGET_ENV ?? "";
  const databaseUrl = env.SUPABASE_DB_URL ?? "";
  const reportPath = env.REPORT_PATH ?? "";
  const auditPath = env.AUDIT_PATH ?? "";

  let manifest;
  try {
    manifest = manifestForScope(env.MANIFEST_SCOPE);
  } catch {
    logger.error("Core-schema manifest scope is invalid.");
    return EXIT.MALFORMED_MANIFEST;
  }
  const requiresQuickLogCatalogContract = manifest.some(
    (entry) => entry.catalogContract === QUICKLOG_CORRECTIONS_CATALOG_CONTRACT,
  );

  const { expected, malformed } = buildExpected(manifest);
  const { writeAudit, writeReport } = createArtifactWriters({
    targetEnv,
    reportPath,
    auditPath,
    expected,
    logger,
    now,
  });

  if (malformed.length > 0) {
    logger.error(`Core-schema manifest contains ${malformed.length} malformed identifier(s).`);
    for (const item of malformed) {
      logger.error(`  ${item.entry}: ${item.reason}`);
    }
    writeReport("FAILED - malformed manifest", [
      "The manifest contains invalid Postgres identifiers. No database query ran.",
    ]);
    writeAudit("malformed_manifest", "Manifest validation failed before psql.");
    return EXIT.MALFORMED_MANIFEST;
  }

  try {
    databaseTargetForEnvironment(targetEnv);
  } catch {
    logger.error("TARGET_ENV must be exactly sandbox or production.");
    writeAudit("target_identity_invalid", "Unknown or missing target environment.");
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  if (!databaseUrl) {
    logger.error("SUPABASE_DB_URL is required; ambient DATABASE_URL and PG* are ignored.");
    writeReport("FAILED - database connection missing", [
      "The protected environment did not provide `SUPABASE_DB_URL`.",
      "No database query ran.",
    ]);
    writeAudit("no_db_connection", "SUPABASE_DB_URL was not configured.");
    return EXIT.NO_DB_CONNECTION;
  }

  let identity;
  try {
    identity = assertSupabaseDatabaseTargetIdentity({
      targetEnv,
      databaseUrl,
    });
  } catch (error) {
    const code =
      error instanceof SupabaseDatabaseTargetIdentityError
        ? error.code
        : "identity_validation_failed";
    logger.error(`Database target identity rejected (${code}).`);
    writeReport("FAILED - database identity rejected", [
      "The configured URL does not prove that it targets the pinned Verdant project.",
      "No database query ran. Correct the protected environment secret; do not apply migrations.",
    ]);
    writeAudit("target_identity_invalid", `Identity validation failed: ${code}.`);
    return EXIT.TARGET_IDENTITY_INVALID;
  }

  logger.log(`Database identity verified for ${targetEnv} (${identity.connectionMode}).`);

  const keyList = expected.map((entry) => `'${entry.key}'`).join(",");
  const tableList = [...new Set(expected.map((entry) => entry.table))]
    .map((table) => `'${table}'`)
    .join(",");

  // Only real and partitioned tables qualify. Views, materialized views,
  // foreign tables, indexes, and sequences must never satisfy a core contract.
  const relationKinds = "'r','p'";
  const sql =
    "SELECT c.relname || '.' || a.attname " +
    "FROM pg_catalog.pg_attribute a " +
    "JOIN pg_catalog.pg_class c ON c.oid = a.attrelid " +
    "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    `WHERE n.nspname = 'public' AND c.relkind IN (${relationKinds}) ` +
    "AND a.attnum > 0 AND NOT a.attisdropped " +
    `AND c.relname || '.' || a.attname IN (${keyList});`;
  const diagnosticSql =
    "SELECT c.relname FROM pg_catalog.pg_class c " +
    "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    `WHERE n.nspname = 'public' AND c.relkind IN (${relationKinds}) ` +
    `AND c.relname IN (${tableList});`;

  const psqlArgs = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
  let childEnv = buildPsqlEnvironment(env, databaseUrl, targetEnv);
  if (targetEnv === "production") {
    try {
      childEnv = hardenProductionPsqlEnvironment({ sourceEnv: env, childEnv });
    } catch {
      logger.error("Production database TLS trust was rejected.");
      writeReport("FAILED - production TLS trust rejected", [
        "No database query ran.",
        "Repair the protected production CA secret before dispatching this verifier again.",
      ]);
      writeAudit("tls_trust_rejected", "Production CA validation failed before psql.");
      return EXIT.TLS_TRUST_REJECTED;
    }
  }

  let result;
  try {
    result = spawnImpl("psql", psqlArgs, {
      encoding: "utf8",
      env: childEnv,
    });
  } catch {
    result = { error: new Error("psql invocation failed") };
  }

  if (result.error) {
    logger.error("psql is not invocable on this runner. No schema verdict was reached.");
    writeReport("FAILED - psql unavailable", ["Install `postgresql-client` and re-run the gate."]);
    writeAudit("psql_not_invocable", "psql could not be invoked.", { identity });
    return EXIT.PSQL_NOT_INVOCABLE;
  }
  if (result.status !== 0) {
    // Never print result.stderr: libpq errors and hostile test shims can echo
    // the full connection URI, including its password.
    logger.error(
      `psql exited ${String(result.status)} while reading pg_catalog; stderr was suppressed.`,
    );
    // The exit STATUS is a small integer with no credential content, so it is
    // safe to publish while stderr stays suppressed. Without it this failure
    // is undiagnosable: psql also exits non-zero when it cannot connect at
    // all, which is indistinguishable from a rejected query in the report.
    // libpq/psql convention: 1 = psql's own fatal error, 2 = the connection to
    // the server went bad in a noninteractive session, 3 = script error under
    // ON_ERROR_STOP.
    //
    // Status 2 deliberately does NOT claim the query never ran. psql returns it
    // both when the connection was never established and when an established
    // session dropped mid-query, and those are indistinguishable from the exit
    // code alone. Asserting "never ran" would steer an operator straight at
    // host/port config when the real fault could be a server-side termination.
    const psqlStatus = String(result.status);
    const statusHint =
      result.status === 2
        ? "psql status 2 means the CONNECTION to the server went bad — either it was never established, or an established session was lost. The exit code alone cannot distinguish those, so this gate reached no verdict on the schema either way. Treat reachability and credentials for the target as the first suspects rather than schema drift; note GitHub-hosted runners are IPv4-only, so a direct db.<ref>.supabase.co host may need the pooler host instead. Owner fix: refresh environment secret SUPABASE_DB_URL_SANDBOX (or SUPABASE_DB_URL for production) in Settings → Environments with a current Session/Transaction pooler URI for the pinned project, then re-run the workflow."
        : result.status === 3
          ? "psql status 3 means the SQL was rejected under ON_ERROR_STOP — the connection itself succeeded."
          : "psql reported its own fatal error before a verdict was reached.";
    writeReport("FAILED - schema query failed", [
      "The target schema remains unknown. Raw psql stderr was suppressed to protect credentials.",
      `psql exit status: ${psqlStatus}.`,
      `Pinned project: ${identity.projectRef} (${identity.connectionMode} @ ${identity.hostname}:${identity.port}).`,
      statusHint,
    ]);
    writeAudit("schema_query_failed", `psql returned a non-zero status (${psqlStatus}).`, {
      identity,
      psql_status: result.status,
    });
    return EXIT.SCHEMA_QUERY_FAILED;
  }

  const present = new Set(
    String(result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  for (const entry of expected) entry.present = present.has(entry.key);
  const missing = expected.filter((entry) => entry.present === false);

  if (missing.length > 0) {
    let tablesPresent = null;
    try {
      const diagnostic = spawnImpl(
        "psql",
        ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", diagnosticSql],
        { encoding: "utf8", env: childEnv },
      );
      if (!diagnostic.error && diagnostic.status === 0) {
        tablesPresent = String(diagnostic.stdout ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
    } catch {
      tablesPresent = null;
    }

    const requiredTables = [...new Set(expected.map((entry) => entry.table))];
    const tablesAbsent =
      tablesPresent === null
        ? null
        : requiredTables.filter((table) => !tablesPresent.includes(table));

    logger.error(
      `${missing.length} of ${expected.length} required ${env.MANIFEST_SCOPE === "advisory" ? "advisory" : "core"} column(s) are missing.`,
    );
    for (const entry of missing) {
      logger.error(`  ${entry.key} <- supabase/migrations/${entry.migration}`);
    }

    writeReport(`FAILED - ${missing.length} required column(s) missing`, [
      "| Column | Supplied by |",
      "| --- | --- |",
      ...missing.map(
        (entry) => `| \`${entry.key}\` | \`supabase/migrations/${entry.migration}\` |`,
      ),
      "",
      tablesAbsent === null
        ? "The table-presence diagnostic did not complete."
        : `Required tables absent: ${tablesAbsent.join(", ") || "(none)"}.`,
    ]);
    writeAudit(
      "missing_columns",
      tablesAbsent === null
        ? "Table-presence diagnostic unavailable."
        : `Required tables absent: ${tablesAbsent.join(", ") || "(none)"}.`,
    );
    return EXIT.MISSING_COLUMNS;
  }

  if (requiresQuickLogCatalogContract) {
    let catalogResult;
    try {
      catalogResult = spawnImpl(
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
          QUICKLOG_CORRECTIONS_CATALOG_SQL,
        ],
        { encoding: "utf8", env: childEnv },
      );
    } catch {
      catalogResult = { error: new Error("psql invocation failed") };
    }

    if (catalogResult.error) {
      logger.error(
        "psql is not invocable for the exact Quick Log catalog check. No schema verdict was reached.",
      );
      writeReport("FAILED - psql unavailable", [
        "All required columns were observed, but the exact Quick Log catalog contract was not checked.",
        "Migration ledger: `NOT_MEASURED` by this catalog-only gate.",
        "Install `postgresql-client` and re-run the gate.",
      ]);
      writeAudit("psql_not_invocable", "Quick Log catalog psql could not be invoked.", {
        identity,
        quicklog_catalog_contract_verified: false,
        migration_ledger_status: "not_measured",
      });
      return EXIT.PSQL_NOT_INVOCABLE;
    }

    if (catalogResult.status !== 0) {
      const psqlStatus = String(catalogResult.status);
      logger.error(
        `psql exited ${psqlStatus} while checking the exact Quick Log catalog contract; stderr was suppressed.`,
      );
      writeReport("FAILED - Quick Log catalog query failed", [
        "All required columns were observed, but the exact Quick Log schema effect remains unknown.",
        "Raw psql stderr was suppressed to protect credentials.",
        `psql exit status: ${psqlStatus}.`,
        "Migration ledger: `NOT_MEASURED` by this catalog-only gate.",
      ]);
      writeAudit(
        "schema_query_failed",
        `Quick Log catalog psql returned a non-zero status (${psqlStatus}).`,
        {
          identity,
          psql_status: catalogResult.status,
          quicklog_catalog_contract_verified: false,
          migration_ledger_status: "not_measured",
        },
      );
      return EXIT.SCHEMA_QUERY_FAILED;
    }

    let catalogContract;
    let catalogFailures;
    try {
      catalogContract = parseQuickLogCatalogContract(catalogResult.stdout);
      catalogFailures = quickLogCatalogContractFailures(catalogContract);
    } catch {
      catalogFailures = ["catalog_result_malformed"];
    }

    if (catalogFailures.length > 0) {
      logger.error(`Exact Quick Log catalog contract failed (${catalogFailures.join(", ")}).`);
      writeReport("FAILED - Quick Log catalog contract mismatch", [
        "All required columns were observed, but the exact Quick Log schema effect was not proven.",
        `Failed catalog checks: ${catalogFailures.map((key) => `\`${key}\``).join(", ")}.`,
        "Migration ledger: `NOT_MEASURED` by this catalog-only gate.",
      ]);
      writeAudit(
        "quicklog_catalog_contract_failed",
        "Required Quick Log catalog checks did not match the pinned schema effect.",
        {
          identity,
          quicklog_catalog_contract_verified: false,
          quicklog_catalog_contract_failures: catalogFailures,
          migration_ledger_status: "not_measured",
        },
      );
      return EXIT.QUICKLOG_CATALOG_CONTRACT_FAILED;
    }
  }

  logger.log(
    requiresQuickLogCatalogContract
      ? `All ${expected.length} required core columns and the exact Quick Log catalog contract are verified in ${targetEnv}.`
      : `All ${expected.length} required ${env.MANIFEST_SCOPE === "advisory" ? "advisory" : "core"} columns are present in ${targetEnv}.`,
  );
  writeReport("PASSED", [
    `All ${expected.length} required columns are present.`,
    ...(requiresQuickLogCatalogContract
      ? [
          "The exact Quick Log catalog contract is verified.",
          "Migration ledger: `NOT_MEASURED` by this catalog-only gate.",
        ]
      : []),
    `Connection mode: \`${identity.connectionMode}\`.`,
  ]);
  writeAudit(
    "verified",
    "",
    requiresQuickLogCatalogContract
      ? {
          identity,
          quicklog_catalog_contract_verified: true,
          quicklog_catalog_contract_failures: [],
          migration_ledger_status: "not_measured",
        }
      : {},
  );
  return EXIT.OK;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runRequiredCoreMigrationsApplied();
}
