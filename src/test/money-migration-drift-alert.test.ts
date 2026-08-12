/**
 * Contract for .github/workflows/money-migration-drift-alert.yml.
 *
 * Why it exists: the LIVE money-migration check in required-money-migrations.yml
 * fires only on workflow_dispatch with target_env=live. Across the last 40 runs
 * of that workflow it was dispatched once, with the default target_env=sandbox,
 * so the live job was skipped — it has never executed. Meanwhile a migration
 * that is merged but never applied is a real and recurring failure mode in this
 * repo, and for the money set it means paid behaviour silently regressing.
 *
 * The load-bearing properties are NOT "does the YAML parse". They are:
 *   - it cannot conclude "healthy" without a checker that actually completed,
 *   - it distinguishes "billing logic is missing" from "we verified nothing",
 *   - it never invents a second source of truth for the money-critical set.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { CONNECTION_URL } from "../../scripts/lib/redactDbUrl.mjs";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = ".github/workflows/money-migration-drift-alert.yml";
const WORKFLOW = readFileSync(resolve(ROOT, WORKFLOW_PATH), "utf8");
const CHECKER = readFileSync(
  resolve(ROOT, "scripts/assert-required-money-migrations-applied.mjs"),
  "utf8",
);

const doc = yaml.load(WORKFLOW) as any;
const job = doc.jobs.verify;
const reconcile = job.steps.find(
  (s: { name?: string }) => s.name === "Reconcile the money drift tracking issue",
);
const script: string = reconcile.with.script;

describe("money migration drift alert — runs at all", () => {
  it("is scheduled, because a gate nobody remembers to dispatch is not a gate", () => {
    expect(Object.keys(doc.on)).toContain("schedule");
    expect(doc.on.schedule[0].cron).toBe("30 7 * * *");
  });

  it("only ever runs from the trusted default branch", () => {
    // workflow_dispatch takes a --ref, and this job runs its own checked-out
    // copy of the checker with the production credential in the environment.
    expect(job.if).toBe("github.ref == 'refs/heads/verdant-grow-diary'");
  });

  it("hard-fails on a missing secret instead of reporting into a void", () => {
    const guard = job.steps.find((s: { uses?: string }) =>
      String(s.uses ?? "").includes("require-ci-secret"),
    );
    expect(guard).toBeTruthy();
    expect(guard.with["secret-name"]).toBe("SUPABASE_DB_URL_LIVE");
  });

  it("survives a transient package-mirror failure without a false alert", () => {
    // The alert now fires whenever the checker does not complete, so an apt
    // hiccup would otherwise file a false "billing unverified" issue.
    expect(WORKFLOW).toContain("apt-get update -qq || echo");
    expect(WORKFLOW).toContain("could not install postgresql-client after 3 attempts");
  });
});

describe("money migration drift alert — cannot conclude healthy by accident", () => {
  it("closes only when the checker completed AND reported verified", () => {
    // Closing is the direction where being wrong hides missing billing logic.
    expect(script).toContain(
      'const healthy = stepOutcome === "success" && outcome === "verified";',
    );
  });

  it("treats an unreadable audit as unknown, never as healthy", () => {
    // writeAudit() returns early when AUDIT_PATH is unset, so a typo would
    // leave no JSON. Defaulting to anything reassuring would turn that into a
    // silent pass.
    expect(script).toContain('process.env.AUDIT_OUTCOME || "audit_unreadable"');
    expect(WORKFLOW).toContain("outcome=audit_unreadable");
    expect(script).toContain("audit_unreadable:");
  });

  it("branches on the audit outcome, not merely on a non-zero exit", () => {
    // "Production is missing billing logic" and "the guard refused the target
    // and verified nothing" are different emergencies.
    expect(script).toContain("const outcome = process.env.AUDIT_OUTCOME");
    expect(script).toContain("HEADLINES[outcome]");
  });

  it("gives EVERY outcome the checker can emit its own alert copy", () => {
    // The real drift guard: adding a new outcome to the checker without copy
    // here would fall through to a generic message on a money alert. Derived
    // from the checker's own source so the two cannot separate silently.
    //
    // Compares extracted KEY SETS rather than substring-matching each name.
    // `toContain("target_identity_rejected:")` still passes if the key is
    // renamed to `REMOVED_target_identity_rejected:`, since the original is a
    // substring of the new one — verified by negative control, which is how
    // this weaker form was caught.
    const block = /const HEADLINES = \{([\s\S]*?)\n\s*\};/.exec(script)?.[1] ?? "";
    expect(block, "could not locate the HEADLINES block").not.toBe("");
    const headlineKeys = new Set([...block.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));
    const emitted = [...CHECKER.matchAll(/writeAudit\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(1);
    for (const outcome of emitted) {
      if (outcome === "verified") continue; // the healthy path, no alert copy
      expect(headlineKeys, `outcome "${outcome}" has no alert copy`).toContain(outcome);
    }
  });

  it("names an unrecognised outcome instead of silently treating it as fine", () => {
    expect(script).toContain("Unrecognised outcome");
  });

  it("says the checker never ran, rather than blaming its output", () => {
    // If the psql install or the secret guard fails, the checker never starts
    // and no audit exists. Reporting that as "produced no readable audit"
    // sends the reader hunting a broken checker instead of a broken
    // prerequisite — a different first action.
    expect(script).toContain("const checkerNeverRan =");
    expect(script).toContain("never ran");
    // It must be derived from the step outcome, which is unambiguous, rather
    // than inferred from a missing file.
    expect(script).toContain('stepOutcome !== "success" && stepOutcome !== "failure"');
  });
});

describe("money migration drift alert — never claims more than it measured", () => {
  // Only `verified` and `missing_migrations` involve a real tracker query.
  // malformed_filename carries an `expected` array whose applied flags were
  // never determined, and target_identity_rejected / tracker_query_failed /
  // psql_not_invocable / no_db_connection carry none at all — whose counts
  // serialise to 0. Presenting either as a finding turns a blocked
  // verification into an apparent production defect.
  it("uses a title that does not assert an unproven production defect", () => {
    const title = /MONEY_DRIFT_ISSUE_TITLE: "([^"]+)"/.exec(WORKFLOW)?.[1] ?? "";
    expect(title).not.toBe("");
    // Most outcomes under this one title mean production was never queried.
    expect(title).not.toMatch(/is missing|missing billing|drift:/i);
  });

  it("shows counts only for outcomes that actually queried production", () => {
    expect(script).toContain(
      'const measured = outcome === "verified" || outcome === "missing_migrations";',
    );
    // An unguarded body publishes "Required: 0 · applied: 0 · missing: 0" for
    // outcomes that never measured, which reads as zero drift.
    expect(script).toContain("Counts unavailable");
    expect(script).toMatch(/measured && audit\s*\?/);
  });

  it("names specific migrations only when a query established they are absent", () => {
    expect(script).toMatch(/const missingList =\s*\n?\s*outcome === "missing_migrations"/);
  });

  it("surfaces the checker's own note, so unmeasured outcomes are actionable", () => {
    // Without it, those bodies say only "nothing was verified" and give the
    // reader nowhere to start.
    expect(script).toContain("audit?.note");
  });
});

describe("money migration drift alert — does not fork the source of truth", () => {
  it("reuses the existing checker rather than reimplementing detection", () => {
    expect(WORKFLOW).toContain("node scripts/assert-required-money-migrations-applied.mjs");
  });

  it("hard-codes no migration filenames of its own", () => {
    // REQUIRED_MONEY_MIGRATIONS must stay the only place the money-critical
    // set is defined; a copy here would drift and under-report.
    expect(WORKFLOW).not.toMatch(/\d{14}_[a-z0-9_]+\.sql/);
  });

  it("keeps its redaction pattern pinned to the shared module", () => {
    expect(WORKFLOW).toContain(CONNECTION_URL.source);
  });

  it("uses an issue title distinct from the general drift probe's", () => {
    const probe = readFileSync(
      resolve(ROOT, ".github/workflows/migration-drift-probe.yml"),
      "utf8",
    );
    const mine = /MONEY_DRIFT_ISSUE_TITLE: "([^"]+)"/.exec(WORKFLOW)?.[1];
    const theirs = /DRIFT_ISSUE_TITLE: "([^"]+)"/.exec(probe)?.[1];
    expect(mine).toBeTruthy();
    expect(theirs).toBeTruthy();
    // Two channels matching each other's issues would cross-close them.
    expect(mine).not.toBe(theirs);
  });

  it("finds the tracking issue on any page and never matches a pull request", () => {
    expect(script).toContain("github.paginate(github.rest.issues.listForRepo");
    expect(script).toContain("!i.pull_request");
  });
});

describe("money migration drift alert — is valid as GitHub will run it", () => {
  it("parses the github-script body as the async function it is wrapped in", () => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    expect(() => new AsyncFunction("github", "context", "core", "require", script)).not.toThrow();
  });

  it("runs its issue steps even when the checker step failed", () => {
    // The checker exits non-zero on drift, which is correct; without always()
    // the alert would never fire on precisely the runs that need it.
    expect(reconcile.if).toBe("always()");
  });
});
