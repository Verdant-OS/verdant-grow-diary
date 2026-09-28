import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractResolver,
  pinnedManualSql,
  pinnedForwardSql,
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

  it("refuses altered forward-repair bytes", () => {
    const forward = pinnedForwardSql();
    expect(() =>
      pinnedForwardSql(forward.replace("FOR UPDATE OF de SKIP LOCKED", "FOR UPDATE OF de")),
    ).toThrow("forward_migration_fingerprint_mismatch");
  });

  it("keeps the accepted wrapper outside the metadata update byte-identical", () => {
    const oldSql = pinnedManualSql();
    const newSql = pinnedForwardSql();
    const prefix = "CREATE OR REPLACE FUNCTION public.quicklog_save_manual(";
    const oldStart = oldSql.indexOf(prefix);
    const newStart = newSql.indexOf(prefix);
    const metadataStart = oldSql.indexOf("    UPDATE public.diary_entries AS de", oldStart);
    const newMetadataStart = newSql.indexOf("    -- A revision requested by diary id", newStart);
    expect(newSql.slice(newStart, newMetadataStart)).toBe(oldSql.slice(oldStart, metadataStart));
    const remainder = "    IF NOT v_is_reused";
    const oldEnd = oldSql.indexOf("\n$function$;", oldStart) + "\n$function$;".length;
    const newEnd = newSql.indexOf("\n$function$;", newStart) + "\n$function$;".length;
    expect(newSql.slice(newSql.indexOf(remainder, newMetadataStart), newEnd)).toBe(
      oldSql.slice(oldSql.indexOf(remainder, metadataStart), oldEnd),
    );
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
