/** Fail-closed ordering contract shared by manual migration delivery and its PG15 proof. */
import { createHash } from "node:crypto";

export const MANUAL_DELIVERY_ORDER = Object.freeze([
  "20260927002000",
  "20260927160000",
  "20260928183000",
]);

export const MANUAL_DELIVERY_FILES = Object.freeze([
  Object.freeze({
    file: "20260927002000_quicklog_manual_reuse_fence.sql",
    sha256: "5017b8f697f77a358df43d38fae486a21cabf92a65aa3af439bc750d221d6b1b",
    wrapperBefore: "0d3098b81787fa90898da921345c0dbc",
    delegateBefore: "7ec296e422f7f47c8b2793b051840798",
  }),
  Object.freeze({
    file: "20260927160000_quicklog_manual_plant_tent_lineage.sql",
    sha256: "843bfd62f72b712dccfa9e4a58150e88cf5d2bc045323562abf0af8c54f30014",
    wrapperBefore: "85e40fcd47d1e38dca8f057fee2d905a",
    delegateBefore: "7ec296e422f7f47c8b2793b051840798",
  }),
  Object.freeze({
    file: "20260928183000_quicklog_manual_replay_metadata_lock.sql",
    sha256: "ef8e208bb306b8aed8d29be4ecca72344cfc1f0dc7de236de48c12aa6b4f14a7",
    wrapperBefore: "85e40fcd47d1e38dca8f057fee2d905a",
    delegateBefore: "ccd841f1af11a03bfca191cf9989c3fd",
  }),
]);

const signature =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text";

/** A reviewable, deterministic bundle; never a production authorization receipt. */
export function buildManualDeliveryBundle(input) {
  const { candidateSha, sources } = input ?? {};
  if (
    typeof candidateSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(candidateSha) ||
    !Array.isArray(sources) ||
    sources.length !== MANUAL_DELIVERY_FILES.length
  ) {
    throw new Error("delivery_bundle_input_rejected");
  }
  // Construct every step before returning anything that a caller could write.
  const steps = MANUAL_DELIVERY_FILES.map((pin, index) => {
    const version = MANUAL_DELIVERY_ORDER[index];
    const sql = buildManualDeliveryStepSql({
      order: MANUAL_DELIVERY_ORDER,
      version,
      sql: sources[index],
    });
    return Object.freeze({
      version,
      file: pin.file,
      source_sha256: pin.sha256,
      guarded_sha256: createHash("sha256").update(sql).digest("hex"),
      sql,
    });
  });
  const manifest = Object.freeze({
    schema_version: 1,
    candidate_sha: candidateSha,
    scope: "repository-plan-only",
    production_authorization: false,
    requires_protected_delivery: true,
    order: MANUAL_DELIVERY_ORDER,
    steps: Object.freeze(steps.map(({ sql: _sql, ...step }) => Object.freeze(step))),
  });
  return Object.freeze({ manifest, steps: Object.freeze(steps) });
}

/**
 * A protected runner must submit this entire script with ON_ERROR_STOP enabled.
 * The gate is inserted after the pinned migration's BEGIN, preserving every
 * original statement. Its transaction lock covers the check and migration even
 * through a transaction pooler; commit or rollback releases the lock.
 * This builder has no database connection or standalone production entry point.
 */
export function buildManualDeliveryStepSql(input) {
  if (!input || !validManualDeliveryOrder(input.order)) {
    throw new Error("delivery_order_rejected");
  }
  const position = MANUAL_DELIVERY_ORDER.indexOf(input.version);
  if (position < 0) throw new Error("delivery_order_rejected");
  const pin = MANUAL_DELIVERY_FILES[position];
  if (
    typeof input.sql !== "string" ||
    createHash("sha256").update(input.sql).digest("hex") !== pin.sha256
  ) {
    throw new Error("migration_fingerprint_mismatch");
  }
  // The caller's completed-prefix claim cannot replace actual database evidence.
  // In particular, 183000 must see the 160000 delegate, not only the 002000 wrapper.
  const gateSql = `DO $manual_delivery_gate$
DECLARE
  v_wrapper oid := pg_catalog.to_regprocedure('public.quicklog_save_manual(${signature})');
  v_delegate oid := pg_catalog.to_regprocedure('public.quicklog_save_manual_pre_logged_at(${signature})');
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(20260929, 183000) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='manual_delivery_writer_busy';
  END IF;
  IF current_user <> 'postgres' OR v_wrapper IS NULL OR v_delegate IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
      WHERE p.oid=v_wrapper AND r.rolname='postgres' AND p.prosecdef
        AND p.prorettype='jsonb'::pg_catalog.regtype
        AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
        AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\\r', ''))='${pin.wrapperBefore}'
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
      WHERE p.oid=v_delegate AND r.rolname='postgres' AND p.prosecdef
        AND p.prorettype='jsonb'::pg_catalog.regtype
        AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
        AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\\r', ''))='${pin.delegateBefore}'
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
    ) OR pg_catalog.has_function_privilege('anon',v_wrapper,'EXECUTE')
      OR NOT pg_catalog.has_function_privilege('authenticated',v_wrapper,'EXECUTE')
      OR NOT pg_catalog.has_function_privilege('service_role',v_wrapper,'EXECUTE')
      OR pg_catalog.has_function_privilege('anon',v_delegate,'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated',v_delegate,'EXECUTE')
      OR pg_catalog.has_function_privilege('service_role',v_delegate,'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='delivery_order_rejected';
  END IF;
END;
$manual_delivery_gate$;
`;
  const transactionMarker = "\nBEGIN;\n";
  const start = input.sql.indexOf(transactionMarker);
  if (start < 0) throw new Error("migration_shape_rejected");
  const positionAfterBegin = start + transactionMarker.length;
  return input.sql.slice(0, positionAfterBegin) + gateSql + input.sql.slice(positionAfterBegin);
}

export function validManualDeliveryOrder(value) {
  return (
    Array.isArray(value) &&
    value.length === MANUAL_DELIVERY_ORDER.length &&
    MANUAL_DELIVERY_ORDER.every((version, index) => value[index] === version)
  );
}

/** Only the next step after an exact completed prefix may start a database process. */
export function assertManualDeliveryStep({ order, completed, version } = {}) {
  if (
    !validManualDeliveryOrder(order) ||
    !Array.isArray(completed) ||
    completed.length >= order.length ||
    !completed.every((item, index) => item === order[index]) ||
    version !== order[completed.length]
  ) {
    throw new Error("delivery_order_rejected");
  }
  return Object.freeze([...completed, version]);
}
