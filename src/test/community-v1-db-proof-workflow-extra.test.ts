import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string };

const workflow = parse(
  readFileSync(resolve(__dirname, "../../.github/workflows/community-v1-db-proof.yml"), "utf8"),
) as { jobs: Record<string, { steps: Step[] }> };
const steps = Object.values(workflow.jobs)[0].steps;
const step = (name: string) => steps.find((s) => s.name === name);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runStep(
  name: string,
  stubs: Record<string, string>,
  env: Record<string, string> = {},
  files: Record<string, string> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "verdant-community-step-extra-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    spawnSync("mkdir", ["-p", join(dir, rel, "..")]);
    writeFileSync(join(dir, rel), body);
  }
  const bin = join(dir, "bin");
  spawnSync("mkdir", [bin]);
  for (const [command, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, command), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, command), 0o755);
  }
  const githubEnv = join(dir, "github-env");
  writeFileSync(githubEnv, "");
  const script = step(name)?.run ?? "";
  const result = spawnSync("bash", ["-e", "-c", script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      GITHUB_ENV: githubEnv,
      SUPABASE_REPLAY_WORKDIR: dir,
      SUPABASE_DB_URL: "postgresql://postgres:local@127.0.0.1:54322/postgres",
      ...env,
    },
  });
  const file = (rel: string) =>
    existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null;
  return { status: result.status, stdout: result.stdout, file };
}

describe("community-v1-db-proof export env step", () => {
  it("blocks when local Supabase status omits required values", () => {
    const empty = runStep("Export local Supabase env", { supabase: "echo '{}'" });
    expect(empty.status).toBe(2);
    expect(empty.stdout).toContain("BLOCKED");
  });
});

describe("community-v1-db-proof runtime step", () => {
  it("passes --expect-red to the runner only when EXPECT is red", () => {
    const node = `echo "node $@" >> "$PWD/node-invocations.log"\nexit 0`;
    const red = runStep(
      "Community V1 runtime proof",
      { node },
      { EXPECT: "red" },
      { "scripts/security/run-community-v1-db-security.mjs": "# stub runner" },
    );
    expect(red.status).toBe(0);
    expect(red.file("node-invocations.log")).toContain("--expect-red");

    const green = runStep(
      "Community V1 runtime proof",
      { node },
      { EXPECT: "green" },
      { "scripts/security/run-community-v1-db-security.mjs": "# stub runner" },
    );
    expect(green.status).toBe(0);
    expect(green.file("node-invocations.log")).not.toContain("--expect-red");
  });
});
