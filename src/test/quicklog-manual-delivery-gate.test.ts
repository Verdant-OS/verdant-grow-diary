import { describe, expect, it } from "vitest";
import { loadManualDeliverySql } from "../../scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs";
import * as gate from "../../scripts/lib/quicklogManualDeliveryOrder.mjs";

describe("database-enforced Quick Log manual delivery", () => {
  it.each([0, 1, 2])("checks the actual predecessor catalog before step %i", (position) => {
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
    ][position];
    expect(script).toContain(predecessor[0]);
    expect(script).toContain(predecessor[1]);
    expect(script.indexOf("delivery_order_rejected")).toBeLessThan(script.indexOf(sql));
    expect(script).toContain("pg_catalog.to_regprocedure('public.quicklog_save_manual(");
    expect(script).toContain(
      "pg_catalog.to_regprocedure('public.quicklog_save_manual_pre_logged_at(",
    );
    expect(script).toContain("pg_catalog.pg_try_advisory_lock(20260929, 183000)");
    expect(script.endsWith(sql)).toBe(true);
    expect(
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[position],
        sql,
      }),
    ).toBe(script);
  });

  it.each([0, 1, 2])("rejects changed migration bytes at step %i", (position) => {
    expect(() =>
      gate.buildManualDeliveryStepSql({
        order: gate.MANUAL_DELIVERY_ORDER,
        version: gate.MANUAL_DELIVERY_ORDER[position],
        sql: loadManualDeliverySql()[position] + "-- altered\n",
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
