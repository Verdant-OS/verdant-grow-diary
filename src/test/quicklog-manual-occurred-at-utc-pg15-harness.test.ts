import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UTC_HASH_WRAPPER_MD5,
  pinnedUtcHashSql,
  runManualOccurredAtUtcHarness,
} from "../../scripts/run-quicklog-manual-occurred-at-utc-pg15-harness.mjs";
import { pinnedForwardSql } from "../../scripts/run-quicklog-manual-reuse-lock-pg15-harness.mjs";

const localUrl =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";

function wrapperBody(sql: string): string {
  const open = sql.indexOf("AS $function$");
  const close = sql.indexOf("$function$;", open + 13);
  if (open < 0 || close < 0) throw new Error("wrapper body missing");
  return sql.slice(open + 13, close);
}

describe("Quick Log manual occurred_at UTC hash PostgreSQL 15 proof", () => {
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
    await expect(runManualOccurredAtUtcHarness({ url, spawnImpl })).resolves.toBe(1);
    expect(calls).toBe(0);
  });

  it("does not reset a database without the disposable sentinel", async () => {
    const inputs: string[] = [];
    await expect(
      runManualOccurredAtUtcHarness({
        url: localUrl,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          inputs.push(String(options.input ?? ""));
          return { status: 0, stdout: "rejected\n", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("refuses altered repair bytes", () => {
    const repair = pinnedUtcHashSql();
    expect(() =>
      pinnedUtcHashSql(
        repair.replace(
          "       AND v_existing_request_hash <> v_session_request_hash THEN",
          "       THEN",
        ),
      ),
    ).toThrow("utc_hash_migration_fingerprint_mismatch");
  });

  it("pins the predecessor and its own wrapper source by the md5 PostgreSQL checks", () => {
    const repair = pinnedUtcHashSql();
    const predecessorMd5 = createHash("md5").update(wrapperBody(pinnedForwardSql())).digest("hex");
    const ownMd5 = createHash("md5").update(wrapperBody(repair)).digest("hex");
    expect(ownMd5).toBe(UTC_HASH_WRAPPER_MD5);
    const [preflight, rest] = repair.split(
      "CREATE OR REPLACE FUNCTION public.quicklog_save_manual(",
    );
    expect(preflight).toContain(`= '${predecessorMd5}'`);
    expect(rest.slice(rest.lastIndexOf("$function$;"))).toContain(`= '${ownMd5}'`);
  });

  it("changes only the occurred_at hash binding of the predecessor wrapper", () => {
    const before = wrapperBody(pinnedForwardSql()).split("\n");
    const after = wrapperBody(pinnedUtcHashSql()).split("\n");
    const added = after.filter((line) => !before.includes(line));
    const removed = before.filter((line) => !after.includes(line));
    // Only the conflict test's terminator moves to the new session-hash line.
    expect(removed).toEqual(["       AND v_existing_request_hash <> v_request_hash THEN"]);
    // Every other predecessor line survives, in order.
    let cursor = 0;
    for (const line of before) {
      if (removed.includes(line)) continue;
      cursor = after.indexOf(line, cursor);
      expect(cursor).toBeGreaterThanOrEqual(0);
      cursor += 1;
    }
    expect(added.join("\n")).toContain("'occurred_at', v_occurred_at_utc,");
    expect(added.join("\n")).toContain(
      "AND v_existing_request_hash <> v_session_request_hash THEN",
    );
    expect(added.join("\n")).not.toMatch(/INSERT|UPDATE|DELETE|GRANT|REVOKE/);
  });

  it("runs in the dedicated disposable PG15 job for these paths", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/quicklog-manual-reuse-fence-pg15.yml"),
      "utf8",
    );
    expect(workflow).toContain("20261001180000_quicklog_manual_occurred_at_utc_hash.sql");
    expect(workflow).toContain("scripts/run-quicklog-manual-occurred-at-utc-pg15-harness.mjs");
    expect(workflow).toContain("src/test/quicklog-manual-occurred-at-utc-pg15-harness.test.ts");
    expect(workflow).toContain(
      "run: node scripts/run-quicklog-manual-occurred-at-utc-pg15-harness.mjs",
    );
  });
});
