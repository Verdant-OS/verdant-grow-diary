import { describe, expect, it } from "vitest";
import { loadManualDeliverySql } from "../../scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs";
import * as gate from "../../scripts/lib/quicklogManualDeliveryOrder.mjs";

describe("database-enforced Quick Log manual delivery", () => {
  it.each([0, 1, 2, 3])("checks the actual predecessor catalog before step %i", (position) => {
    const sql = loadManualDeliverySql()[position];
    const script = gate.buildManualDeliveryStepSql({
      order: gate.MANUAL_DELIVERY_ORDER,
      version: gate.MANUAL_DELIVERY_ORDER[position],
      sql,
    });
    const predecessor = [
      ["0d3098b81787fa90898da921345c0dbc", "7ec296e422f7f47c8b2793b051840798"],
      ["85e40fcd47d1e38dca8f057fee2d905a", "7ec296e422f7f47c8b2793b051840798"],
      ["85e40fcd47d1e38dca8f057fee2d905a", "ccd841f1af11a03bfca191cf9989c3fd"],
      ["1875cf01f7d1aa843d4b8ad080f9bcb2", "ccd841f1af11a03bfca191cf9989c3fd"],
    ][position];
    expect(script).toContain(predecessor[0]);
    expect(script).toContain(predecessor[1]);
    const gateStart = script.indexOf("DO $manual_delivery_gate$");
    expect(script.indexOf("\nBEGIN;\n")).toBeLessThan(gateStart);
    expect(script.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(script.indexOf("delivery_order_rejected")).toBeLessThan(
      script.indexOf(sql.slice(sql.indexOf("\nBEGIN;\n") + "\nBEGIN;\n".length)),
    );
    expect(script).toContain("pg_catalog.to_regprocedure('public.quicklog_save_manual(");
    expect(script).toContain(
      "pg_catalog.to_regprocedure('public.quicklog_save_manual_pre_logged_at(",
    );
    expect(script).toContain("pg_catalog.pg_try_advisory_xact_lock(20260929, 183000)");
    expect(script).not.toContain("pg_catalog.pg_try_advisory_lock(");
    expect(
      script.replace(/DO \$manual_delivery_gate\$[\s\S]*?\$manual_delivery_gate\$;\n/, ""),
    ).toBe(sql);
    expect(
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[position],
        sql,
      }),
    ).toBe(script);
  });

  it.each([0, 1, 2, 3])("rejects changed migration bytes at step %i", (position) => {
    expect(() =>
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[position],
        sql: loadManualDeliverySql()[position] + "-- altered\n",
      }),
    ).toThrow("migration_fingerprint_mismatch");
  });

  it.each([0, 1, 2, 3])("pins the protected runner role at step %i", (position) => {
    const script = gate.buildManualDeliveryStepSql({
      order: gate.MANUAL_DELIVERY_ORDER,
      version: gate.MANUAL_DELIVERY_ORDER[position],
      sql: loadManualDeliverySql()[position],
    });
    const generatedGate = script
      .split("DO $manual_delivery_gate$")[1]
      .split("$manual_delivery_gate$;")[0];
    expect(generatedGate).toContain("IF current_user <> 'postgres' OR v_wrapper IS NULL");
  });

  it.each([0, 1, 2, 3])("requires the exact wrapper ACL at step %i", (position) => {
    const script = gate.buildManualDeliveryStepSql({
      order: gate.MANUAL_DELIVERY_ORDER,
      version: gate.MANUAL_DELIVERY_ORDER[position],
      sql: loadManualDeliverySql()[position],
    });
    const wrapperGate = script.split("WHERE p.oid=v_wrapper")[1].split("WHERE p.oid=v_delegate")[0];
    expect(wrapperGate).toContain("acl.is_grantable,grantor.rolname");
    expect(wrapperGate).toContain("'authenticated|EXECUTE|f|postgres'");
    expect(wrapperGate).toContain("'postgres|EXECUTE|f|postgres'");
    expect(wrapperGate).toContain("'service_role|EXECUTE|f|postgres'");
    expect(wrapperGate).toContain("COALESCE((");
    expect(wrapperGate).toContain("),false)");
  });

  it.each([0, 1, 2, 3])("requires the exact private-delegate ACL at step %i", (position) => {
    const script = gate.buildManualDeliveryStepSql({
      order: gate.MANUAL_DELIVERY_ORDER,
      version: gate.MANUAL_DELIVERY_ORDER[position],
      sql: loadManualDeliverySql()[position],
    });
    const delegateGate = script
      .split("WHERE p.oid=v_delegate")[1]
      .split("OR pg_catalog.has_function_privilege")[0];
    expect(delegateGate).toContain("acl.is_grantable,grantor.rolname");
    expect(delegateGate).toContain("= ARRAY['postgres|EXECUTE|f|postgres']::text[]");
    expect(delegateGate).toContain("COALESCE((");
    expect(delegateGate).toContain("),false)");
  });

  it.each([0, 1, 2, 3])(
    "pins service-role exclusion from the private delegate at step %i",
    (position) => {
      const script = gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[position],
        sql: loadManualDeliverySql()[position],
      });
      const generatedGate = script
        .split("DO $manual_delivery_gate$")[1]
        .split("$manual_delivery_gate$;")[0];
      expect(generatedGate).toContain(
        "OR pg_catalog.has_function_privilege('service_role',v_delegate,'EXECUTE') THEN",
      );
    },
  );

  it("cannot substitute the UTC-hash repair for the lock repair", () => {
    expect(() =>
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[2],
        sql: loadManualDeliverySql()[3],
      }),
    ).toThrow("migration_fingerprint_mismatch");
  });

  it("cannot substitute the lock repair for the lineage migration", () => {
    expect(() =>
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[1],
        sql: loadManualDeliverySql()[2],
      }),
    ).toThrow("migration_fingerprint_mismatch");
  });

  it.each([
    undefined,
    null,
    {},
    { order: [...gate.MANUAL_DELIVERY_ORDER].reverse() },
    { order: gate.MANUAL_DELIVERY_ORDER, version: "unknown" },
  ])("fails closed on malformed delivery input %j", (input) => {
    expect(() => gate.buildManualDeliveryStepSql(input)).toThrow("delivery_order_rejected");
  });
});
