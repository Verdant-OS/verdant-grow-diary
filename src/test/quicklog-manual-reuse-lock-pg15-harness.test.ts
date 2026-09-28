import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractResolver,
  pinnedManualSql,
  runManualReuseLockHarness,
} from "../../scripts/run-quicklog-manual-reuse-lock-pg15-harness.mjs";

describe("manual replay versus revision locking proof", () => {
  it.each([
    null,
    "postgresql://postgres:secret@db.example.test:5432/verdant_quicklog_delegate_repair",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres",
    "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_delegate_repair",
    "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_delegate_repair",
  ])("rejects unapproved database %s before starting a process", async (url) => {
    let calls = 0;
    const spawnImpl = () => {
      calls++;
      throw new Error("must not spawn");
    };
    await expect(
      runManualReuseLockHarness({ url, spawnImpl, spawnAsyncImpl: spawnImpl }),
    ).resolves.toBe(1);
    expect(calls).toBe(0);
  });

  it("does not reset a database without the disposable sentinel", async () => {
    const inputs: string[] = [];
    await expect(
      runManualReuseLockHarness({
        url: "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair",
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          inputs.push(String(options.input ?? ""));
          return { status: 0, stdout: "rejected\n", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("refuses altered accepted migration bytes", () => {
    const accepted = pinnedManualSql();
    expect(() =>
      pinnedManualSql(accepted.replace("FOR UPDATE OF ge;", "FOR UPDATE OF ge SKIP LOCKED;")),
    ).toThrow("manual_migration_fingerprint_mismatch");
  });

  it.each([null, "", "CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root( broken"])(
    "fails closed on missing or truncated resolver source",
    (source) => {
      expect(() => extractResolver(source)).toThrow("resolver_source_shape_rejected");
    },
  );

  it("extracts the actual resolver without adjacent functions and rejects duplicates", () => {
    const migration = readFileSync(
      "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql",
      "utf8",
    ).replace(/\r\n/g, "\n");
    const resolver = extractResolver(migration);
    expect(resolver).toContain("FOR UPDATE;");
    expect(resolver).toMatch(/\n\$\$;$/);
    expect(resolver).not.toContain("CREATE OR REPLACE FUNCTION public.quicklog_retract");
    expect(() => extractResolver(`${resolver}\n${resolver}`)).toThrow(
      "resolver_source_shape_rejected",
    );
  });
});
