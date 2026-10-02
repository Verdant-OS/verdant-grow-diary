/**
 * The protected delivery lane's read-only catalog contract. A state is
 * recoverable only when every target object is absent or all four target
 * objects exactly match the reviewed migration.
 */
import {
  ledgerColumnRowsWithNoDefaultFlag,
  ledgerConstraintRows,
} from "./supabaseMigrationLedgerShape.mjs";

export const VERSION = "20260927094000";
export const NAME = "linked_quicklog_diary_client_write_fence";
export const SHA256 = "DB09A0C9CDA6C1A1933E9C1DA919B45E1288030DD866C51529A02B9C434C8F7F";
export const FUNCTION_SOURCE_BYTES = 825;
export const FUNCTION_SOURCE_MD5 = "1dab5dbef54ce73134be90fe59d340de";
export const FUNCTION_SIGNATURE = "public.guard_linked_quicklog_diary_client_update()";
export const FUNCTION_NAME = "guard_linked_quicklog_diary_client_update";
export const TRIGGER_NAME = "guard_linked_quicklog_diary_client_update_trg";
export const INSERT_POLICY = "Linked Quick Log diary requires server insert";
export const DELETE_POLICY = "Linked Quick Log diary requires revision for delete";
export const ACCEPTED_LEDGER_NAMES = Object.freeze([NAME, `${VERSION}_${NAME}`]);
export const LEDGER_STATEMENT_MARKERS = Object.freeze([
  `-- applied verbatim by protected GitHub workflow; sha256=${SHA256}`,
  "-- protected wrapper; self-transactional-migration=true;ledger-recovery=v1",
]);
export const LEDGER_COLUMNS = Object.freeze(ledgerColumnRowsWithNoDefaultFlag());
export const LEDGER_CONSTRAINTS = Object.freeze(ledgerConstraintRows());

export const RESULT_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "ledger_exact_names",
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "diary_table_contract",
  "diary_table_oid",
  "details_column_contract",
  "photo_column_contract",
  "owner_policies_contract",
  "insert_policy_count",
  "insert_policy_contract",
  "delete_policy_count",
  "delete_policy_contract",
  "guard_function_overload_count",
  "guard_function_oid",
  "guard_function_contract",
  "guard_function_source_contract",
  "guard_trigger_count",
  "guard_trigger_contract",
]);

export const BOOLEAN_KEYS = Object.freeze([
  "ledger_statements_contract",
  "migration_ledger_contract",
  "required_roles_contract",
  "diary_table_contract",
  "details_column_contract",
  "photo_column_contract",
  "owner_policies_contract",
  "insert_policy_contract",
  "delete_policy_contract",
  "guard_function_contract",
  "guard_function_source_contract",
  "guard_trigger_contract",
]);
export const INTEGER_KEYS = Object.freeze([
  "ledger_exact_count",
  "ledger_conflict_count",
  "diary_table_oid",
  "insert_policy_count",
  "delete_policy_count",
  "guard_function_overload_count",
  "guard_function_oid",
  "guard_trigger_count",
]);
export const PREREQUISITE_KEYS = Object.freeze([
  "migration_ledger_contract",
  "required_roles_contract",
  "diary_table_contract",
  "details_column_contract",
  "photo_column_contract",
  "owner_policies_contract",
]);

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// pg_get_expr prints casts and parentheses. Removing only whitespace,
// parentheses and text casts makes the expected two-key guard independent of
// formatting while retaining every operator, key and boolean token.
const guardExpression =
  "notcoalescedetails?'linked_grow_event_id',falseandnotcoalescedetails?'grow_event_id',false";
const normalized = (field) =>
  `regexp_replace(lower(coalesce(${field},'')), '[[:space:]()]|::text', '', 'g')`;

export const CATALOG_STATE_QUERY_SQL = `with target_ledger as (
  select sm.version, sm.name, sm.statements
  from supabase_migrations.schema_migrations sm
  where sm.version = ${literal(VERSION)}
     or sm.name in (${ACCEPTED_LEDGER_NAMES.map(literal).join(", ")})
), exact_ledger as (
  select * from target_ledger
  where version = ${literal(VERSION)}
    and name in (${ACCEPTED_LEDGER_NAMES.map(literal).join(", ")})
), migration_ledger as (
  select c.* from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations'
), diary as (
  select c.* from pg_class c where c.oid = to_regclass('public.diary_entries')
), target_function as (
  select p.*, owner_role.rolname owner_name, language_row.lanname language_name
  from pg_proc p
  join pg_roles owner_role on owner_role.oid = p.proowner
  join pg_language language_row on language_row.oid = p.prolang
  where p.oid = to_regprocedure(${literal(FUNCTION_SIGNATURE)})
), insert_policy as (
  select pol.* from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'diary_entries'
    and pol.policyname = ${literal(INSERT_POLICY)}
), delete_policy as (
  select pol.* from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'diary_entries'
    and pol.policyname = ${literal(DELETE_POLICY)}
), target_trigger as (
  select tg.* from pg_trigger tg
  join diary on diary.oid = tg.tgrelid
  where tg.tgname = ${literal(TRIGGER_NAME)}
)
select json_build_object(
  'ledger_exact_count',(select count(*)::integer from exact_ledger),
  'ledger_conflict_count',(
    select (count(*) - (select count(*) from exact_ledger))::integer from target_ledger
  ),
  'ledger_exact_names',coalesce((select json_agg(name order by name) from exact_ledger),'[]'::json),
  'ledger_statements_contract',coalesce((select statements = array[
    ${LEDGER_STATEMENT_MARKERS.map(literal).join(", ")}
  ]::text[] from exact_ledger),false),
  'migration_ledger_contract',coalesce((
    select ledger.relkind = 'r'
      and ledger.relpersistence = 'p'
      and not ledger.relispartition
      and not ledger.relrowsecurity
      and not ledger.relforcerowsecurity
      and owner_role.rolname = 'postgres'
      and current_user = 'postgres'
      and coalesce((
        select array_agg(format('%s|%s|%s|%s|%s|%s|%s',a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,d.oid is null) order by a.attnum) = array[
          ${LEDGER_COLUMNS.map(literal).join(",")}
        ]::text[]
        from pg_attribute a
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid = ledger.oid and a.attnum > 0 and not a.attisdropped
      ),false)
      and coalesce((select array_agg(
        format('%s|%s|%s|%s|%s|%s',conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid,true))
        order by conname
      ) = array[${LEDGER_CONSTRAINTS.map(literal).join(",")}]::text[]
      from pg_constraint where conrelid=ledger.oid),false)
      and not exists(select 1 from pg_trigger where tgrelid=ledger.oid and not tgisinternal)
      and not exists(select 1 from pg_rewrite where ev_class=ledger.oid)
      and not exists(select 1 from pg_inherits where inhrelid=ledger.oid or inhparent=ledger.oid)
      and has_table_privilege(current_user,ledger.oid,'SELECT,INSERT')
    from migration_ledger ledger
    join pg_roles owner_role on owner_role.oid=ledger.relowner
  ),false),
  'required_roles_contract',coalesce((
    select count(*)=4 and bool_and(case
      when rolname='postgres' then oid=current_user::regrole
      when rolname='service_role' then
        not rolsuper and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and rolbypassrls
      else
        not rolsuper and not rolcreaterole and not rolcreatedb
        and not rolcanlogin and not rolreplication and not rolbypassrls end)
    from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
  ),false),
  'diary_table_contract',coalesce((
    select c.relkind='r' and c.relpersistence='p' and not c.relispartition
      and c.relrowsecurity and owner_role.rolname='postgres'
      and not exists(select 1 from pg_inherits where inhrelid=c.oid or inhparent=c.oid)
      and not exists(select 1 from pg_rewrite where ev_class=c.oid)
    from diary c join pg_roles owner_role on owner_role.oid=c.relowner
  ),false),
  'diary_table_oid',coalesce((select oid::bigint from diary),0),
  'details_column_contract',coalesce((
    select count(*)=1 and bool_and(a.atttypid='jsonb'::regtype and a.attgenerated=''
      and a.attidentity='')
    from pg_attribute a join diary on diary.oid=a.attrelid
    where a.attname='details' and a.attnum>0 and not a.attisdropped
  ),false),
  'photo_column_contract',coalesce((
    select count(*)=1 and bool_and(a.atttypid='text'::regtype and a.attgenerated=''
      and a.attidentity='')
    from pg_attribute a join diary on diary.oid=a.attrelid
    where a.attname='photo_url' and a.attnum>0 and not a.attisdropped
  ),false),
  'owner_policies_contract',(
    select count(*)=3 from (values
      ('Users insert own entries','INSERT'),
      ('Users update own entries','UPDATE'),
      ('Users delete own entries','DELETE')
    ) required(name,command)
    where exists(select 1 from pg_policies pol
      where pol.schemaname='public' and pol.tablename='diary_entries'
        and pol.policyname=required.name and pol.cmd=required.command)
  ),
  'insert_policy_count',(select count(*)::integer from insert_policy),
  'insert_policy_contract',coalesce((
    select pol.cmd='INSERT' and pol.permissive='RESTRICTIVE'
      and pol.roles=array['authenticated']::name[]
      and pol.qual is null
      and ${normalized("pol.with_check")}=${literal(guardExpression)}
    from insert_policy pol
  ),false),
  'delete_policy_count',(select count(*)::integer from delete_policy),
  'delete_policy_contract',coalesce((
    select pol.cmd='DELETE' and pol.permissive='RESTRICTIVE'
      and pol.roles=array['authenticated']::name[]
      and pol.with_check is null
      and ${normalized("pol.qual")}=${literal(guardExpression)}
    from delete_policy pol
  ),false),
  'guard_function_overload_count',(
    select count(*)::integer from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=${literal(FUNCTION_NAME)}
  ),
  'guard_function_oid',coalesce((select oid::bigint from target_function),0),
  'guard_function_contract',coalesce((
    select p.prokind='f' and p.prorettype='trigger'::regtype
      and not p.proretset and p.language_name='plpgsql' and p.owner_name='postgres'
      and not p.prosecdef and not p.proisstrict and p.provolatile='v'
      and p.proparallel='u' and not p.proleakproof
      and p.pronargs=0 and p.pronargdefaults=0
      and p.proargmodes is null and p.proallargtypes is null
      and p.proargnames is null
      and p.proconfig=array['search_path=pg_catalog, pg_temp']::text[]
    from target_function p
  ),false),
  'guard_function_source_contract',coalesce((
    select octet_length(replace(p.prosrc,E'\\r',''))=${FUNCTION_SOURCE_BYTES}
      and md5(replace(p.prosrc,E'\\r',''))=${literal(FUNCTION_SOURCE_MD5)}
    from target_function p
  ),false),
  'guard_trigger_count',(select count(*)::integer from target_trigger),
  'guard_trigger_contract',coalesce((
    select not tg.tgisinternal and tg.tgenabled='O' and tg.tgtype=19
      and tg.tgqual is null and tg.tgnargs=0 and octet_length(tg.tgargs)=0
      and tg.tgattr::text='' and tg.tgparentid=0
      and tg.tgfoid=to_regprocedure(${literal(FUNCTION_SIGNATURE)})
    from target_trigger tg
  ),false)
)`;

export const PREFLIGHT_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, pg_temp;
${CATALOG_STATE_QUERY_SQL};
`;
