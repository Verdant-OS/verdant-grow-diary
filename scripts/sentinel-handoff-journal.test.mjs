import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { journalPaths, runCommand } from "./lib/sentinelHandoffJournal.mjs";

const policy = {
  repository: "Verdant-OS/verdant-grow-diary",
  branch: "codex/sentinel-test",
  head: "5459c3a18a402d2bf5b00c96b0688c4475dcf93d",
  taskId: "JOURNAL-TEST",
  holder: "Bloom",
  claimReceipt: "fixture:claim",
  contributors: ["Bloom"],
  independentReviewer: "child",
  paths: ["scripts/lib/newHandoff.mjs"],
  maxAttempts: 2,
  maxChecks: 2,
  maxRepairs: 1,
  maxHops: 2,
  waitMs: 1000,
  routes: {
    inspect: {
      from: "Bloom",
      to: "child",
      purpose: "review",
      destination: "collaboration:/root/child",
      authorizationReceipt: "fixture:route",
      onSuccess: null,
      onFailure: null,
    },
  },
};
const command = (type, data = {}, now = 0) => ({ type, writer: "Bloom", now, ...data });
function setup(t) {
  const journalDir = mkdtempSync(join(tmpdir(), "sentinel-journal-test-"));
  t.after(() => rmSync(journalDir, { recursive: true, force: true }));
  const run = (c, options) => runCommand({ journalDir, policy, command: c }, options);
  run(
    command("CREATE", {
      input: {
        correlationId: "journal-proof",
        taskId: policy.taskId,
        repository: policy.repository,
        branch: policy.branch,
        head: policy.head,
        routeId: "inspect",
        summary: "Read-only inspection.",
      },
    }),
  );
  return { journalDir, run, ...journalPaths(journalDir, policy) };
}
test("fake transport sees a durable reservation before send and restart cannot resend", (t) => {
  const { run, statePath } = setup(t);
  let calls = 0;
  const transport = {
    send(packet) {
      calls++;
      const saved = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(saved.status, "AWAITING_ACK");
      assert.equal(saved.dispatchId, packet.dispatchId);
      throw new Error("fake transport lost its reply after accepting delivery");
    },
  };
  const first = run(command("DISPATCH"));
  assert.throws(() => transport.send(first.action.packet), /lost its reply/);
  const second = run(command("DISPATCH", {}, 1));
  if (second.action) transport.send(second.action.packet);
  assert.equal(calls, 1);
  assert.equal(second.action, null);
});
test("two correlations for the same task cannot create duplicate work", (t) => {
  const { run } = setup(t);
  assert.throws(() => run(command("CREATE", { input: { correlationId: "other" } })), /EXISTS/);
});
test("a held writer lock blocks before mutation and is never removed as stale", (t) => {
  const { run, lockPath, statePath } = setup(t);
  const before = readFileSync(statePath, "utf8");
  writeFileSync(lockPath, "another writer", { flag: "wx" });
  assert.throws(() => run(command("DISPATCH")), /WRITER_LOCKED/);
  assert.equal(readFileSync(statePath, "utf8"), before);
  assert.equal(readFileSync(lockPath, "utf8"), "another writer");
});
test("failed persistence emits no action and releases only its own lock", (t) => {
  const { run, lockPath, statePath } = setup(t);
  const before = readFileSync(statePath, "utf8");
  assert.throws(
    () =>
      run(command("DISPATCH"), {
        commit() {
          throw new Error("DISK_FULL");
        },
      }),
    /DISK_FULL/,
  );
  assert.equal(readFileSync(statePath, "utf8"), before);
  assert.equal(existsSync(lockPath), false);
});
test("a corrupt or leftover pending journal blocks without overwriting evidence", (t) => {
  const { run, statePath, pendingPath } = setup(t);
  writeFileSync(pendingPath, "interrupted commit", { flag: "wx" });
  assert.throws(() => run(command("DISPATCH")), /JOURNAL_PENDING/);
  assert.equal(readFileSync(pendingPath, "utf8"), "interrupted commit");
  rmSync(pendingPath);
  writeFileSync(statePath, "{broken");
  assert.throws(() => run(command("DISPATCH")), /JOURNAL_CORRUPT/);
  assert.equal(readFileSync(statePath, "utf8"), "{broken");
});
