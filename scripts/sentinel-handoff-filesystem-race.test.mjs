import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { journalPaths, runCommand } from "./lib/sentinelHandoffJournal.mjs";

const LIMIT = 1024 * 1024;
const policy = {
  repository: "Verdant-OS/verdant-grow-diary",
  branch: "codex/sentinel-test",
  head: "5459c3a18a402d2bf5b00c96b0688c4475dcf93d",
  taskId: "FILESYSTEM-RACE-TEST",
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
const create = {
  type: "CREATE",
  writer: "Bloom",
  now: 0,
  input: {
    correlationId: "filesystem-race-proof",
    taskId: policy.taskId,
    repository: policy.repository,
    branch: policy.branch,
    head: policy.head,
    routeId: "inspect",
    summary: "Read-only inspection.",
  },
};
const dispatch = { type: "DISPATCH", writer: "Bloom", now: 1 };

// Deterministically mutate a real fixture immediately after its first metadata
// observation. Covers both the old path check and the replacement descriptor check.
// No timing, symlink privileges, transport, or production fixtures are involved.
function installStatRace(target, mutate) {
  const original = Object.fromEntries(
    ["openSync", "statSync", "lstatSync", "fstatSync"].map((key) => [key, fs[key]]),
  );
  const descriptors = new Set();
  let fired = false;
  const after = (matches, stat) => {
    if (matches && !fired) {
      fired = true;
      mutate();
    }
    return stat;
  };
  fs.openSync = (path, ...args) => {
    const fd = original.openSync(path, ...args);
    if (String(path) === target) descriptors.add(fd);
    return fd;
  };
  for (const key of ["statSync", "lstatSync"])
    fs[key] = (path, ...args) => after(String(path) === target, original[key](path, ...args));
  fs.fstatSync = (fd, ...args) => after(descriptors.has(fd), original.fstatSync(fd, ...args));
  syncBuiltinESMExports();
  return () => {
    Object.assign(fs, original);
    syncBuiltinESMExports();
    assert.equal(fired, true, "the fixture mutation must exercise a metadata/read boundary");
  };
}
function setup(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), "sentinel-filesystem-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const journalDir = join(dir, "journal");
  const run = (command) => runCommand({ journalDir, policy, command });
  return { dir, journalDir, run, ...journalPaths(journalDir, policy) };
}

test("replacing a checked journal cannot replay READY over an awaiting acknowledgment", (t) => {
  const { run, statePath, lockPath } = setup(t);
  run(create);
  const ready = fs.readFileSync(statePath, "utf8");
  run(dispatch);
  const restore = installStatRace(statePath, () => {
    fs.renameSync(statePath, `${statePath}.before`);
    fs.writeFileSync(statePath, ready);
  });
  try {
    assert.throws(() => run(dispatch), /JOURNAL_CORRUPT/);
  } finally {
    restore();
  }
  assert.equal(fs.readFileSync(statePath, "utf8"), ready, "preserve replaced evidence");
  assert.equal(JSON.parse(fs.readFileSync(`${statePath}.before`, "utf8")).status, "AWAITING_ACK");
  assert.equal(fs.existsSync(lockPath), false);
});

test("journal growth after the metadata check blocks without emitting a dispatch", (t) => {
  const { run, statePath } = setup(t);
  run(create);
  const restore = installStatRace(statePath, () => fs.appendFileSync(statePath, " ".repeat(LIMIT)));
  try {
    assert.throws(() => run(dispatch), /JOURNAL_CORRUPT/);
  } finally {
    restore();
  }
  assert.ok(fs.statSync(statePath).size > LIMIT, "oversized evidence must remain untouched");
});

test("an existing JSON null journal is corrupt rather than absent", (t) => {
  const { run, statePath } = setup(t);
  run(create);
  fs.writeFileSync(statePath, "null");
  assert.throws(() => run(create), /JOURNAL_CORRUPT/);
  assert.equal(fs.readFileSync(statePath, "utf8"), "null");
});

test("an open ENOENT cannot hide a still-present journal entry", (t) => {
  const { run, statePath } = setup(t);
  run(create);
  const before = fs.readFileSync(statePath, "utf8");
  const original = fs.openSync;
  // Models a dangling link on platforms without O_NOFOLLOW, without requesting
  // local symlink privileges. The directory entry is observable via lstat.
  fs.openSync = (path, ...args) => {
    if (String(path) === statePath)
      throw Object.assign(new Error("fixture missing target"), { code: "ENOENT" });
    return original(path, ...args);
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => run(create), /JOURNAL_CORRUPT/);
  } finally {
    fs.openSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(fs.readFileSync(statePath, "utf8"), before);
});

for (const input of ["policy", "command"]) {
  test(`CLI bounds ${input} bytes even when the file grows after its size check`, (t) => {
    const { dir, journalDir, statePath } = setup(t);
    const policyPath = join(dir, "policy.json");
    const commandPath = join(dir, "command.json");
    const preloadPath = join(dir, "race-preload.mjs");
    fs.writeFileSync(policyPath, JSON.stringify(policy));
    fs.writeFileSync(commandPath, JSON.stringify(create));
    const target = input === "policy" ? policyPath : commandPath;
    fs.writeFileSync(
      preloadPath,
      `import fs from "node:fs";\nimport { syncBuiltinESMExports } from "node:module";\n` +
        `(${installStatRace.toString()})(${JSON.stringify(target)}, () => ` +
        `fs.appendFileSync(${JSON.stringify(target)}, " ".repeat(${LIMIT})));\n`,
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(preloadPath).href,
        "scripts/sentinel-handoff.mjs",
        policyPath,
        journalDir,
        commandPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /BLOCKED: INPUT_TOO_LARGE/);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(statePath), false, "invalid input cannot create a journal");
  });
}

test("CLI still accepts a regular JSON input at the exact one MiB limit", (t) => {
  const { dir, journalDir } = setup(t);
  const policyPath = join(dir, "policy.json");
  const commandPath = join(dir, "command.json");
  const encoded = JSON.stringify(policy);
  fs.writeFileSync(policyPath, encoded + " ".repeat(LIMIT - Buffer.byteLength(encoded)));
  fs.writeFileSync(commandPath, JSON.stringify(create));
  const result = spawnSync(
    process.execPath,
    ["scripts/sentinel-handoff.mjs", policyPath, journalDir, commandPath],
    { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state.status, "READY");
});
