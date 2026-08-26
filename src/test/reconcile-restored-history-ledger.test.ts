import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

import {
  APPLY_CONFIRMATION,
  CANDIDATE_PR_NUMBER,
  CATALOG_STATE_QUERY_SQL,
  EXPECTED_FUNCTION_FINGERPRINTS,
  EXPECTED_REPOSITORY,
  EXPECTED_WORKFLOW_PATH,
  PREFLIGHT_SQL,
  PRODUCTION_PROJECT_REF,
  RECONCILIATION_TARGETS,
  RESULT_KEYS,
  STAFF_LEGACY_SAFETY_QUERY_SQL,
  STAFF_SHIFTED_WITNESS_CONTRACT_SQL,
  buildApplySql,
  buildStateReceipt,
  classifyPreflight,
  loadReconciliationManifest,
  parsePreflightStdout,
  validateCandidateMigrationBlobs,
} from "../../scripts/reconcile-restored-history-ledger.mjs";

const DEPLOY_SHA = "1".repeat(40);
const CANDIDATE_SHA = "2".repeat(40);
const MANIFEST_SHA = "3".repeat(64);

function targetMigrations() {
  return RECONCILIATION_TARGETS.map((entry) => ({
    version: entry.version,
    name: entry.name,
    path: entry.source_path,
    sha256: entry.source_sha256,
  }));
}

function safeState({ present = 0 }: { present?: 0 | 1 | 2 | 3 } = {}) {
  const state: Record<string, unknown> = {
    current_database: "postgres",
    current_user: "postgres",
    ledger_total_count: 196 + present,
    ledger_contract: true,
    target_collision_count: 0,
    target_states: RECONCILIATION_TARGETS.map((entry, index) => ({
      version: entry.version,
      name: entry.name,
      exact_count: index < present ? 1 : 0,
      row_contract: index < present,
    })),
    staff_shifted_witness_contract: true,
    pheno_constraint_contract: true,
    pheno_comment_contract: true,
    staff_source_length: EXPECTED_FUNCTION_FINGERPRINTS.staff.bytes,
    staff_source_md5: EXPECTED_FUNCTION_FINGERPRINTS.staff.md5,
    staff_function_contract: true,
    staff_acl_contract: true,
    staff_legacy_function_contract: true,
    staff_legacy_acl_contract: true,
    staff_no_legacy_trigger_contract: true,
    staff_trigger_contract: true,
    quicklog_source_length: EXPECTED_FUNCTION_FINGERPRINTS.quicklog.bytes,
    quicklog_source_md5: EXPECTED_FUNCTION_FINGERPRINTS.quicklog.md5,
    quicklog_request_hash_column_contract: true,
    plant_type_column_contract: true,
    plant_type_constraint_contract: true,
    plant_type_comment_contract: true,
    quicklog_function_contract: true,
    quicklog_acl_contract: true,
    quicklog_comment_contract: true,
  };
  expect(Object.keys(state).sort()).toEqual([...RESULT_KEYS].sort());
  return state as any;
}

const authorization = Object.freeze({
  delivery_mode: "solo_founder_protected_environment",
  founder_github_user_id: 72639960,
  founder_github_login: "cheekhimself",
  production_environment: "verdant-production-solo-founder",
  solo_founder_acknowledgement_verified: true,
  environment_contract_verified: true,
  environment_approval_verified: true,
  minimum_review_seconds: 60,
  maximum_review_seconds: 3600,
});

const context = Object.freeze({
  repository: EXPECTED_REPOSITORY,
  repositoryId: "123456",
  runId: "654321",
  runAttempt: 1,
  event: "workflow_dispatch",
  branch: "verdant-grow-diary",
});

describe("restored-history ledger reconciliation", () => {
  it("loads the resolved three-row manifest and no broader migration set", () => {
    const loaded = loadReconciliationManifest();

    expect(loaded.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.manifest.candidate).toEqual({
      repository: EXPECTED_REPOSITORY,
      pr_number: 1113,
    });
    expect(loaded.manifest.reconciliations).toHaveLength(3);
    expect(loaded.manifest.reconciliations.map((entry: any) => entry.version)).toEqual([
      "20260710003638",
      "20260710013255",
      "20260725033124",
    ]);
    expect(JSON.stringify(loaded.manifest)).not.toContain("20260823120000");
  });

  it("classifies only the all-absent exact catalog as safe to reconcile", () => {
    expect(classifyPreflight(safeState())).toEqual({ status: "apply" });
    expect(classifyPreflight(safeState({ present: 3 }))).toEqual({ status: "verify_only" });
  });

  it("fails closed for a partial ledger, collision, shifted-witness loss, or catalog drift", () => {
    expect(classifyPreflight(safeState({ present: 1 })).status).toBe("ledger_drift");
    expect(classifyPreflight(safeState({ present: 2 })).status).toBe("ledger_drift");

    const collision = { ...safeState(), target_collision_count: 1 };
    expect(classifyPreflight(collision).status).toBe("ledger_drift");

    const missingWitness = { ...safeState(), staff_shifted_witness_contract: false };
    expect(classifyPreflight(missingWitness)).toEqual({
      status: "catalog_drift",
      reason: "staff_shifted_witness_contract",
    });

    for (const key of [
      "staff_legacy_function_contract",
      "staff_legacy_acl_contract",
      "staff_no_legacy_trigger_contract",
      "quicklog_request_hash_column_contract",
      "plant_type_column_contract",
      "plant_type_constraint_contract",
      "plant_type_comment_contract",
    ]) {
      expect(classifyPreflight({ ...safeState(), [key]: false })).toEqual({
        status: "catalog_drift",
        reason: key,
      });
    }

    const quicklogDrift = { ...safeState(), quicklog_source_md5: "0".repeat(32) };
    expect(classifyPreflight(quicklogDrift)).toEqual({
      status: "catalog_drift",
      reason: "quicklog_fingerprint",
    });
  });

  it("rejects malformed or multi-row preflight output", () => {
    expect(() => parsePreflightStdout("not json\n")).toThrow("preflight_result_json");
    expect(() => parsePreflightStdout(`${JSON.stringify(safeState())}\n{}\n`)).toThrow(
      "preflight_row_count",
    );
    expect(parsePreflightStdout(`${JSON.stringify(safeState())}\n`)).toEqual(safeState());
    const { plant_type_comment_contract: _missing, ...missingContract } = safeState();
    expect(() => parsePreflightStdout(JSON.stringify(missingContract))).toThrow(
      "preflight_result_shape",
    );
    expect(() =>
      parsePreflightStdout(
        JSON.stringify({ ...safeState(), quicklog_request_hash_column_contract: "true" }),
      ),
    ).toThrow("preflight_result_shape");
  });

  it("binds receipts to both heads, all candidate hashes, authorization, and full state", () => {
    const args = {
      state: safeState(),
      deployHeadSha: DEPLOY_SHA,
      candidatePrNumber: CANDIDATE_PR_NUMBER,
      candidateHeadSha: CANDIDATE_SHA,
      targetMigrations: targetMigrations(),
      manifestSha256: MANIFEST_SHA,
      context,
      authorization,
    };
    const receipt = buildStateReceipt(args);

    expect(receipt.deploy_head_sha).toBe(DEPLOY_SHA);
    expect(receipt.candidate_head_sha).toBe(CANDIDATE_SHA);
    expect(receipt.target_migrations).toEqual(targetMigrations());
    expect(receipt.preflight_classification).toBe("safe_to_reconcile");
    expect(receipt.run_id).toBe(context.runId);
    expect(receipt.run_attempt).toBe(context.runAttempt);
    expect(receipt.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      buildStateReceipt({ ...args, state: { ...safeState(), ledger_total_count: 197 } }).digest,
    ).not.toBe(receipt.digest);
    for (const key of [
      "quicklog_request_hash_column_contract",
      "plant_type_column_contract",
      "plant_type_constraint_contract",
      "plant_type_comment_contract",
    ]) {
      expect(
        buildStateReceipt({ ...args, state: { ...safeState(), [key]: false } }).digest,
      ).not.toBe(receipt.digest);
    }
    expect(buildStateReceipt({ ...args, candidateHeadSha: "4".repeat(40) }).digest).not.toBe(
      receipt.digest,
    );
    const applyRunReceipt = buildStateReceipt({
      ...args,
      context: { ...context, runId: "654322" },
    });
    expect(applyRunReceipt.run_id).toBe("654322");
    expect(applyRunReceipt.digest).toBe(receipt.digest);
    expect(
      buildStateReceipt({
        ...args,
        context: { ...context, repositoryId: "123457", runId: "654322" },
      }).digest,
    ).not.toBe(receipt.digest);
  });

  it("rejects a receipt with a wrong PR number or altered target list", () => {
    const args = {
      state: safeState(),
      deployHeadSha: DEPLOY_SHA,
      candidatePrNumber: CANDIDATE_PR_NUMBER,
      candidateHeadSha: CANDIDATE_SHA,
      targetMigrations: targetMigrations(),
      manifestSha256: MANIFEST_SHA,
      context,
      authorization,
    };

    expect(() => buildStateReceipt({ ...args, candidatePrNumber: 1114 })).toThrow(
      "receipt_input_rejected",
    );
    expect(() =>
      buildStateReceipt({ ...args, targetMigrations: targetMigrations().slice(0, 2) }),
    ).toThrow("receipt_input_rejected");
  });

  it("validates candidate blobs through git cat-file and rejects missing or changed bytes", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const missing = (command: string, args: string[]) => {
      calls.push({ command, args });
      return { status: 128, stdout: Buffer.alloc(0) };
    };
    expect(() =>
      validateCandidateMigrationBlobs({ candidateHeadSha: CANDIDATE_SHA, spawnImpl: missing }),
    ).toThrow("candidate_blob_unavailable");
    expect(calls[0]).toEqual({
      command: "git",
      args: ["cat-file", "blob", `${CANDIDATE_SHA}:${RECONCILIATION_TARGETS[0].source_path}`],
    });

    expect(() =>
      validateCandidateMigrationBlobs({
        candidateHeadSha: CANDIDATE_SHA,
        spawnImpl: () => ({ status: 0, stdout: Buffer.from("altered migration") }),
      }),
    ).toThrow("candidate_blob_hash_mismatch");
  });

  it("generates one atomic ledger-only transaction with three plain inserts", () => {
    const { manifest } = loadReconciliationManifest();
    const sql = buildApplySql({ manifest, state: safeState() });

    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock(20260825,1113)");
    expect(sql).toContain(
      "lock table supabase_migrations.schema_migrations in share row exclusive mode",
    );
    expect(sql).toContain("insert into supabase_migrations.schema_migrations");
    // One marker template is part of the locked catalog recheck and the other
    // three are the explicit ledger values.
    expect(sql.match(/restored-history-ledger-reconciliation:v1/g)).toHaveLength(4);
    expect(sql).not.toMatch(/on\s+conflict/i);
    expect(sql).not.toMatch(/\b(?:insert\s+into|update|delete\s+from)\s+(?:public|auth)\./i);
    expect(sql).not.toMatch(/\b(?:from|join)\s+(?:public|auth)\./i);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("will not generate an APPLY transaction for partial or already-present state", () => {
    const { manifest } = loadReconciliationManifest();
    expect(() => buildApplySql({ manifest, state: safeState({ present: 1 }) })).toThrow(
      "apply_state_rejected",
    );
    expect(() => buildApplySql({ manifest, state: safeState({ present: 3 }) })).toThrow(
      "apply_state_rejected",
    );
  });

  it("keeps preflight relation access limited to catalogs and the migration ledger", () => {
    expect(PREFLIGHT_SQL).toContain("set transaction read only");
    expect(CATALOG_STATE_QUERY_SQL).toContain("supabase_migrations.schema_migrations");
    expect(CATALOG_STATE_QUERY_SQL).not.toMatch(/\b(?:from|join)\s+public\./i);
    expect(CATALOG_STATE_QUERY_SQL).not.toMatch(/\b(?:from|join)\s+auth\./i);
    expect(CATALOG_STATE_QUERY_SQL).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+(?:public|auth)\./i,
    );
  });

  it("attests every persistent schema effect of the core forward repair", () => {
    expect(CATALOG_STATE_QUERY_SQL).toContain("public.quicklog_idempotency");
    expect(CATALOG_STATE_QUERY_SQL).toContain("a.attname='request_hash'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("not a.attnotnull and not a.atthasdef");
    expect(CATALOG_STATE_QUERY_SQL).toContain("a.attname='plant_type'");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "pg_catalog.pg_get_expr(d.adbin,d.adrelid,true)='''unknown''::text'",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("c.conname='plants_plant_type_check'");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "c.contype='c' and c.convalidated and not c.condeferrable and not c.condeferred",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("c.conkey=array[(select a.attnum");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "Declared plant type: autoflower | photoperiod | unknown. Grower-entered only, never inferred. unknown blocks cross-plant ranking and strong AI readiness.",
    );
  });

  it("rejects ambiguous shifted staff history and every legacy staff execution path", () => {
    expect(STAFF_SHIFTED_WITNESS_CONTRACT_SQL).toContain(
      "where version='20260709015800'\n    or name='20260709015758_d49efeac-492c-4f7b-9746-3638f44fa287'",
    );
    expect(STAFF_SHIFTED_WITNESS_CONTRACT_SQL).toContain("count(*)=1 and bool_and(");
    expect(STAFF_LEGACY_SAFETY_QUERY_SQL).toContain("public.grant_staff_role_for_verified_email()");
    expect(STAFF_LEGACY_SAFETY_QUERY_SQL).toContain(
      "not pg_catalog.has_function_privilege('anon',oid,'EXECUTE')",
    );
    expect(STAFF_LEGACY_SAFETY_QUERY_SQL).toContain(
      "not pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')",
    );
    expect(STAFF_LEGACY_SAFETY_QUERY_SQL).toContain(
      "not pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')",
    );
    expect(STAFF_LEGACY_SAFETY_QUERY_SQL).toContain("t.tgfoid=f.oid");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "or t.tgfoid in(\n        pg_catalog.to_regprocedure('public.grant_staff_role_for_verified_allowlist()'),",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("t.tgnargs=0");
    expect(CATALOG_STATE_QUERY_SQL).not.toContain("x.is_grantable order by 1");
    expect(
      CATALOG_STATE_QUERY_SQL.match(
        /order by pg_catalog\.pg_get_userbyid\(x\.grantee\),x\.privilege_type,x\.is_grantable/g,
      ),
    ).toHaveLength(2);
    expect(
      CATALOG_STATE_QUERY_SQL.match(/t\.tgrelid=pg_catalog\.to_regclass\('auth\.users'\)/g),
    ).toHaveLength(2);
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "from pg_catalog.pg_trigger t where not t.tgisinternal",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("t.tgattr::text=(select a.attnum::text");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "pg_catalog.lower(pg_catalog.pg_get_triggerdef(t.oid,false))",
    );
    expect(CATALOG_STATE_QUERY_SQL).not.toContain("pg_get_expr(t.tgqual");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "old.email_confirmed_atisnullandnew.email_confirmed_atisnotnull",
    );
  });

  it("attests the migration ledger as an exact permanent side-effect-free relation", () => {
    expect(CATALOG_STATE_QUERY_SQL).toContain("r.relpersistence='p'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("not r.relispartition");
    expect(CATALOG_STATE_QUERY_SQL).toContain("not r.relhasrules");
    expect(CATALOG_STATE_QUERY_SQL).toContain("not r.relforcerowsecurity");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.pg_attrdef");
    expect(CATALOG_STATE_QUERY_SQL).toContain("a.attgenerated,a.attidentity,d.oid is null");
    expect(CATALOG_STATE_QUERY_SQL).toContain("d.oid is null,a.attacl is null");
    expect(CATALOG_STATE_QUERY_SQL).toContain("a.attcollation=t.typcollation");
    expect(CATALOG_STATE_QUERY_SQL).toContain("cl.collprovider='d'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("cl.collisdeterministic");
    expect(CATALOG_STATE_QUERY_SQL).toContain("1|version|text|t|||t|t|t");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "schema_migrations_idempotency_key_key|u|t|f|f|UNIQUE (idempotency_key)",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "schema_migrations_pkey|p|t|f|f|PRIMARY KEY (version)",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "i.indisunique and i.indisvalid and i.indisready and i.indislive",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("not i.indnullsnotdistinct");
    expect(CATALOG_STATE_QUERY_SQL).toContain("i.indimmediate and not i.indisexclusion");
    expect(CATALOG_STATE_QUERY_SQL).toContain("i.indpred is null and i.indexprs is null");
    expect(CATALOG_STATE_QUERY_SQL).toContain("and i.indnkeyatts=1 and i.indnatts=1");
    expect(CATALOG_STATE_QUERY_SQL).toContain("ic.relkind='i' and ic.relpersistence='p'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("am.amname='btree'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("am.amtype='t' and am.amname='heap'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("oc.opcname='text_ops' and oc.opcdefault");
    expect(CATALOG_STATE_QUERY_SQL).toContain("i.indcollation[0]=a.attcollation");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.pg_rewrite w");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.pg_inherits h");
    expect(CATALOG_STATE_QUERY_SQL).toContain("(t.tgtype::integer & 4)<>0");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.pg_publication_namespace pn");
    expect(CATALOG_STATE_QUERY_SQL).toContain("p.puballtables");
    expect(CATALOG_STATE_QUERY_SQL).toContain("p.pubinsert");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.has_table_privilege(ar.oid,r.oid");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pg_catalog.has_any_column_privilege(ar.oid,r.oid");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "pg_catalog.pg_has_role(ar.oid,reachable.oid,'MEMBER')",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "pg_catalog.has_table_privilege(current_user,r.oid,'SELECT,INSERT')",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "sm.version=e.version or sm.name=e.name or sm.idempotency_key=e.idempotency_key",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "sm.version=e.version and sm.name=e.name and sm.idempotency_key=e.idempotency_key",
    );
    expect(
      CATALOG_STATE_QUERY_SQL.match(
        /sm\.version=e\.version and sm\.name=e\.name\s+and sm\.idempotency_key=e\.idempotency_key/g,
      ),
    ).toHaveLength(3);
  });

  it("wires a manual protected workflow with exact candidate and receipt gates", () => {
    const workflowPath = resolve(EXPECTED_WORKFLOW_PATH);
    const workflowSource = readFileSync(workflowPath, "utf8");
    const workflow = loadYaml(workflowSource) as Record<string, any>;

    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).not.toHaveProperty("pull_request");
    expect(workflow.on).not.toHaveProperty("push");
    expect(workflow.concurrency.group).toBe("verdant-production-migration-writer");
    expect(workflow.jobs.reconcile.environment).toBe("verdant-production-solo-founder");
    expect(workflowSource).toContain("refs/heads/verdant-grow-diary");
    expect(workflowSource).toContain("candidate_pr_number must be exactly 1113");
    expect(workflowSource).toContain("git cat-file -e");
    expect(workflowSource).toContain("verify-restored-history-ledger-preflight-artifact.mjs");
    expect(workflowSource).toContain("SUPABASE_DB_CA_CERT_B64");
    expect(workflowSource).toContain("verify-full");
    expect(workflowSource).toContain(APPLY_CONFIRMATION);
    expect(workflowSource).not.toMatch(/git\s+checkout\s+.*EXPECTED_CANDIDATE_HEAD_SHA/);
    expect(workflowSource).not.toContain(
      "continue-on-error: true\n        run: node scripts/reconcile",
    );
  });

  it("pins the only production target and never embeds a credential", () => {
    expect(PRODUCTION_PROJECT_REF).toBe("knkwiiywfkbqznbxwqfh");
    const source = readFileSync(resolve("scripts/reconcile-restored-history-ledger.mjs"), "utf8");
    expect(source).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
    expect(source).not.toMatch(/sb_(?:secret|service_role)_/i);
  });
});
