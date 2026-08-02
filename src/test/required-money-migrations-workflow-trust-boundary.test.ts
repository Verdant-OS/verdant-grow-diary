import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const WORKFLOWS_DIR = resolve(ROOT, ".github/workflows");

function readWorkflow(fileName: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, fileName), "utf8").replace(/\r\n/g, "\n");
}

interface MappingEntry {
  key: string;
  value: string;
}

function mappingEntry(line: string): MappingEntry | undefined {
  const match = line.trimStart().match(/^(?:"([^"]+)"|'([^']+)'|([a-z0-9_-]+))\s*:\s*(.*)$/i);
  if (!match) return undefined;
  return { key: match[1] ?? match[2] ?? match[3], value: match[4] };
}

function indentation(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function unquoteScalar(value: string): string {
  const normalized = value.replace(/\s+#.*$/, "").trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function jobBlocks(workflow: string): string[] {
  const lines = workflow.split("\n");
  const jobsCandidates = lines
    .map((line, index) => ({ entry: mappingEntry(line), indent: indentation(line), index }))
    .filter(({ entry }) => entry?.key === "jobs");
  if (jobsCandidates.length === 0) throw new Error("Workflow has no jobs block.");

  const jobsLine = jobsCandidates.reduce((best, candidate) =>
    candidate.indent < best.indent ? candidate : best,
  );
  let sectionEnd = lines.length;
  for (let index = jobsLine.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (indentation(line) <= jobsLine.indent) {
      sectionEnd = index;
      break;
    }
  }

  const candidates: { entry: MappingEntry; indent: number; index: number }[] = [];
  for (let index = jobsLine.index + 1; index < sectionEnd; index += 1) {
    const entry = mappingEntry(lines[index]);
    if (entry) candidates.push({ entry, indent: indentation(lines[index]), index });
  }
  const jobIndent = Math.min(...candidates.map(({ indent }) => indent));
  const starts = candidates.filter(({ indent }) => indent === jobIndent).map(({ index }) => index);
  return starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? sectionEnd).join("\n"),
  );
}

function jobBlock(workflow: string, jobName: string): string {
  const job = jobBlocks(workflow).find(
    (candidate) => mappingEntry(candidate.split("\n", 1)[0])?.key === jobName,
  );
  if (!job) throw new Error(`Workflow job not found: ${jobName}`);
  return job;
}

function jobProperty(job: string, propertyName: string): string {
  const lines = job.split("\n");
  const jobIndent = indentation(lines[0]);
  const candidates = lines
    .slice(1)
    .map((line) => ({ entry: mappingEntry(line), indent: indentation(line) }))
    .filter(({ entry, indent }) => entry && indent > jobIndent);
  const propertyIndent = Math.min(...candidates.map(({ indent }) => indent));
  return (
    candidates.find(({ entry, indent }) => indent === propertyIndent && entry?.key === propertyName)
      ?.entry?.value ?? ""
  );
}

function hasOnlinePrefixDiffInvocation(job: string): boolean {
  const command = "node scripts/diff-money-migration-prefixes.mjs";
  let index = job.indexOf(command);
  while (index !== -1) {
    if (!job.slice(index, index + 220).includes("--expected")) return true;
    index = job.indexOf(command, index + command.length);
  }
  return false;
}

function isPullRequestCapable(workflow: string): boolean {
  const lines = workflow.split("\n");
  const onCandidates = lines
    .map((line, index) => ({ entry: mappingEntry(line), indent: indentation(line), index }))
    .filter(({ entry }) => entry?.key === "on");
  if (onCandidates.length === 0) return false;

  const onLine = onCandidates.reduce((best, candidate) =>
    candidate.indent < best.indent ? candidate : best,
  );
  const inline = onLine.entry?.value.trim() ?? "";
  if (inline) {
    let inlineSource = inline;
    if (inline.startsWith("[") && !inline.includes("]")) {
      for (let index = onLine.index + 1; index < lines.length; index += 1) {
        inlineSource += ` ${lines[index].trim()}`;
        if (lines[index].includes("]")) break;
      }
    }
    return /(?:^|[\s,[{])["']?pull_request(?:_target)?["']?(?=$|[\s,\]}:])/.test(inlineSource);
  }

  const eventCandidates: { entry: MappingEntry; indent: number }[] = [];
  for (let index = onLine.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = indentation(line);
    if (indent <= onLine.indent) break;
    const entry = mappingEntry(line);
    if (entry) eventCandidates.push({ entry, indent });
  }
  const eventIndent = Math.min(...eventCandidates.map(({ indent }) => indent));
  return eventCandidates.some(
    ({ entry, indent }) =>
      indent === eventIndent &&
      (entry.key === "pull_request" || entry.key === "pull_request_target"),
  );
}

function invokesMoneyMigrationScript(workflow: string): boolean {
  return /scripts\/(?:diff-money-migration-prefixes|assert-required-money-migrations(?:-applied)?|assert-no-unreviewed-money-migrations)\.mjs/.test(
    workflow,
  );
}

function isDatabaseSensitiveJob(job: string): boolean {
  return (
    job.includes("secrets.") ||
    job.includes("SUPABASE_DB_URL") ||
    job.includes("postgresql-client") ||
    job.includes("scripts/assert-required-money-migrations-applied.mjs") ||
    /\bpsql\b/.test(job) ||
    hasOnlinePrefixDiffInvocation(job)
  );
}

function jobCondition(job: string): string {
  return jobProperty(job, "if").replace(/\s+/g, " ").trim();
}

function jobEnvironment(job: string): string {
  return unquoteScalar(jobProperty(job, "environment"));
}

const TRUSTED_SANDBOX_CONDITION =
  "${{ (github.event_name == 'push' && github.ref == 'refs/heads/verdant-grow-diary') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'sandbox') }}";
const TRUSTED_LIVE_CONDITION =
  "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'live' }}";
const TRUSTED_REMOTE_JOB_CONDITIONS = new Map([
  [TRUSTED_SANDBOX_CONDITION, { environment: "verdant-sandbox", targetEnv: "sandbox" }],
  [TRUSTED_LIVE_CONDITION, { environment: "verdant-production", targetEnv: "live" }],
]);

const REQUIRED_WORKFLOW = readWorkflow("required-money-migrations.yml");
const UNIT_JOB = jobBlock(REQUIRED_WORKFLOW, "unit-tests-migration-version");
const MANIFEST_JOB = jobBlock(REQUIRED_WORKFLOW, "assert-required-money-migrations");
const SANDBOX_JOB = jobBlock(REQUIRED_WORKFLOW, "assert-money-migrations-applied-sandbox");
const LIVE_JOB = jobBlock(REQUIRED_WORKFLOW, "assert-money-migrations-applied-live");
const TRIGGERS = REQUIRED_WORKFLOW.slice(0, REQUIRED_WORKFLOW.indexOf("\njobs:"));

const PREFIX_WORKFLOW = readWorkflow("prefix-diff-sarif.yml");
const PREFIX_OFFLINE_JOB = jobBlock(PREFIX_WORKFLOW, "prefix-diff-offline");
const PREFIX_SANDBOX_JOB = jobBlock(PREFIX_WORKFLOW, "prefix-diff-sandbox");
const PREFIX_LIVE_JOB = jobBlock(PREFIX_WORKFLOW, "prefix-diff-live");
const PREFIX_TRIGGERS = PREFIX_WORKFLOW.slice(0, PREFIX_WORKFLOW.indexOf("\njobs:"));

describe("required-money-migrations workflow trust boundary", () => {
  it("targets pushes only at the canonical trusted branch", () => {
    expect(TRIGGERS).toMatch(/push:\s*\n\s+branches:\s*\[verdant-grow-diary\]/);
    expect(TRIGGERS).not.toMatch(/branches:\s*\[main\]/);
  });

  it("constrains manual dispatch to the sandbox/live choice", () => {
    expect(TRIGGERS).toMatch(/target_env:[\s\S]*type:\s*choice/);
    expect(TRIGGERS).toMatch(/options:\s*\n\s+- sandbox\s*\n\s+- live/);
  });

  it("reruns when either shared target-binding layer or its regression test changes", () => {
    for (const path of [
      "scripts/lib/moneyDatabaseTargetIdentity.mjs",
      "scripts/lib/supabaseDatabaseTargetIdentity.mjs",
      "src/test/money-database-target-identity.test.ts",
    ]) {
      expect(TRIGGERS).toContain(`- "${path}"`);
    }
  });

  it("keeps every pull-request-capable job offline and secret-free", () => {
    for (const job of [UNIT_JOB, MANIFEST_JOB]) {
      expect(job).not.toContain("secrets.");
      expect(job).not.toContain("SUPABASE_DB_URL");
      expect(job).not.toContain("environment:");
      expect(job).not.toContain("postgresql-client");
    }
    expect(MANIFEST_JOB).toContain("node scripts/assert-required-money-migrations.mjs");
    expect(MANIFEST_JOB).toContain("node scripts/assert-no-unreviewed-money-migrations.mjs");
  });

  it("confines all secret references to the two remotely gated jobs", () => {
    const withoutRemoteJobs = REQUIRED_WORKFLOW.replace(SANDBOX_JOB, "").replace(LIVE_JOB, "");
    expect(withoutRemoteJobs).not.toContain("secrets.");
    expect(REQUIRED_WORKFLOW).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(REQUIRED_WORKFLOW).not.toContain("SUPABASE_PROJECT_REF");
  });

  it("allows sandbox DB access only on trusted pushes or trusted manual dispatch", () => {
    expect(SANDBOX_JOB).toContain("environment: verdant-sandbox");
    expect(SANDBOX_JOB).toContain("github.event_name == 'push'");
    expect(SANDBOX_JOB).toContain("github.event_name == 'workflow_dispatch'");
    expect(SANDBOX_JOB).toContain("inputs.target_env == 'sandbox'");
    expect(SANDBOX_JOB.match(/github\.ref == 'refs\/heads\/verdant-grow-diary'/g)).toHaveLength(2);
    expect(SANDBOX_JOB).not.toContain("pull_request");
    expect(SANDBOX_JOB).not.toContain("SUPABASE_DB_URL_LIVE");
    expect(SANDBOX_JOB).toContain("secrets.SUPABASE_DB_URL_SANDBOX");
  });

  it("allows live DB access only on trusted manual dispatch", () => {
    expect(LIVE_JOB).toContain("environment: verdant-production");
    expect(LIVE_JOB).toContain("github.event_name == 'workflow_dispatch'");
    expect(LIVE_JOB).toContain("github.ref == 'refs/heads/verdant-grow-diary'");
    expect(LIVE_JOB).toContain("inputs.target_env == 'live'");
    expect(LIVE_JOB).not.toContain("github.event_name == 'push'");
    expect(LIVE_JOB).not.toContain("pull_request");
    expect(LIVE_JOB).not.toContain("SUPABASE_DB_URL_SANDBOX");
    expect(LIVE_JOB).toContain("secrets.SUPABASE_DB_URL_LIVE");
  });

  it("clears ambient libpq fallbacks in both remote jobs", () => {
    const fallbackNames = [
      "DATABASE_URL",
      "PGDATABASE",
      "PGHOST",
      "PGPASSWORD",
      "PGPORT",
      "PGSERVICE",
      "PGSERVICEFILE",
      "PGUSER",
    ];
    for (const job of [SANDBOX_JOB, LIVE_JOB]) {
      for (const name of fallbackNames) {
        expect(job).toMatch(new RegExp(`\\n\\s+${name}: ""`));
      }
    }
  });

  it("does not grant pull-request write access or retain unreachable PR comment steps", () => {
    expect(REQUIRED_WORKFLOW).not.toMatch(/pull-requests:\s*write/);
    expect(REQUIRED_WORKFLOW).not.toContain("sticky-pull-request-comment");
  });
});

describe("prefix-diff-sarif workflow trust boundary", () => {
  it("targets pushes only at the canonical trusted branch", () => {
    expect(PREFIX_TRIGGERS).toMatch(/push:[\s\S]*branches:\s*\[verdant-grow-diary\]/);
    expect(PREFIX_TRIGGERS).not.toMatch(/branches:\s*\[main\]/);
  });

  it("reruns when either shared target-binding layer or its regression test changes", () => {
    for (const path of [
      "scripts/lib/moneyDatabaseTargetIdentity.mjs",
      "scripts/lib/supabaseDatabaseTargetIdentity.mjs",
      "src/test/money-database-target-identity.test.ts",
    ]) {
      expect(PREFIX_TRIGGERS).toContain(`- "${path}"`);
    }
  });

  it("keeps the pull-request lane offline and secret-free", () => {
    expect(PREFIX_OFFLINE_JOB).toContain("node scripts/assert-required-money-migrations.mjs");
    expect(PREFIX_OFFLINE_JOB).toContain("node scripts/assert-no-unreviewed-money-migrations.mjs");
    expect(PREFIX_OFFLINE_JOB).toContain("--expected --json");
    expect(PREFIX_OFFLINE_JOB).toContain("--expected --sarif");
    expect(PREFIX_OFFLINE_JOB).not.toContain("secrets.");
    expect(PREFIX_OFFLINE_JOB).not.toContain("SUPABASE_DB_URL");
    expect(PREFIX_OFFLINE_JOB).not.toContain("postgresql-client");
    expect(PREFIX_OFFLINE_JOB).not.toContain("environment:");
    expect(hasOnlinePrefixDiffInvocation(PREFIX_OFFLINE_JOB)).toBe(false);
  });

  it("gates sandbox DB evidence to trusted push/manual events and verdant-sandbox", () => {
    expect(PREFIX_SANDBOX_JOB).toContain("environment: verdant-sandbox");
    expect(PREFIX_SANDBOX_JOB).toContain("github.event_name == 'push'");
    expect(PREFIX_SANDBOX_JOB).toContain("github.event_name == 'workflow_dispatch'");
    expect(PREFIX_SANDBOX_JOB).toContain("inputs.target_env == 'sandbox'");
    expect(
      PREFIX_SANDBOX_JOB.match(/github\.ref == 'refs\/heads\/verdant-grow-diary'/g),
    ).toHaveLength(2);
    expect(PREFIX_SANDBOX_JOB).toContain("secrets.SUPABASE_DB_URL_SANDBOX");
    expect(PREFIX_SANDBOX_JOB).not.toContain("SUPABASE_DB_URL_LIVE");
    expect(PREFIX_SANDBOX_JOB).not.toContain("pull_request");
  });

  it("gates live DB evidence to trusted manual events and verdant-production", () => {
    expect(PREFIX_LIVE_JOB).toContain("environment: verdant-production");
    expect(PREFIX_LIVE_JOB).toContain("github.event_name == 'workflow_dispatch'");
    expect(PREFIX_LIVE_JOB).toContain("github.ref == 'refs/heads/verdant-grow-diary'");
    expect(PREFIX_LIVE_JOB).toContain("inputs.target_env == 'live'");
    expect(PREFIX_LIVE_JOB).toContain("secrets.SUPABASE_DB_URL_LIVE");
    expect(PREFIX_LIVE_JOB).not.toContain("SUPABASE_DB_URL_SANDBOX");
    expect(PREFIX_LIVE_JOB).not.toContain("github.event_name == 'push'");
    expect(PREFIX_LIVE_JOB).not.toContain("pull_request");
  });

  it("has no combined or cross-environment secret fallback", () => {
    expect(PREFIX_WORKFLOW).not.toMatch(
      /SUPABASE_DB_URL_LIVE[\s\S]{0,120}\|\|[\s\S]{0,120}SUPABASE_DB_URL_SANDBOX/,
    );
    for (const line of PREFIX_WORKFLOW.split("\n")) {
      expect(
        line.includes("secrets.SUPABASE_DB_URL_LIVE") &&
          line.includes("secrets.SUPABASE_DB_URL_SANDBOX"),
      ).toBe(false);
    }
  });
});

describe("all pull-request-capable money workflows", () => {
  const workflows = readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({ name, source: readWorkflow(name) }))
    .filter(({ source }) => isPullRequestCapable(source) && invokesMoneyMigrationScript(source));

  it("discovers every current PR-capable money workflow", () => {
    expect(workflows.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["prefix-diff-sarif.yml", "required-money-migrations.yml"]),
    );
  });

  it("recognizes pull_request_target and applied-checker workflows as PR-capable money workflows", () => {
    const fixtures = [
      [
        "on:",
        "    pull_request_target:",
        "jobs:",
        "  unsafe:",
        "    steps:",
        "      - run: node scripts/assert-required-money-migrations-applied.mjs",
      ].join("\n"),
      [
        '"on": [push, "pull_request_target"]',
        "jobs:",
        "  unsafe:",
        "    steps:",
        "      - run: node scripts/assert-required-money-migrations-applied.mjs",
      ].join("\n"),
      [
        "on:",
        '  "pull_request_target":',
        "jobs:",
        "  unsafe:",
        "    steps:",
        "      - run: node scripts/assert-required-money-migrations-applied.mjs",
      ].join("\n"),
    ];
    for (const fixture of fixtures) {
      expect(isPullRequestCapable(fixture)).toBe(true);
      expect(invokesMoneyMigrationScript(fixture)).toBe(true);
    }
  });

  it("requires every DB-sensitive job to use an exact trusted condition and matching environment", () => {
    for (const workflow of workflows) {
      for (const job of jobBlocks(workflow.source)) {
        if (!isDatabaseSensitiveJob(job)) {
          expect(job).not.toContain("secrets.");
          expect(hasOnlinePrefixDiffInvocation(job)).toBe(false);
          continue;
        }

        const condition = jobCondition(job);
        expect(job, workflow.name).not.toContain("pull_request");
        const requiredBoundary = TRUSTED_REMOTE_JOB_CONDITIONS.get(condition);
        expect(requiredBoundary, workflow.name).toBeDefined();
        expect(jobEnvironment(job), workflow.name).toBe(requiredBoundary?.environment);
        expect(job, workflow.name).toMatch(
          new RegExp(`\\n\\s+TARGET_ENV: ${requiredBoundary?.targetEnv}(?:\\s|$)`),
        );
      }
    }
  });
});
