/**
 * Contract for scripts/probe-migration-drift.mjs.
 *
 * Why it exists: on 2026-08-05 migration 20260805090000 began failing on
 * every apply, the runner stopped, and SEVEN migrations never reached
 * production for six days — including an action_queue_create RPC that
 * shipped client code already calling it. CI was green throughout, because
 * CI checks that migrations are well-formed, not that production ran them.
 * The gap was found only by querying schema_migrations by hand.
 *
 * The load-bearing property is NOT "does it print nicely" — it is that a
 * probe which cannot reach the database exits non-zero. A probe that
 * silently reports success when it checked nothing recreates the exact
 * blind spot it was built to close.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import {
  redactDbUrl,
  REDACTION_PLACEHOLDER,
  CONNECTION_URL,
} from "../../scripts/lib/redactDbUrl.mjs";

const ROOT = resolve(__dirname, "../..");
const PROBE = "scripts/probe-migration-drift.mjs";
const SRC = readFileSync(resolve(ROOT, PROBE), "utf8");

function runProbe(args: string[], env: Record<string, string | undefined> = {}) {
  const clean = { ...process.env, ...env };
  // Ensure no ambient URL leaks in and accidentally satisfies the probe.
  delete clean.SUPABASE_DB_URL;
  delete clean.SUPABASE_DB_URL_LIVE;
  delete clean.DATABASE_URL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  try {
    const stdout = execFileSync("node", [PROBE, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: clean,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("migration drift probe — cannot silently pass", () => {
  it("exits 2 (not 0) when no database URL is available", () => {
    const { code, stderr } = runProbe([]);
    expect(code).toBe(2);
    expect(stderr).toContain("COULD NOT PROBE");
    // The distinction that matters: unreachable != healthy.
    expect(stderr).toContain("This is NOT a pass");
  });

  it("reports could_not_probe in --json mode rather than a success status", () => {
    const { stdout } = runProbe(["--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("could_not_probe");
    expect(parsed.status).not.toBe("current");
  });

  it("exits 2 when psql is unavailable or the database is unreachable", () => {
    const { code } = runProbe(["--url", "postgresql://nobody@127.0.0.1:1/nope"]);
    expect(code).toBe(2);
  });

  // Timeout raised from the 5s default: this test spawns three node
  // subprocesses, measured at 430ms idle but 1.2s under load, and this file
  // spawns more of them than it used to. Observed failing once on a busy
  // machine. A flake here reads as "the probe can pass vacuously", which is
  // alarming for entirely the wrong reason.
  it("never exits 0 on any failure path", () => {
    // Exit 0 must be reachable ONLY by a real, successful comparison.
    expect(runProbe([]).code).not.toBe(0);
    expect(runProbe(["--json"]).code).not.toBe(0);
    expect(runProbe(["--url", "postgresql://nobody@127.0.0.1:1/nope"]).code).not.toBe(0);
  }, 20_000);
});

describe("migration drift probe — detection contract", () => {
  it("diffs the FULL version set, not just the max applied version", () => {
    // A runner that skips a failure and continues leaves a gap in the middle.
    // Comparing only max-applied would miss it entirely.
    expect(SRC).toContain("Full-set diff, not max-version");
    expect(SRC).toMatch(/repo\.keys\(\)\]\.filter\(\(v\)\s*=>\s*!applied\.has\(v\)\)/);
  });

  it("distinguishes a mid-sequence GAP from a stopped tail", () => {
    // A gap means the live schema is in a state nobody authored — strictly
    // worse than a tail, and it needs different remediation.
    expect(SRC).toMatch(/unapplied\.filter\(\(v\)\s*=>\s*v\s*<\s*maxApplied\)/);
    expect(SRC).toContain("GAP");
    expect(SRC).toContain("state nobody authored");
  });

  it("is read-only by construction", () => {
    // The connection must be incapable of writing even if this script is wrong.
    expect(SRC).toContain("default_transaction_read_only=on");
    expect(SRC).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|TABLE|FROM)\b/i);
  });

  it("surfaces the age of the oldest pending migration", () => {
    // Six days of drift went unnoticed; age is what makes it obviously wrong.
    expect(SRC).toContain("function ageInDays(");
    expect(SRC).toContain("Oldest pending is");
  });
});

/**
 * The probe holds the production connection string and passes it to psql as an
 * argv element. Its output is not merely logged — the scheduled workflow copies
 * it verbatim into a GitHub issue body, which Actions secret masking does not
 * cover. So "does this ever print a credential" is a publication question, not
 * a logging one.
 *
 * The regression: when psql failed WITHOUT writing stderr, the diagnostic fell
 * back to String(error), and for an execFileSync failure that string contains
 * the full command — including the URL.
 */
const SECRET_PASSWORD = "s3cret-pa55word-long-enough";
const SECRET_URL = `postgresql://produser:${SECRET_PASSWORD}@db.example.com:5432/postgres`;

describe("migration drift probe — never publishes credentials", () => {
  it("redacts the exact String(error) shape that leaked the URL", () => {
    // Reproduce the real failure: a command that exists, exits non-zero, and
    // writes nothing to stderr (psql killed before emitting diagnostics).
    let diagnostic = "";
    try {
      execFileSync("node", ["-e", "process.exit(3)", SECRET_URL], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
    } catch (error) {
      const e = error as { stderr?: string };
      expect(e.stderr ?? "").toBe(""); // the precondition that triggered the bug
      diagnostic = (e.stderr || "" || String(error)).trim();
    }
    expect(diagnostic).toContain(SECRET_PASSWORD); // unredacted, this leaks
    expect(redactDbUrl(diagnostic, SECRET_URL)).not.toContain(SECRET_PASSWORD);
    expect(redactDbUrl(diagnostic, SECRET_URL)).toContain(REDACTION_PLACEHOLDER);
  });

  it("redacts a connection URL it was never handed", () => {
    // psql can echo a URL back, and a stack frame can carry one. Redaction is
    // pattern-based precisely so unenumerated paths are still covered.
    const text = `connection to postgresql://someone:othersecret@host:5432/db failed`;
    expect(redactDbUrl(text, undefined)).not.toContain("othersecret");
    expect(redactDbUrl(text, "postgresql://unrelated@elsewhere/db")).not.toContain("othersecret");
  });

  it("leaves ordinary diagnostics readable", () => {
    // Over-redaction would blind the operator this probe exists to alert.
    const text = "supabase_migrations.schema_migrations not found";
    expect(redactDbUrl(text, SECRET_URL)).toBe(text);
  });

  it("routes every emit through redaction — no raw console call survives", () => {
    // A single console.log added later would bypass the whole fix.
    const rawConsoleCalls = SRC.match(/console\.(?:log|error)\(/g) ?? [];
    expect(rawConsoleCalls).toHaveLength(2); // only the two redacting helpers
    expect(SRC).toContain("const say = (line) => console.log(redactDbUrl(line, dbUrl));");
    expect(SRC).toContain("const warn = (line) => console.error(redactDbUrl(line, dbUrl));");
  });

  it("does not raise a false alert when the package mirror hiccups", () => {
    // Since the alert now fires whenever the probe fails to complete, a
    // transient apt failure would file a false "production unmeasured" issue.
    // Observed for real: apt-get update returned 403 for a third-party repo
    // this job does not use, and apt-get fails the command when ANY source
    // errors. The install is the only load-bearing part, and it must still
    // fail loudly if psql is genuinely unavailable.
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    expect(workflow).toContain("apt-get update -qq || echo");
    expect(workflow).toContain("could not install postgresql-client after 3 attempts");
  });

  it("closes the tracking issue after a clean run, from a single shared title", () => {
    // The title is present tense, so an issue left open after recovery asserts
    // something false and an operator cannot tell active drift from a stale
    // alert. A channel that cannot go quiet stops being read at all — which is
    // the habit that let six days pass unnoticed.
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    expect(workflow).toContain("Close the drift tracking issue after a clean run");
    expect(workflow).toContain('state_reason: "completed"');
    // Both steps must match on ONE title. Two hand-copied literals would drift
    // and the close step would silently never find the issue.
    expect(workflow).toContain("DRIFT_ISSUE_TITLE:");
    const literalTitles = workflow.match(
      /"Migration drift: production is not running every committed migration"/g,
    );
    expect(literalTitles).toHaveLength(1); // the env definition, and nowhere else
    expect(workflow.match(/process\.env\.DRIFT_ISSUE_TITLE/g)).toHaveLength(2);
  });

  it("still opens an issue when the probe never ran at all", () => {
    // If a step BEFORE the probe fails (checkout, node, the psql install, the
    // secret guard), exit_code is never set. Gating on that output alone means
    // the run goes merely red and opens NO issue — so a rotated secret could
    // leave production unmeasured indefinitely, which is precisely the
    // low-visibility failure this workflow exists to prevent. outcome is
    // unambiguous where an unset output is not.
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    expect(workflow).toContain("steps.probe.outcome != 'success'");
    // The bare output-only gate must not come back.
    expect(workflow).not.toMatch(/if: always\(\) && steps\.probe\.outputs\.exit_code != '0'\s*$/m);
    // And the issue must say which of the two happened.
    expect(workflow).toContain("probeNeverRan");
    expect(workflow).toContain("PROBE_OUTCOME");
  });

  it("finds the tracking issue on any page, and never matches a pull request", () => {
    // A single listForRepo page caps at 100. Once the drift issue falls off
    // page one the dedupe stops finding it and opens a NEW issue daily, which
    // buries the real signal under noise — the same alert-fatigue failure the
    // probe's design notes argue against elsewhere. The endpoint also returns
    // pull requests, so a PR sharing the title would be commented on instead.
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    expect(workflow).toContain("github.paginate(github.rest.issues.listForRepo");
    // The regression guard that matters: the unpaginated call form is
    // `listForRepo({`, the paginated one is `listForRepo,`. Reverting to a
    // single page reintroduces the bug silently, since it works fine until
    // the repo crosses 100 open issues.
    expect(workflow).not.toContain("github.rest.issues.listForRepo({");
    expect(workflow).toContain("!i.pull_request");
  });

  it("keeps the workflow's second redaction layer in sync with this module", () => {
    // The workflow inlines the same pattern in its github-script step, as an
    // independent layer at the boundary that actually publishes. Two
    // hand-maintained copies of a security regex drift apart — this repo has
    // been bitten by exactly that with the _shared helper copies — so pin the
    // inline one to the module's own source.
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    expect(workflow).toContain(CONNECTION_URL.source);
    expect(workflow).toContain(REDACTION_PLACEHOLDER);
  });

  it("catches an uncaught throw instead of letting a raw stack reach stderr", () => {
    // The workflow reads drift.err into the issue body when drift.json is
    // empty, and a stack printed by Node never passes through say()/warn().
    expect(SRC).toMatch(/catch \(error\) \{[\s\S]*?bail\("unexpected failure"/);
  });

  // End-to-end: proving the helper works is not proving every path uses it.
  // The workflow reads BOTH streams, so assert against them combined.
  //
  // Coverage note, so these are not mistaken for more than they are: which
  // branch runs depends on the host. Where psql is absent (a Windows dev box)
  // these take the ENOENT branch, which never held the URL — they still assert
  // the invariant, but they do not exercise the regression. The shim test
  // below is the one that reproduces it, and it can only run on POSIX.
  for (const [label, argv] of [
    ["unreachable host", ["--url", `postgresql://u:${SECRET_PASSWORD}@127.0.0.1:1/nope`]],
    ["json mode", ["--json", "--url", `postgresql://u:${SECRET_PASSWORD}@127.0.0.1:1/nope`]],
  ] as const) {
    it(`emits no credential material on stdout or stderr (${label})`, () => {
      const { stdout, stderr, code } = runProbe([...argv]);
      expect(code).toBe(2);
      expect(`${stdout}\n${stderr}`).not.toContain(SECRET_PASSWORD);
    });
  }

  // The actual regression, end to end: a psql that EXISTS, fails, and writes
  // nothing to stderr. That is what drove the diagnostic to String(error).
  //
  // POSIX-only by necessity, not preference: since CVE-2024-27980, Node's
  // execFileSync refuses to resolve a .cmd/.bat shim and reports ENOENT, so
  // this branch is unreachable on Windows. CI runs the probe on ubuntu, which
  // is the platform that matters.
  it.skipIf(process.platform === "win32")(
    "a psql that fails without stderr cannot leak the URL (end to end)",
    () => {
      const shimDir = mkdtempSync(join(tmpdir(), "drift-psql-shim-"));
      writeFileSync(join(shimDir, "psql"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
      const { stdout, stderr, code } = runProbe(["--json", "--url", SECRET_URL], {
        PATH: `${shimDir}:${process.env.PATH}`,
      });
      expect(code).toBe(2);
      // Reaching the fallback branch at all is part of the assertion: if the
      // shim were not invoked this would report "not installed" and prove
      // nothing.
      expect(JSON.parse(stdout).message).toContain("psql query failed");
      expect(`${stdout}\n${stderr}`).not.toContain(SECRET_PASSWORD);
    },
  );

  it("still emits parseable JSON with redaction live", () => {
    // A redaction pass that mangles the JSON would break the step summary
    // fence and the issue body at the same time.
    const { stdout } = runProbe([
      "--json",
      "--url",
      `postgresql://u:${SECRET_PASSWORD}@127.0.0.1:1/nope`,
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("could_not_probe");
    expect(JSON.stringify(parsed)).not.toContain(SECRET_PASSWORD);
  });
});
