import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runPlantLineageHarness,
  validateLocalTarget,
  MANUAL_DELIVERY_ORDER,
  loadManualDeliverySql,
  validManualDeliveryOrder,
  deliverManualMigration,
  DELIVERY_DATABASE_SNAPSHOT_SQL,
} from "../../scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs";
import {
  assertManualDeliveryStep,
  buildManualDeliveryStepSql,
} from "../../scripts/lib/quicklogManualDeliveryOrder.mjs";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260927160000_quicklog_manual_plant_tent_lineage.sql",
  ),
  "utf8",
);
const harness = readFileSync(
  resolve(process.cwd(), "scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs"),
  "utf8",
);

describe("Quick Log manual plant/tent lineage fence", () => {
  it("accepts only the deterministic full order without mutating the caller's input", () => {
    const order = [...MANUAL_DELIVERY_ORDER];
    expect(order).toEqual(["20260927002000", "20260927160000", "20260928183000"]);
    expect(validManualDeliveryOrder(order)).toBe(true);
    expect(validManualDeliveryOrder(order)).toBe(true);
    expect(order).toEqual(MANUAL_DELIVERY_ORDER);
    for (const input of [undefined, "20260927002000", {}, ["20260927002000"]]) {
      expect(validManualDeliveryOrder(input)).toBe(false);
    }
  });

  it("requires the exact completed prefix for every delivery step", () => {
    for (let index = 0; index < MANUAL_DELIVERY_ORDER.length; index += 1) {
      const completed = MANUAL_DELIVERY_ORDER.slice(0, index);
      const input = {
        order: MANUAL_DELIVERY_ORDER,
        completed,
        version: MANUAL_DELIVERY_ORDER[index],
      };
      const next = assertManualDeliveryStep(input);
      expect(next).toEqual(MANUAL_DELIVERY_ORDER.slice(0, index + 1));
      expect(assertManualDeliveryStep(input)).toEqual(next);
      expect(completed).toEqual(MANUAL_DELIVERY_ORDER.slice(0, index));
      for (const version of MANUAL_DELIVERY_ORDER.filter((item) => item !== input.version)) {
        expect(() => assertManualDeliveryStep({ ...input, version })).toThrow(
          "delivery_order_rejected",
        );
      }
    }
    for (const input of [
      undefined,
      null,
      {},
      { order: MANUAL_DELIVERY_ORDER, completed: null },
      {
        order: MANUAL_DELIVERY_ORDER,
        completed: [MANUAL_DELIVERY_ORDER[1]],
        version: MANUAL_DELIVERY_ORDER[1],
      },
    ]) {
      expect(() => assertManualDeliveryStep(input)).toThrow();
    }
  });

  it("rejects reverse delivery without starting a database process", () => {
    const spawnImpl = vi.fn();
    expect(() =>
      deliverManualMigration({
        order: MANUAL_DELIVERY_ORDER,
        completed: [],
        version: MANUAL_DELIVERY_ORDER[2],
        sql: loadManualDeliverySql()[2],
        env: {},
        spawnImpl,
      }),
    ).toThrow("delivery_order_rejected");
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])("rejects changed migration bytes at chain position %i", (position) => {
    const directory = mkdtempSync(resolve(tmpdir(), "quicklog-chain-pin-"));
    const filenames = [
      "20260927002000_quicklog_manual_reuse_fence.sql",
      "20260927160000_quicklog_manual_plant_tent_lineage.sql",
      "20260928183000_quicklog_manual_replay_metadata_lock.sql",
    ];
    try {
      for (const [index, file] of filenames.entries()) {
        const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8");
        writeFileSync(
          resolve(directory, file),
          index === position ? sql.replace("BEGIN;", "BEGIN;\n-- changed") : sql,
        );
      }
      expect(() => loadManualDeliverySql(directory)).toThrow("migration_fingerprint_mismatch");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["full-chain", null, null],
    ["reverse connection failure", "reverse", "connection"],
    ["reverse unrelated SQL failure", "reverse", "sql"],
    ["lineage connection failure", "lineage", "connection"],
    ["lineage unrelated SQL failure", "lineage", "sql"],
    ["skipped lineage connection failure", "skipped", "connection"],
    ["skipped lineage unrelated SQL failure", "skipped", "sql"],
  ])(
    "requires genuine SQL refusals before full-chain acceptance: %s",
    async (_label, failureStage, failureKind) => {
      const sql = loadManualDeliverySql();
      const guardedSql = sql.map((text, position) =>
        buildManualDeliveryStepSql({
          order: MANUAL_DELIVERY_ORDER,
          version: MANUAL_DELIVERY_ORDER[position],
          sql: text,
        }),
      );
      const applied: number[] = [];
      let lineageAttempt = 0;
      let metadataAttempt = 0;
      let rejectedKeyCalls = 0;
      const spawnImpl = vi.fn((_command, _args, options) => {
        const input = options.input as string;
        const result = (stdout = "", status = 0) => ({ status, stdout, stderr: "" });
        const refusal = (stage: string, expectedMessage: string) => {
          if (failureStage === stage) {
            return {
              status: failureKind === "connection" ? 2 : 3,
              stdout: "",
              stderr:
                failureKind === "connection" ? "connection refused" : "ERROR:  unrelated_failure\n",
            };
          }
          return { status: 3, stdout: "", stderr: "ERROR:  " + expectedMessage + "\n" };
        };
        if (input.includes("current_database()") && input.includes("runtime_sentinel")) {
          return result("verdant_quicklog_delegate_repair_pg15_disposable_v1");
        }
        if (input === DELIVERY_DATABASE_SNAPSHOT_SQL) return result("a".repeat(32));
        const position = guardedSql.indexOf(input);
        if (position >= 0) {
          if (position === 2 && ++metadataAttempt === 1)
            return refusal("skipped", "delivery_order_rejected");
          applied.push(position);
          return result();
        }
        if (input === sql[2])
          return refusal("reverse", "quicklog_manual_metadata_lock_preflight_unrecognized");
        if (input === sql[1] && ++lineageAttempt === 1)
          return refusal("lineage", "quicklog_manual_lineage_preflight_unrecognized");
        if (input.includes("select oid::text from pg_proc")) return result("123");
        if (input.includes("update public.plants set tent_id=")) {
          return result("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
        }
        if (input.includes("select public.quicklog_save_manual(")) {
          if (input.includes("plant-lineage-rejected-0001")) {
            rejectedKeyCalls += 1;
            if (rejectedKeyCalls === 1) {
              return result(JSON.stringify({ ok: false, reason: "plant_tent_grow_mismatch" }));
            }
            return result(
              JSON.stringify({
                ok: true,
                reused: rejectedKeyCalls === 3,
                grow_event_id: "fixed-event",
              }),
            );
          }
          return result(
            JSON.stringify({ ok: true, reused: false, grow_event_id: "baseline-or-tentless" }),
          );
        }
        return result("t");
      });
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const errorWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        expect(
          await runPlantLineageHarness({
            url: "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair",
            spawnImpl,
          }),
        ).toBe(failureStage ? 1 : 0);
        if (failureStage) {
          expect(applied).toEqual(failureStage === "skipped" ? [0] : []);
          expect(errorWrite).toHaveBeenCalledWith(
            expect.stringContaining("expected_sql_refusal_missing"),
          );
          expect(write).not.toHaveBeenCalled();
        } else {
          expect(applied).toEqual([0, 1, 2]);
          expect(
            spawnImpl.mock.calls.filter(
              ([, , options]) => options.input === DELIVERY_DATABASE_SNAPSHOT_SQL,
            ),
          ).toHaveLength(4);
          expect(write).toHaveBeenCalledWith(
            expect.stringContaining("full chain 002000 -> 160000 -> 183000"),
          );
        }
      } finally {
        write.mockRestore();
        errorWrite.mockRestore();
      }
    },
  );

  it.each(
    [
      ["20260927160000", "20260927002000", "20260928183000"],
      ["20260927002000", "20260928183000", "20260927160000"],
      ["20260928183000", "20260927160000", "20260927002000"],
      ["20260927002000", "20260927002000", "20260928183000"],
      [],
      null,
    ].map((deliveryOrder) => [deliveryOrder]),
  )("refuses an invalid delivery order before any SQL: %j", async (deliveryOrder) => {
    const spawnImpl = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(
        await runPlantLineageHarness({
          url: "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair",
          deliveryOrder,
          spawnImpl,
        }),
      ).toBe(1);
      expect(spawnImpl).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(expect.stringContaining("delivery_order_rejected"));
    } finally {
      write.mockRestore();
    }
  });

  it("replaces only the private delegate after an exact source preflight", () => {
    expect(migration).toContain("7ec296e422f7f47c8b2793b051840798");
    expect(migration).toContain("85e40fcd47d1e38dca8f057fee2d905a");
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public."quicklog_save_manual_pre_logged_at"',
    );
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.quicklog_save_manual\s*\(/i);
    expect(migration).not.toMatch(/(?:ALTER|DROP)\s+TABLE/i);
  });

  it("checks the same-owner assigned tent's grow before any event insert", () => {
    const guard = migration.indexOf("plant_tent_grow_mismatch");
    expect(guard).toBeGreaterThan(0);
    expect(migration).toContain("v_tent_grow_id IS DISTINCT FROM v_grow_id");
    expect(migration).toContain("t.id = v_tent_id AND t.user_id = uid");
    expect(guard).toBeLessThan(migration.indexOf("INSERT INTO public.grow_events"));
    expect(guard).toBeLessThan(migration.indexOf("INSERT INTO public.diary_entries"));
  });

  it("locks target rows and preserves tentless plant saves", () => {
    expect(migration).toMatch(/WHERE p\.id = p_target_id AND p\.user_id = uid\s+FOR SHARE/i);
    expect(migration).toMatch(/WHERE t\.id = p_target_id AND t\.user_id = uid\s+FOR SHARE/i);
    expect(migration).toContain("v_plant_id IS NOT NULL AND v_tent_id IS NOT NULL");
  });

  it("refuses non-disposable database targets before running SQL", async () => {
    expect(validateLocalTarget({ url: "postgresql://postgres:x@db.example/verdant" })).toBeNull();
    expect(
      validateLocalTarget({ url: "postgresql://postgres:x@127.0.0.1:5432/verdant" }),
    ).toBeNull();
    expect(
      validateLocalTarget({
        url: "postgresql://postgres:x@127.0.0.1:5432/verdant_quicklog_delegate_repair",
        containerId: "not-a-container",
      }),
    ).toBeNull();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(
        await runPlantLineageHarness({ url: "postgresql://postgres:x@db.example/verdant" }),
      ).toBe(1);
    } finally {
      write.mockRestore();
    }
  });

  it("requires a pre-fix wrong-target witness, then rejects the new save with no rows", () => {
    expect(harness).toContain("baseline_wrong_target_save_not_reproduced");
    expect(harness).toContain("baseline_mixed_row");
    expect(harness).toContain("mixed_plant_not_rejected");
    expect(harness).toContain("rejection_wrote_no_rows");
    expect(harness).toContain("same_grow_save_failed");
    expect(harness).toContain("unassigned_save_failed");
  });
});
