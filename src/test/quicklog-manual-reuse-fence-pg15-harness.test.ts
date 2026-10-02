import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runManualReuseHarness,
  validateLocalTarget,
} from "../../scripts/run-quicklog-manual-reuse-fence-pg15-harness.mjs";

const localUrl =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";

describe("Quick Log manual replay PostgreSQL 15 proof", () => {
  it("rejects hosted and arbitrary local databases before any SQL runs", async () => {
    const rejected = [
      "postgresql://postgres:secret@db.example.test:5432/verdant_quicklog_delegate_repair",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_delegate_repair",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_delegate_repair",
    ];
    let spawnCount = 0;
    for (const url of rejected) {
      expect(validateLocalTarget({ url })).toBeNull();
      await expect(
        runManualReuseHarness({
          url,
          spawnImpl: () => {
            spawnCount += 1;
            return { status: 1, stdout: "", stderr: "" };
          },
        }),
      ).resolves.toBe(1);
    }
    expect(spawnCount).toBe(0);
  });

  it("requires the disposable sentinel before resetting a schema", async () => {
    const inputs: string[] = [];
    await expect(
      runManualReuseHarness({
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

  it("triggers a dedicated disposable PG15 job for migration changes", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/quicklog-manual-reuse-fence-pg15.yml"),
      "utf8",
    );
    expect(workflow).toContain("20260927002000_quicklog_manual_reuse_fence.sql");
    expect(workflow).toContain("postgres:15.18@sha256:");
    expect(workflow).toContain("QUICKLOG_MANUAL_REUSE_PG15_CONTAINER");
    expect(workflow).not.toContain("workflow_dispatch");
  });
});
