import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_NAME = "20260728163100_production_breeding_workflow_reconciliation.sql";
const HISTORICAL_NAME = "20260707120000_breeding_workflow_v1.sql";
const HISTORICAL_LF_SHA256 = "205e3bfdced7625ab500d09d4284ba38fd86970cc2422a0faa05f8eee3b29174";
const LATEST_ACTION_POLICY_FINGERPRINT = "4d4741c455cf307f3e4909041c9d85d7";
const RECONCILED_ACTION_POLICY_FINGERPRINT = "e08f43c1f4e1308a8d50e6cab797f933";
const RECONCILED_ACTION_POLICY_SQL_SHA256 =
  "a22b295a5f5c6388aa23a264d90b0593fde971f661280fbe71fb61923fd48c04";
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const migrationPath = resolve(MIGRATIONS_DIR, MIGRATION_NAME);
const rawSql = readFileSync(migrationPath, "utf8");
const sql = rawSql.replace(/\r\n?/g, "\n");
const flat = sql.replace(/\s+/g, " ");

function lfSha256(path: string): string {
  const canonicalLf = readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
  return createHash("sha256").update(canonicalLf, "utf8").digest("hex");
}

function section(startMarker: string, endMarker: string): string {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function normalizedSqlSha256(source: string): string {
  const normalized = source
    .replace(/^\s*--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function functionBodyLfMd5(createMarker: string): string {
  const createIndex = sql.indexOf(createMarker);
  expect(createIndex, `missing function marker: ${createMarker}`).toBeGreaterThan(-1);
  const bodyStart = sql.indexOf("AS $function$", createIndex) + "AS $function$".length;
  const bodyEnd = sql.indexOf("$function$;", bodyStart);
  expect(bodyEnd, `missing function body end: ${createMarker}`).toBeGreaterThan(bodyStart);
  const canonicalLf = sql.slice(bodyStart, bodyEnd).replace(/\r\n?/g, "\n");
  return createHash("md5").update(canonicalLf, "utf8").digest("hex");
}

describe("production breeding workflow reconciliation migration", () => {
  it("uses one CLI-created additive migration and preserves the historical LF-canonical content", () => {
    const names = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(names.filter((name) => name.startsWith("20260728163100_"))).toEqual([MIGRATION_NAME]);
    expect(names).toContain(HISTORICAL_NAME);
    expect(lfSha256(resolve(MIGRATIONS_DIR, HISTORICAL_NAME))).toBe(HISTORICAL_LF_SHA256);
    const crlfCheckout = sql.replace(/\n/g, "\r\n");
    expect(
      createHash("sha256").update(crlfCheckout.replace(/\r\n?/g, "\n"), "utf8").digest("hex"),
    ).toBe(createHash("sha256").update(sql, "utf8").digest("hex"));
  });

  it("fails closed on collisions and accepts only absent, exact historical, or exact reconciled state", () => {
    const preflight = section("DO $preflight$", "$preflight$;");
    const firstPersistentDdl = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.validate_grow_event()",
    );

    expect(sql.indexOf("DO $preflight$")).toBeLessThan(firstPersistentDdl);
    expect(sql).toMatch(
      /LOCK TABLE supabase_migrations\.schema_migrations\s+IN SHARE ROW EXCLUSIVE MODE;\s+DO \$preflight\$/,
    );
    expect(preflight).toContain("sm.version = '20260707120000'");
    expect(preflight).toContain("sm.name = 'breeding_workflow_v1'");
    expect(preflight).toContain(
      "breeding reconciliation refused schema_migrations version/name collision",
    );
    expect(preflight).toContain("IF NOT v_historical_marker_exists THEN");
    expect(preflight).toContain("v_breeding_state := 'absent'");
    expect(preflight).toContain("v_breeding_state := 'historical'");
    expect(preflight).toContain("v_breeding_state := 'reconciled'");
    expect(preflight).toContain("IF v_breeding_table_exists");
    expect(preflight).toContain(
      "breeding reconciliation refused partial unledgered breeding contract",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused incomplete ledgered breeding contract",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical breeding_events columns",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical breeding_events constraints",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical breeding_events indexes",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical historical breeding_events policies",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical reconciled breeding_events policies",
    );
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical reconciled breeding_events ACL",
    );
    expect(preflight).toContain("breeding reconciliation refused ambiguous breeding RPC state");
    expect(preflight).not.toMatch(
      /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|POLICY|TRIGGER|INDEX|ALL|SELECT|INSERT|UPDATE|DELETE)\b/i,
    );
  });

  it("reasserts the latest grow-event allow-list without dropping existing cultivation types", () => {
    const validator = section(
      "CREATE OR REPLACE FUNCTION public.validate_grow_event()",
      "CREATE TABLE IF NOT EXISTS public.breeding_events",
    );

    for (const eventType of [
      "watering",
      "feeding",
      "training",
      "observation",
      "photo",
      "environment",
      "harvest",
      "cure_check",
      "reversal_application",
      "isolation_start",
      "pollination",
      "pollen_shed_observed",
      "stigmas_receptive",
      "cross_harvest",
    ]) {
      expect(validator, eventType).toContain(`'${eventType}'`);
    }
    for (const source of ["manual", "voice", "import", "ai"]) {
      expect(validator, source).toContain(`'${source}'`);
    }
    expect(validator).toContain("NEW.updated_at := now()");
  });

  it("restores the exact breeding table, indexes, comment, and owner trigger without data replacement", () => {
    const table = section(
      "CREATE TABLE IF NOT EXISTS public.breeding_events",
      "COMMENT ON TABLE public.breeding_events",
    );

    for (const column of [
      "event_id",
      "user_id",
      "method",
      "intensity",
      "donor_plant_id",
      "notes",
      "details",
      "created_at",
    ]) {
      expect(table, column).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(table).toContain("REFERENCES public.grow_events(id) ON DELETE CASCADE");
    expect(table).toContain("REFERENCES public.plants(id) ON DELETE SET NULL");
    expect(table).toContain("details jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(sql).toContain("idx_breeding_events_user");
    expect(sql).toContain("idx_breeding_events_donor");
    expect(sql).toContain(
      "Breeding-specific payload (method, intensity, donor) for grow_events of a breeding subtype. Advisory log only.",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.validate_breeding_event_owner()");
    expect(sql).toContain(
      "ALTER FUNCTION public.validate_breeding_event_owner() OWNER TO postgres",
    );
    expect(sql).toContain("trg_validate_breeding_event_owner");
    expect(sql).toContain("parent_user <> NEW.user_id");
    expect(sql).toContain("p.user_id = NEW.user_id");

    const executable = sql.replace(/^\s*--.*$/gm, "");
    expect(executable).not.toMatch(/\bDELETE\s+FROM\s+public\.breeding_events\b/i);
    expect(executable).not.toMatch(/\bUPDATE\s+public\.breeding_events\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\s+(?:TABLE\s+)?public\.breeding_events\b/i);

    const preflight = section("DO $preflight$", "$preflight$;");
    const postflight = section("DO $postflight$", "$postflight$;");
    for (const exactnessProof of [
      "con.conkey = ARRAY[1]::smallint[]",
      "con.conkey = ARRAY[5]::smallint[]",
      "con.convalidated",
      "NOT con.condeferrable",
      "NOT con.condeferred",
      "i.indisprimary",
      "NOT i.indisunique",
      "i.indisvalid",
      "i.indisready",
      "i.indimmediate",
      "i.indnkeyatts = 1",
      "i.indnatts = 1",
      "pg_catalog.pg_get_indexdef(i.indexrelid, 1, true)",
      "pg_catalog.pg_get_expr(i.indpred, i.indrelid)",
    ]) {
      expect(preflight, exactnessProof).toContain(exactnessProof);
      expect(postflight, exactnessProof).toContain(exactnessProof);
    }
  });

  it("exposes breeding rows read-only to authenticated users and keeps writes service-only behind the RPC", () => {
    const rls = section(
      "ALTER TABLE public.breeding_events ENABLE ROW LEVEL SECURITY",
      "-- Authenticated writes flow only through this owner-scoped RPC.",
    );
    const createdPolicies = [
      ...rls.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.breeding_events/g),
    ].map((match) => match[1]);

    expect(createdPolicies).toEqual(["Users view own breeding_events"]);
    expect(rls).toContain("FOR SELECT");
    expect(rls).toContain("TO authenticated");
    expect(rls).toContain("USING (auth.uid() = user_id)");
    for (const directPolicy of [
      "Users insert own breeding_events",
      "Users update own breeding_events",
      "Users delete own breeding_events",
    ]) {
      expect(rls).toContain(`DROP POLICY IF EXISTS "${directPolicy}"`);
      expect(rls).not.toContain(`CREATE POLICY "${directPolicy}"`);
    }
    expect(rls).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.breeding_events\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(rls).toContain("GRANT SELECT ON TABLE public.breeding_events TO authenticated");
    expect(rls).toContain("GRANT ALL PRIVILEGES ON TABLE public.breeding_events TO service_role");
    expect(rls).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/i);
  });

  it("publishes the one exact idempotent PostgREST RPC signature with a pinned definer trust boundary", () => {
    const rpc = section(
      "CREATE FUNCTION public.breeding_log_save_event(",
      "-- Replace only this INSERT policy.",
    );
    const header = rpc.slice(0, rpc.indexOf("RETURNS jsonb")).replace(/\s+/g, " ");

    expect(header).toMatch(
      /p_idempotency_key text, p_grow_id uuid, p_plant_id uuid, p_event_type text, p_tent_id uuid DEFAULT NULL, p_occurred_at timestamptz DEFAULT NULL, p_method text DEFAULT NULL, p_intensity text DEFAULT NULL, p_notes text DEFAULT NULL, p_details jsonb DEFAULT NULL/,
    );
    expect(rpc).toContain("SECURITY DEFINER");
    expect(rpc).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(rpc).toContain("uid uuid := auth.uid()");
    expect(header).not.toMatch(/\buser_id\b/i);
    expect(rpc).toContain(") OWNER TO postgres");
    expect(rpc).toMatch(
      /REVOKE ALL ON FUNCTION public\.breeding_log_save_event\([\s\S]*?\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(rpc).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.breeding_log_save_event\([\s\S]*?\) TO authenticated, service_role;/,
    );
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");

    const preflight = section("DO $preflight$", "$preflight$;");
    const postflight = section("DO $postflight$", "$postflight$;");
    for (const metadataProof of [
      "p.prorettype = 'jsonb'::regtype",
      "NOT p.proretset",
      "p.provolatile = 'v'",
      "NOT p.proisstrict",
      "NOT p.proleakproof",
      "p.proparallel = 'u'",
      "p.pronargdefaults = 6",
      "pg_catalog.pg_get_expr(p.proargdefaults, 0)",
      "p.prokind = 'f'",
      "acl.grantor <> v_postgres_oid",
      "acl.is_grantable",
    ]) {
      expect(preflight, metadataProof).toContain(metadataProof);
      expect(postflight, metadataProof).toContain(metadataProof);
    }
  });

  it("resolves plant lineage direct-grow-first with an owned-tent fallback and fails closed", () => {
    const rpc = section(
      "CREATE FUNCTION public.breeding_log_save_event(",
      "-- Replace only this INSERT policy.",
    );
    const resolveIndex = rpc.indexOf("COALESCE(v_plant_direct_grow, v_plant_tent_grow)");
    const insertIndex = rpc.indexOf("INSERT INTO public.grow_events");

    expect(rpc).toContain("LEFT JOIN public.tents AS pt");
    expect(rpc).toContain("pt.user_id = uid");
    expect(rpc).toContain("p.user_id = uid");
    expect(rpc).toContain("v_plant_tent_grow IS NULL");
    expect(rpc).toContain("v_plant_direct_grow IS DISTINCT FROM v_plant_tent_grow");
    expect(rpc).toContain("v_resolved_plant_grow IS DISTINCT FROM p_grow_id");
    expect(rpc).toContain("v_selected_tent_grow IS DISTINCT FROM p_grow_id");
    expect(rpc).toContain("v_plant_tent IS DISTINCT FROM p_tent_id");
    expect(rpc).toContain("v_effective_tent := COALESCE(p_tent_id, v_plant_tent)");
    expect(rpc).toContain("ge.tent_id IS NOT DISTINCT FROM v_effective_tent");
    expect(rpc).toContain("v_effective_tent,");
    expect(rpc).toContain("'plant_tent_not_owned'");
    expect(rpc).toContain("'plant_cross_grow'");
    expect(resolveIndex).toBeGreaterThan(0);
    expect(insertIndex).toBeGreaterThan(resolveIndex);
  });

  it("makes breeding saves atomic and replay-safe through the shared idempotency map", () => {
    const rpc = section(
      "CREATE FUNCTION public.breeding_log_save_event(",
      "-- Replace only this INSERT policy.",
    );
    const rpcSetup = section(
      "-- Authenticated writes flow only through this owner-scoped RPC.",
      "CREATE FUNCTION public.breeding_log_save_event(",
    );
    const preflight = section("DO $preflight$", "$preflight$;");
    const postflight = section("DO $postflight$", "$postflight$;");

    expect(
      rpcSetup.match(/DROP FUNCTION IF EXISTS public\.breeding_log_save_event\(/g),
    ).toHaveLength(2);
    for (const mappingProof of [
      "('request_hash', 'text', false)",
      "con.conname = 'quicklog_idempotency_pkey'",
      "con.conkey = ARRAY[1, 2]::smallint[]",
      "NOT con.condeferrable",
      "NOT con.condeferred",
      "i.indisprimary",
      "i.indimmediate",
      "i.indpred IS NULL",
      "i.indexprs IS NULL",
    ]) {
      expect(preflight, mappingProof).toContain(mappingProof);
      expect(postflight, mappingProof).toContain(mappingProof);
    }
    expect(rpc).toContain("length(p_idempotency_key) < 8");
    expect(rpc).toContain("length(p_idempotency_key) > 200");
    expect(rpc).toContain("'invalid_idempotency_key'");
    expect(rpc).toContain("IF p_event_type IS NULL");
    expect(rpc).toContain("'invalid_event_type'");
    expect(rpc).toContain("FROM public.quicklog_idempotency AS qi");
    expect(rpc).toContain("INSERT INTO public.quicklog_idempotency");
    expect(rpc).toContain("'breeding_log_save_event_v2'");
    expect(rpc).toContain("qi.request_hash");
    expect(rpc).toContain("v_existing_request_hash IS DISTINCT FROM v_request_hash");
    expect(rpc).toMatch(
      /INSERT INTO public\.quicklog_idempotency \(\s*user_id,\s*idempotency_key,\s*grow_event_id,\s*request_hash\s*\)/,
    );
    expect(rpc).toContain("p_occurred_at IS NULL");
    expect(rpc).toContain("ge.occurred_at = p_occurred_at");
    expect(rpc).toContain("be.method IS NOT DISTINCT FROM v_method");
    expect(rpc).toContain("be.intensity IS NOT DISTINCT FROM v_intensity");
    expect(rpc).toContain("be.notes IS NOT DISTINCT FROM v_notes");
    expect(rpc).toContain("be.details = v_details");
    expect(rpc).toContain("'idempotency_key_conflict'");
    expect(rpc).toContain("'reused',");
    expect(rpc).toContain("WHEN unique_violation THEN");
    expect(rpc).toContain("This handler is a nested subtransaction");
    expect(rpc).toContain("END LOOP idempotent_save");
    expect(rpc.indexOf("INSERT INTO public.quicklog_idempotency")).toBeGreaterThan(
      rpc.indexOf("INSERT INTO public.breeding_events"),
    );
  });

  it("pins accepted validator and function bodies so mutations fail preflight and postflight", () => {
    const validatorHash = functionBodyLfMd5(
      "CREATE OR REPLACE FUNCTION public.validate_grow_event()",
    );
    const ownerHash = functionBodyLfMd5(
      "CREATE OR REPLACE FUNCTION public.validate_breeding_event_owner()",
    );
    const rpcHash = functionBodyLfMd5("CREATE FUNCTION public.breeding_log_save_event(");
    const preflight = section("DO $preflight$", "$preflight$;");
    const postflight = section("DO $postflight$", "$postflight$;");

    expect(validatorHash).toBe("75836d25f8881ac807213b1017224de9");
    expect(ownerHash).toBe("4a25390d7509f19002825eda30fb3b4c");
    expect(rpcHash).toBe("cddc5e91657330b8975f843d10ff82bf");
    for (const hash of [validatorHash, ownerHash, rpcHash]) {
      expect(preflight, hash).toContain(`'${hash}'`);
      expect(postflight, hash).toContain(`'${hash}'`);
    }
    expect(preflight).toContain("'63940e0de9a279203d9d7701734e5cf0'");
    expect(preflight).toContain("'9fe08ca1d3c6d1438ba97295f4e79b5e'");
    expect(preflight).toContain("'b2c5284862651e593e0ae98e72fccc86'");
    expect(preflight).toContain("'e2e0d624ab9b0b01ac278d741527426c'");
    expect(preflight).toContain("pg_catalog.replace(p.prosrc, E'\\r\\n', E'\\n')");
    expect(preflight).not.toContain("pg_catalog.regexp_replace(p.prosrc, '\\s+', '', 'g')");
    expect(preflight).toContain("p.proowner = v_postgres_oid");
    expect(preflight).toContain("AND NOT p.prosecdef");
    expect(postflight).toContain("p.proowner = v_postgres_oid");
    expect(postflight).toContain("AND NOT p.prosecdef");
    for (const triggerProof of [
      "t.tgtype = 23",
      "t.tgenabled = 'O'",
      "t.tgqual IS NULL",
      "t.tgnargs = 0",
      "t.tgattr = ''::int2vector",
      "t.tgoldtable IS NULL",
      "t.tgnewtable IS NULL",
    ]) {
      expect(preflight, triggerProof).toContain(triggerProof);
      expect(postflight, triggerProof).toContain(triggerProof);
    }
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical grow-event validation trigger",
    );
    expect(postflight).toContain(
      "breeding reconciliation failed grow-event validation-trigger postcondition",
    );
  });

  it("replaces only the action-queue INSERT policy while preserving approval and lineage fences", () => {
    const actionPolicy = section("-- Replace only this INSERT policy.", "DO $postflight$");
    const drops = [...actionPolicy.matchAll(/DROP POLICY IF EXISTS "([^"]+)"/g)].map(
      (match) => match[1],
    );
    const creates = [...actionPolicy.matchAll(/CREATE POLICY "([^"]+)"/g)].map((match) => match[1]);

    expect(drops).toEqual(["Users insert own action_queue"]);
    expect(creates).toEqual(["Users insert own action_queue"]);
    expect(actionPolicy).toContain("auth.uid() = action_queue.user_id");
    expect(actionPolicy).toContain("action_queue.status = 'pending_approval'");
    expect(actionPolicy).toContain("action_queue.approved_at IS NULL");
    expect(actionPolicy).toContain("action_queue.rejected_at IS NULL");
    expect(actionPolicy).toContain("action_queue.completed_at IS NULL");
    expect(actionPolicy).toContain("COALESCE(p.grow_id, pt.grow_id) = action_queue.grow_id");
    expect(actionPolicy).toContain("p.grow_id = action_queue.grow_id");
    expect(actionPolicy).toMatch(/p\.grow_id IS NULL\s+AND pt\.grow_id = action_queue\.grow_id/);
    expect(actionPolicy).toContain("pt.user_id = auth.uid()");
    expect(actionPolicy).toContain("p.tent_id = action_queue.tent_id");
    expect(actionPolicy).toContain("pt.id = action_queue.tent_id");
    expect(actionPolicy).not.toMatch(/Users (?:update|delete) own action_queue/);
  });

  it("refuses unknown action-queue policy drift before replacement and proves the exact reconciled policy after", () => {
    const preflight = section("DO $preflight$", "$preflight$;");
    const postflight = section("DO $postflight$", "$postflight$;");

    expect(preflight).toContain("p.polroles = ARRAY[v_authenticated_oid]");
    expect(preflight).toContain("p.polqual IS NULL");
    expect(preflight).toContain("p.polwithcheck IS NOT NULL");
    expect(preflight).toContain(`'${LATEST_ACTION_POLICY_FINGERPRINT}'`);
    expect(preflight).toContain(`'${RECONCILED_ACTION_POLICY_FINGERPRINT}'`);
    expect(preflight).toContain(
      "breeding reconciliation refused noncanonical action_queue insert policy",
    );
    expect(preflight).toContain("v_effective_action_insert_count <> 1");
    expect(preflight).toContain("pg_catalog.pg_has_role(");
    expect(preflight).toContain("c.relrowsecurity");
    expect(preflight).toContain("c.relowner = v_postgres_oid");
    expect(postflight).toContain("p.polroles = ARRAY[v_authenticated_oid]");
    expect(postflight).toContain("p.polqual IS NULL");
    expect(postflight).toContain("p.polwithcheck IS NOT NULL");
    expect(postflight).toContain(
      `v_action_fingerprint IS DISTINCT FROM\n       '${RECONCILED_ACTION_POLICY_FINGERPRINT}'`,
    );
    expect(postflight).toContain("v_effective_action_insert_count <> 1");
    expect(postflight).toContain("pg_catalog.pg_has_role(");
    expect(postflight).toContain("c.relrowsecurity");
    expect(postflight).toContain("c.relowner = v_postgres_oid");

    for (const semanticProof of [
      "auth.uid()=user_id",
      "status=''pending_approval''::text",
      "approved_atisnull",
      "rejected_atisnull",
      "completed_atisnull",
      "fromgrowsgwhere((g.id=action_queue.grow_id)and(g.user_id=auth.uid()))",
      "fromtentstwhere((t.id=action_queue.tent_id)and(t.user_id=auth.uid())and(t.grow_id=action_queue.grow_id))",
      "from(plantspleftjointentspton(((pt.id=p.tent_id)and(pt.user_id=auth.uid()))))",
      "p.id=action_queue.plant_id",
      "p.user_id=auth.uid()",
      "coalesce(p.grow_id,pt.grow_id)=action_queue.grow_id",
      "(p.grow_id=action_queue.grow_id)or((p.grow_idisnull)and(pt.grow_id=action_queue.grow_id))",
      "(p.tent_idisnull)or(pt.idisnotnull)",
      "(p.grow_idisnull)or(pt.grow_idisnull)or(p.grow_id=pt.grow_id)",
      "p.tent_id=action_queue.tent_id",
      "pt.id=action_queue.tent_id",
    ]) {
      expect(postflight, semanticProof).toContain(`'${semanticProof}'`);
    }
  });

  it("detects owner, lifecycle, grow, tent, plant, fallback, and conflict mutations in the reconciled policy", () => {
    const actionPolicy = section(
      'CREATE POLICY "Users insert own action_queue"',
      "DO $postflight$",
    );

    expect(normalizedSqlSha256(actionPolicy)).toBe(RECONCILED_ACTION_POLICY_SQL_SHA256);

    const mutations = [
      ["owner", "auth.uid() = action_queue.user_id"],
      ["pending lifecycle", "action_queue.status = 'pending_approval'"],
      ["approved lifecycle", "action_queue.approved_at IS NULL"],
      ["rejected lifecycle", "action_queue.rejected_at IS NULL"],
      ["completed lifecycle", "action_queue.completed_at IS NULL"],
      ["grow owner", "g.user_id = auth.uid()"],
      ["tent owner", "t.user_id = auth.uid()"],
      ["tent grow", "t.grow_id = action_queue.grow_id"],
      ["plant owner", "p.user_id = auth.uid()"],
      ["direct-first lineage", "COALESCE(p.grow_id, pt.grow_id) = action_queue.grow_id"],
      ["direct lineage", "p.grow_id = action_queue.grow_id"],
      ["fallback lineage", "p.grow_id IS NULL"],
      ["owned plant tent", "p.tent_id IS NULL OR pt.id IS NOT NULL"],
      ["direct/tent conflict", "p.grow_id IS NULL\n            OR pt.grow_id IS NULL"],
      ["selected plant tent", "p.tent_id = action_queue.tent_id"],
      ["selected owned tent", "pt.id = action_queue.tent_id"],
    ] as const;

    for (const [label, clause] of mutations) {
      expect(actionPolicy, `missing mutation fixture: ${label}`).toContain(clause);
      const mutated = actionPolicy.replace(clause, "TRUE");
      expect(normalizedSqlSha256(mutated), label).not.toBe(RECONCILED_ACTION_POLICY_SQL_SHA256);
    }
  });

  it("writes the historical marker only after exact postconditions and never overwrites it", () => {
    const postflightIndex = sql.indexOf("DO $postflight$");
    const markerIndex = sql.indexOf("INSERT INTO supabase_migrations.schema_migrations");
    const marker = sql.slice(markerIndex, sql.indexOf("COMMIT;", markerIndex));

    expect(markerIndex).toBeGreaterThan(postflightIndex);
    expect(marker).toContain("'20260707120000'");
    expect(marker).toContain("'breeding_workflow_v1'");
    expect(marker).toContain(
      "-- reconciled by 20260728163100_production_breeding_workflow_reconciliation",
    );
    expect(marker).toContain("WHERE NOT EXISTS");
    expect(marker).not.toMatch(/ON CONFLICT[\s\S]*DO UPDATE/i);
    expect(flat).not.toMatch(
      /UPDATE supabase_migrations\.schema_migrations|DELETE FROM supabase_migrations\.schema_migrations/i,
    );
  });

  it("contains no seed data, device control, auto-execution, or direct Action Queue insert", () => {
    const executable = sql.replace(/^\s*--.*$/gm, "");

    expect(executable).not.toMatch(/\bINSERT\s+INTO\s+public\.action_queue\b/i);
    expect(executable).not.toMatch(
      /device[_-]?control|device_command|execute_device|mqtt|setpoint_write|irrigation_control|light_control|fan_control/i,
    );
    expect(executable).not.toMatch(
      /\b(?:perform|select)\s+public\.(?:action_queue_transition|execute_[a-z_]+)/i,
    );
    expect(executable).not.toMatch(/\bTRUNCATE\s+(?:TABLE\s+)?public\./i);
    expect(sql).toContain("approval-required");
  });
});
