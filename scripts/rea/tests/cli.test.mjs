import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

async function waitFor(path) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await delay(20);
    }
  }
  throw new Error("Fixture did not reach the expected phase.");
}

async function fixture(mode, run, prefix = "rea-cli-fixture-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const chrome = fileURLToPath(new URL("./fixtures/chrome.mjs", import.meta.url));
  const rea = fileURLToPath(new URL("./fixtures/rea.mjs", import.meta.url));
  const profileFile = join(dir, "profile"),
    phaseFile = join(dir, "phase");
  const outputFile = join(dir, "output");
  const browserPid = join(dir, "browser-pid"),
    reaPid = join(dir, "rea-pid");
  await writeFile(join(dir, "config.json"), JSON.stringify({ mode }), { mode: 0o600 });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const child = spawn(
    process.execPath,
    [
      ...(mode === "rollback"
        ? ["--import", fileURLToPath(new URL("./fixtures/slow-rollback.mjs", import.meta.url))]
        : []),
      "scripts/rea/bundle-map.mjs",
      "--commit",
      commit,
      "--rea",
      rea,
      "--chrome",
      chrome,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VERDANT_REA_FIXTURE_DIR: dir } },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completed = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  try {
    await run({
      child,
      completed,
      profileFile,
      phaseFile,
      outputFile,
      fixtureDir: dir,
      result: () => ({ stdout, stderr }),
    });
  } finally {
    if (child.exitCode === null && !child.signalCode) {
      child.kill("SIGTERM");
      await completed;
    }
    for (const file of [browserPid, reaPid]) {
      try {
        process.kill(-Number(await readFile(file, "utf8")), "SIGKILL");
      } catch {
        /* Owned fixture already exited. */
      }
    }
    try {
      await rm(await readFile(profileFile, "utf8"), { recursive: true, force: true });
    } catch {
      /* No profile. */
    }
    try {
      await rm(dirname(await readFile(outputFile, "utf8")), { recursive: true, force: true });
    } catch {
      /* No export. */
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("CLI writes a measured report and actual session export, then removes its browser profile", async () => {
  await fixture("success", async ({ completed, profileFile, outputFile, result }) => {
    assert.equal(await completed, 0, result().stderr);
    const output = await readFile(outputFile, "utf8");
    const inventory = JSON.parse(await readFile(join(dirname(output), "inventory.json"), "utf8"));
    assert.equal(inventory.observed_route_candidate_count, 1);
    assert.equal(inventory.unmatched_route_candidates[0].path, "/fixture");
    assert.equal(JSON.parse(await readFile(output, "utf8")).records.length, 2);
    assert.match(await readFile(join(dirname(output), "report.md"), "utf8"), /Verified:/);
    await assert.rejects(access(await readFile(profileFile, "utf8")));
  });
});

test("termination during failed-export rollback still removes the incomplete output", async () => {
  await fixture("rollback", async ({ child, completed, phaseFile, outputFile, fixtureDir }) => {
    assert.equal(await waitFor(phaseFile), "rollback");
    child.kill("SIGTERM");
    await delay(30);
    child.kill("SIGINT");
    await writeFile(join(fixtureDir, "release"), "continue");
    assert.equal(await completed, 1);
    await assert.rejects(access(dirname(await readFile(outputFile, "utf8"))));
  });
});

test("unsafe capture exits without exporting or echoing credentials", async () => {
  await fixture("unsafe", async ({ completed, outputFile, profileFile, result }) => {
    assert.equal(await completed, 1);
    await assert.rejects(access(outputFile));
    assert.ok(!JSON.stringify(result()).includes("synthetic-never-save"));
    await assert.rejects(access(await readFile(profileFile, "utf8")));
  });
});

test("fixture paths containing spaces and shell characters are passed as data", async () => {
  await fixture(
    "success",
    async ({ completed, outputFile, result }) => {
      assert.equal(await completed, 0, result().stderr);
      assert.equal(
        JSON.parse(await readFile(await readFile(outputFile, "utf8"), "utf8")).records.length,
        2,
      );
    },
    "rea-fixture space-$-`-",
  );
});

for (const phase of ["startup", "capture", "export", "cleanup"]) {
  test(`SIGTERM during ${phase} closes owned processes and removes incomplete output`, async () => {
    await fixture(phase, async ({ child, completed, profileFile, phaseFile, outputFile }) => {
      await waitFor(phase === "startup" ? profileFile : phaseFile);
      child.kill("SIGTERM");
      assert.equal(await completed, 1);
      await assert.rejects(access(await readFile(profileFile, "utf8")));
      if (phase === "export" || phase === "cleanup")
        await assert.rejects(access(dirname(await readFile(outputFile, "utf8"))));
      else await assert.rejects(access(outputFile));
    });
  });
}

test("repeated SIGTERM during shutdown keeps cleanup active until owned processes exit", async () => {
  await fixture("cleanup", async ({ child, completed, profileFile, phaseFile, outputFile }) => {
    await waitFor(phaseFile);
    child.kill("SIGTERM");
    await delay(30);
    child.kill("SIGTERM");
    assert.equal(await completed, 1);
    await assert.rejects(access(await readFile(profileFile, "utf8")));
    await assert.rejects(access(dirname(await readFile(outputFile, "utf8"))));
  });
});
