import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

// Parses the workflow and asserts on the resolved step list, so a commented-out or
// reordered step fails here rather than only in the hosted run (#2301).
type Step = { name?: string; run?: string; with?: { path?: string } };

const workflow = parse(
  readFileSync(resolve(__dirname, "../../.github/workflows/community-v1-db-proof.yml"), "utf8"),
) as { jobs: Record<string, { steps: Step[] }> };
const steps = workflow.jobs["community-v1-db-proof"].steps;
const indexOf = (name: string) => steps.findIndex((s) => s.name === name);
const step = (name: string) => steps[indexOf(name)];

describe("community-v1-db-proof workflow", () => {
  it("runs the catalog proof on the db reset state, before the runtime suite", () => {
    const reset = indexOf("Apply migrations (db reset with grant-parity seed)");
    const catalog = indexOf("Community V1 catalog proof");
    const runtime = indexOf("Community V1 runtime proof");
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(catalog).toBe(reset + 1);
    expect(runtime).toBeGreaterThan(catalog);
  });

  it("enables proof-only auth after the replay copy exists and before Supabase starts", () => {
    const prepare = indexOf("Prepare immutable migration replay workspace");
    const auth = indexOf("Enable proof-only auth in the disposable config");
    const start = indexOf("Start local Supabase");
    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(auth).toBe(prepare + 1);
    expect(start).toBe(auth + 1);
  });

  it("uploads only the replay report and the two proof logs", () => {
    const uploaded = (step("Upload receipts").with?.path ?? "").split("\n").filter(Boolean);
    expect(uploaded).toEqual([
      "migration-replay-compatibility.json",
      "community-v1-runtime.log",
      "community-v1-catalog.log",
    ]);
  });
});

// The step scripts run for real under bash with stub `psql` and `supabase`
// binaries, so the assertions are on behaviour, not on shell text: a check
// that is commented out or moved behind an unreachable branch fails here
// (Codex P2 on #2414 at 77d424b1).
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
  const dir = mkdtempSync(join(tmpdir(), "verdant-community-step-"));
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
  const githubOutput = join(dir, "github-output");
  writeFileSync(githubEnv, "");
  writeFileSync(githubOutput, "");
  const result = spawnSync("bash", ["-e", "-c", step(name).run ?? ""], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      GITHUB_ENV: githubEnv,
      GITHUB_OUTPUT: githubOutput,
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
    env: readFileSync(githubEnv, "utf8"),
    output: readFileSync(githubOutput, "utf8"),
    file,
  };
}

const catalogLog = (passed: number) =>
  Array.from({ length: passed }, (_, i) => `NOTICE:  ✓ T-CAT-0${i + 1} ok`).join("\n");
const psql = (log: string, code: number) => `cat <<'LOG'\n${log}\nLOG\nexit ${code}`;

describe("community-v1-db-proof catalog step verdict", () => {
  it("passes the green path only with exit 0 and all six catalog blocks", () => {
    expect(runStep("Community V1 catalog proof", { psql: psql(catalogLog(6), 0) }).status).toBe(0);
    expect(runStep("Community V1 catalog proof", { psql: psql(catalogLog(5), 0) }).status).not.toBe(
      0,
    );
    expect(runStep("Community V1 catalog proof", { psql: psql(catalogLog(6), 3) }).status).not.toBe(
      0,
    );
  });

  it("passes the red path only when the first block stops on the missing relation", () => {
    const missing = 'ERROR:  relation "public.community_profiles" does not exist';
    const red = { EXPECT: "red" };
    expect(runStep("Community V1 catalog proof", { psql: psql(missing, 3) }, red).status).toBe(0);
    expect(runStep("Community V1 catalog proof", { psql: psql(missing, 0) }, red).status).not.toBe(
      0,
    );
    expect(
      runStep("Community V1 catalog proof", { psql: psql("ERROR: other", 3) }, red).status,
    ).not.toBe(0);
  });
});

describe("community-v1-db-proof start and export steps keep local values private", () => {
  const key = ["eyJlocal", "start", "secret"].join("-");

  it("writes supabase start output only to its log file", () => {
    const ran = runStep("Start local Supabase", { supabase: `echo "service_role key: ${key}"` });
    expect(ran.status).toBe(0);
    expect(ran.stdout).not.toContain(key);
    expect(ran.file("supabase-start.log")).toContain(key);
    expect(ran.output).toContain("started=true");
  });

  it("prints only a redacted tail when supabase start fails", () => {
    const ran = runStep("Start local Supabase", {
      supabase: `echo "DB URL: postgresql://postgres:pw@127.0.0.1:54322/postgres"; echo "anon key: ${key}"; exit 4`,
    });
    expect(ran.status).toBe(4);
    expect(ran.stdout).not.toContain(key);
    expect(ran.stdout).not.toContain("postgres:pw@");
  });

  it("masks every local credential it writes to the job environment", () => {
    const status = JSON.stringify({
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "anon-local-value",
      SERVICE_ROLE_KEY: "service-local-value",
      DB_URL: "postgresql://postgres:local-db-pass@127.0.0.1:54322/postgres",
    });
    const ran = runStep("Export local Supabase env", { supabase: `echo '${status}'` });
    expect(ran.status).toBe(0);
    for (const secret of ["anon-local-value", "service-local-value", "local-db-pass"]) {
      expect(ran.env).toContain(secret);
      const masked = ran.stdout
        .split("\n")
        .filter((line) => line.startsWith("::add-mask::"))
        .some((line) => line.includes(secret));
      expect(masked, `${secret} is masked`).toBe(true);
    }
    expect(
      ran.stdout
        .split("\n")
        .filter((l) => !l.startsWith("::add-mask::"))
        .join("\n"),
    ).not.toMatch(/anon-local-value|service-local-value|local-db-pass/);
  });
});

// Codex P1s on #2419 at 79e2256b: the runner's disposable config copy gets
// anonymous sign-ins and a sign-in limit above the 37-case run; nothing else.
describe("community-v1-db-proof proof-only auth step", () => {
  const NAME = "Enable proof-only auth in the disposable config";
  const BASE = 'project_id = "local"\n\n[functions]\n';

  it("appends the anonymous sign-in and rate-limit settings to the replay copy", () => {
    const run = runStep(NAME, {}, {}, { "supabase/config.toml": BASE });
    expect(run.status).toBe(0);
    expect(run.file("supabase/config.toml")).toBe(
      `${BASE}\n[auth]\nenable_anonymous_sign_ins = true\n\n[auth.rate_limit]\nsign_in_sign_ups = 1000\n`,
    );
  });

  it.each([
    "[auth]\nenabled = true\n",
    "  [auth.rate_limit]\nemail_sent = 2\n",
    "[auth.external.google]\nenabled = false\n",
  ])("refuses to append a second auth table to %j", (existing) => {
    const body = `${BASE}${existing}`;
    const run = runStep(NAME, {}, {}, { "supabase/config.toml": body });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("already declares [auth]");
    expect(run.file("supabase/config.toml")).toBe(body);
  });

  it("fails when the replay copy has no config", () => {
    expect(runStep(NAME, {}).status).not.toBe(0);
  });
});
