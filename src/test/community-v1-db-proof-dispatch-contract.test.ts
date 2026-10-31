/**
 * Additional contract coverage for `.github/workflows/community-v1-db-proof.yml`.
 *
 * The step-order file is scorer-locked after #2462; this file guards dispatch-only
 * wiring and shell branches that are easy to regress without touching that pin.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string; if?: string; with?: { path?: string } };

type WorkflowDoc = {
  on: {
    workflow_dispatch: {
      inputs: {
        expect: { type: string; options: string[]; required: boolean };
      };
    };
  };
  permissions: { contents: string };
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { steps: Step[]; env?: { EXPECT: string } }>;
};

const WORKFLOW_PATH = resolve(__dirname, "../../.github/workflows/community-v1-db-proof.yml");
const workflow = parse(readFileSync(WORKFLOW_PATH, "utf8")) as WorkflowDoc;
const steps = workflow.jobs["community-v1-db-proof"].steps;
const step = (name: string) => steps.find((s) => s.name === name);

describe("community-v1-db-proof workflow — dispatch contract", () => {
  it("is manual-only with a required red/green expect input", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    const expectInput = workflow.on.workflow_dispatch.inputs.expect;
    expect(expectInput.type).toBe("choice");
    expect(expectInput.options).toEqual(["red", "green"]);
    expect(expectInput.required).toBe(true);
  });

  it("keeps read-only contents permission and does not cancel an in-flight proof", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.concurrency.group).toContain("community-v1-db-proof");
  });

  it("wires the dispatch expect input into the job environment", () => {
    expect(workflow.jobs["community-v1-db-proof"].env?.EXPECT).toBe("${{ inputs.expect }}");
  });

  it("always stops local Supabase when start succeeded", () => {
    const stop = step("Stop local Supabase");
    expect(stop?.if).toBe("always() && steps.supabase-start.outputs.started == 'true'");
    expect(stop?.run).toContain("supabase stop");
    expect(stop?.run).toContain("$SUPABASE_REPLAY_WORKDIR");
  });
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runStep(name: string, stubs: Record<string, string>, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verdant-community-contract-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  spawnSync("mkdir", [bin]);
  for (const [command, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, command), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, command), 0o755);
  }
  const githubEnv = join(dir, "github-env");
  writeFileSync(githubEnv, "");
  const runBody = step(name)?.run ?? "";
  const result = spawnSync("bash", ["-e", "-c", runBody], {
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
  return {
    status: result.status,
    stdout: result.stdout,
    file,
    env: readFileSync(githubEnv, "utf8"),
  };
}

describe("community-v1-db-proof runtime step routing", () => {
  const nodeStub = `
if [[ "$1" != "scripts/security/run-community-v1-db-security.mjs" ]]; then exit 9; fi
if [[ "$2" == "--expect-red" ]]; then echo "runtime-red"; exit 0; fi
if [[ -z "$2" ]]; then echo "runtime-green"; exit 0; fi
exit 8
`;

  it("invokes the security runner with --expect-red only on the red dispatch path", () => {
    const red = runStep("Community V1 runtime proof", { node: nodeStub }, { EXPECT: "red" });
    expect(red.status).toBe(0);
    expect(red.file("community-v1-runtime.log")).toContain("runtime-red");

    const green = runStep("Community V1 runtime proof", { node: nodeStub }, { EXPECT: "green" });
    expect(green.status).toBe(0);
    expect(green.file("community-v1-runtime.log")).toContain("runtime-green");
  });
});

describe("community-v1-db-proof export env step", () => {
  it("blocks when local Supabase status omits required connection values", () => {
    const ran = runStep("Export local Supabase env", {
      supabase: 'echo \'{"API_URL":"http://127.0.0.1:54321"}\'',
    });
    expect(ran.status).toBe(2);
    expect(ran.stdout).toContain(
      "BLOCKED: local Supabase did not expose the required local values.",
    );
  });
});
