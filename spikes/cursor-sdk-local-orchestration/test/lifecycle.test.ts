import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runOrchestration } from "../src/runCoordinator.ts";
import { FakeSdkAdapter } from "../src/sdkAdapter.ts";

const REPO_ROOT = join(fileURLToPath(new URL("../..", import.meta.url)), "..");

describe("cancellation, disposal, and cleanup", () => {
  it("times out a hung inspector, cancels, disposes, and removes temp state", async () => {
    const adapter = new FakeSdkAdapter({ inspectorHangMs: 5_000 });
    const result = await runOrchestration({
      adapter,
      repoRoot: REPO_ROOT,
      wallClockMs: 80,
    });
    expect(result.receipt.hostVerdict).toBe("TIMEOUT");
    expect(result.receipt.notes.some((note) => /timeout/i.test(note))).toBe(true);
    expect(adapter.disposedRoles).toContain("inspector");
    expect(adapter.disposedRoles).toContain("reviewer");
    expect(result.receipt.cleanupStatus).toBe("PASS");
    expect(existsSync(result.workspace.cwd)).toBe(false);
    expect(existsSync(result.workspace.storeRoot)).toBe(false);
    expect(existsSync(result.workspace.externalCanaryPath)).toBe(false);
  });

  it("removes JSONL store files after a successful fake pipeline", async () => {
    const adapter = new FakeSdkAdapter();
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(result.receipt.cleanupStatus).toBe("PASS");
    expect(existsSync(result.workspace.storeRoot)).toBe(false);
    expect(existsSync(join(result.workspace.storeRoot, "runs.ndjson"))).toBe(false);
    expect(existsSync(join(result.workspace.storeRoot, "agents.ndjson"))).toBe(false);
  });

  it("records matching fixture hashes when the immutable file is untouched", async () => {
    const result = await runOrchestration({
      adapter: new FakeSdkAdapter(),
      repoRoot: REPO_ROOT,
    });
    expect(result.receipt.fixtureHashAfter).toBe(result.receipt.fixtureHashBefore);
    expect(result.receipt.fixtureHashAfter).not.toBe("missing");
  });
});
