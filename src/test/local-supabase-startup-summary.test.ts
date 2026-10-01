import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { load } from "js-yaml";
import { summarizeStartupLog } from "../../scripts/summarize-local-supabase-startup.mjs";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/summarize-local-supabase-startup.mjs");
const SECRET = "synthetic-private-startup-marker-do-not-print";
const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "verdant-startup-summary-test-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) {
      throw new Error("Test cleanup escaped the temporary directory");
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("private Supabase startup log summary", () => {
  it("reports rate-limit evidence without printing credentials or the raw error", () => {
    const summary = summarizeStartupLog(
      `SERVICE_ROLE_KEY=${SECRET}\nerror pulling image: toomanyrequests: ${SECRET}`,
    );
    expect(summary.signals).toEqual(["registry_rate_limit"]);
    expect(summary.recognized_sqlstates).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(SECRET);
    expect(JSON.stringify(summary)).not.toContain("SERVICE_ROLE_KEY");
  });

  it("recognizes explicit allowlisted SQLSTATEs, sorts and deduplicates them", () => {
    const summary = summarizeStartupLog(
      "ERROR: duplicate function (SQLSTATE 42883)\nSQLSTATE 42P01\nSQLSTATE 42883",
    );
    expect(summary.signals).toEqual(["database_sql_error"]);
    expect(summary.recognized_sqlstates).toEqual(["42883", "42P01"]);
  });

  it("does not reflect arbitrary SQLSTATE text or an unlabelled five-character value", () => {
    const summary = summarizeStartupLog(`SQLSTATE ${SECRET}\npassword=42501`);
    expect(summary.recognized_sqlstates).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(SECRET);
    expect(JSON.stringify(summary)).not.toContain("42501");
  });

  it.each([
    ["unauthorized: authentication required", "registry_access_denied"],
    ["x509: certificate signed by unknown authority", "registry_transport_error"],
    ["container is not healthy", "container_health_failure"],
    ["bind: address already in use", "port_in_use"],
    ["Cannot connect to the Docker daemon", "docker_unavailable"],
  ])("reports only the fixed signal for %s", (log, signal) => {
    expect(summarizeStartupLog(log).signals).toEqual([signal]);
  });

  it("does not invent an error from healthy startup output or an ordinary 429 value", () => {
    const summary = summarizeStartupLog(`Started Supabase\nANON_KEY=${SECRET}\nmetric=429`);
    expect(summary.log_available).toBe(true);
    expect(summary.signals).toEqual([]);
    expect(summary.recognized_sqlstates).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(SECRET);
  });

  it.each([null, undefined, 7, {}, []])("is null-safe for unavailable input %s", (input) => {
    expect(summarizeStartupLog(input)).toEqual({
      version: 1,
      log_available: false,
      signals: [],
      recognized_sqlstates: [],
    });
  });

  it("produces the same summary twice without mutating its input", () => {
    const log = "HTTP 429 Too Many Requests\nERROR: denied (SQLSTATE 42501)";
    const first = summarizeStartupLog(log);
    expect(first).toEqual({
      version: 1,
      log_available: true,
      signals: ["database_sql_error", "registry_rate_limit"],
      recognized_sqlstates: ["42501"],
    });
    expect(summarizeStartupLog(log)).toEqual(first);
  });
});

describe("startup summary command", () => {
  it("reads a bounded tail of the actual private log without exposing its path or contents", () => {
    const directory = temporaryDirectory();
    const path = join(directory, `${SECRET}.log`);
    writeFileSync(path, `${SECRET}\n${"x".repeat(200_000)}\nERROR: missing (SQLSTATE 42P01)`);
    const result = spawnSync(process.execPath, [SCRIPT, `--log-file=${path}`, "--phase=reset"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      version: 1,
      phase: "reset",
      log_available: true,
      truncated: true,
      signals: ["database_sql_error"],
      recognized_sqlstates: ["42P01"],
    });
    expect(result.stdout + result.stderr).not.toContain(SECRET);
    expect(result.stdout + result.stderr).not.toContain(directory);
  });

  it("reports an unreadable log without printing filesystem errors", () => {
    const path = join(temporaryDirectory(), `${SECRET}.log`);
    const result = spawnSync(process.execPath, [SCRIPT, `--log-file=${path}`, "--phase=start"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      version: 1,
      phase: "start",
      log_available: false,
      truncated: false,
      signals: [],
      recognized_sqlstates: [],
    });
    expect(result.stdout + result.stderr).not.toContain(SECRET);
    expect(result.stderr).toBe("");
  });

  it("rejects unknown arguments without echoing private argument values", () => {
    const result = spawnSync(process.execPath, [SCRIPT, `--unknown=${SECRET}`], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({ version: 1, status: "invalid_arguments" });
    expect(result.stdout + result.stderr).not.toContain(SECRET);
  });
});

const bashCandidates = [
  "bash",
  join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe"),
];
const bash = bashCandidates.find((candidate) => spawnSync(candidate, ["-c", "true"]).status === 0);

describe("resolved workflow failure boundary", () => {
  it.each(["start", "reset"])(
    "keeps the %s failure blocking while publishing only the safe summary",
    { skip: !bash && !process.env.CI },
    (phase) => {
      expect(bash, "The workflow failure-boundary proof requires Bash in CI").toBeDefined();
      const workflow = load(
        readFileSync(join(ROOT, ".github/workflows/irrigation-evidence-gate.yml"), "utf8"),
      ) as { jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }> };
      const command = workflow.jobs["irrigation-rls-runtime"].steps.find(
        (step) => step.name === "Start disposable local Supabase",
      )?.run;
      expect(command).toBeDefined();
      const directory = temporaryDirectory();
      const runnerTemp = directory.replace(/\\/g, "/");
      const fakeBoundary = `
supabase() {
  if [ "$FAKE_FAILURE_PHASE" = "reset" ] && [ "$1" = "start" ]; then return 0; fi
  printf '%s\\n' "$FAKE_PRIVATE_LOG" >&2
  return 9
}
${command}`;
      const result = spawnSync(bash!, ["-c", fakeBoundary], {
        cwd: ROOT,
        env: {
          ...process.env,
          RUNNER_TEMP: runnerTemp,
          SUPABASE_REPLAY_WORKDIR: runnerTemp,
          FAKE_FAILURE_PHASE: phase,
          FAKE_PRIVATE_LOG: `SERVICE_ROLE_KEY=${SECRET}\nERROR: missing (SQLSTATE 42P01)`,
        },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      const summaryLine = result.stdout.split("\n").find((line) => line.startsWith("{"));
      expect(summaryLine).toBeDefined();
      expect(JSON.parse(summaryLine!)).toMatchObject({
        phase,
        log_available: true,
        signals: ["database_sql_error"],
        recognized_sqlstates: ["42P01"],
      });
      expect(result.stdout).toContain("::error::Disposable local Supabase");
      expect(result.stdout + result.stderr).not.toContain(SECRET);
      expect(readFileSync(join(directory, `irrigation-supabase-${phase}.log`), "utf8")).toContain(
        SECRET,
      );
    },
  );
});
