/**
 * The Supabase database admin key (SUPABASE_SERVICE_ROLE_KEY) may only be
 * referenced by a workflow job bound to a protected GitHub Environment.
 *
 * A repository-level secret is readable by any branch pushed to this repo: the
 * branch can edit a workflow on its own pull request and print it. An
 * environment secret is released only to jobs that name the environment, and
 * only after the environment's protection rules (required reviewers, allowed
 * branches) pass. Security review finding B1, 2026-11-18.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Job = {
  environment?: string | { name?: string };
  permissions?: Record<string, string> | string;
};
type Workflow = { jobs?: Record<string, Job> };

const WORKFLOWS_DIR = resolve(__dirname, "../../.github/workflows");
const ADMIN_KEY_REF = /secrets\.SUPABASE_SERVICE_ROLE_KEY\b/;
const ADMIN_ENVIRONMENT = "supabase-admin";

const workflows = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .map((file) => ({
    file,
    wf: load(readFileSync(join(WORKFLOWS_DIR, file), "utf8")) as Workflow,
  }));

const environmentName = (job: Job): string | undefined =>
  typeof job.environment === "string" ? job.environment : job.environment?.name;

const jobsUsingAdminKey = workflows.flatMap(({ file, wf }) =>
  Object.entries(wf.jobs ?? {})
    .filter(([, job]) => ADMIN_KEY_REF.test(JSON.stringify(job)))
    .map(([id, job]) => ({ file, id, job })),
);

describe("CI database admin key stays behind a protected environment", () => {
  it("finds the workflows that still need the key", () => {
    expect(jobsUsingAdminKey.map(({ file, id }) => `${file}#${id}`)).toEqual([
      "gamification-staging-smoke.yml#gamification-staging-smoke",
    ]);
  });

  it("binds every job that references the key to the supabase-admin environment", () => {
    for (const { file, id, job } of jobsUsingAdminKey) {
      expect(environmentName(job), `${file}#${id}`).toBe(ADMIN_ENVIRONMENT);
    }
  });

  it("keeps the key out of ci.yml, which runs on every pull request", () => {
    const ci = workflows.find(({ file }) => file === "ci.yml")!.wf;
    for (const [id, job] of Object.entries(ci.jobs ?? {})) {
      expect(JSON.stringify(job), `ci.yml#${id}`).not.toMatch(ADMIN_KEY_REF);
    }
  });

  it("gives the jobs this change touches a least-privilege token", () => {
    const ci = workflows.find(({ file }) => file === "ci.yml")!.wf;
    expect(ci.jobs?.test?.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    for (const { file, id, job } of jobsUsingAdminKey) {
      expect(job.permissions, `${file}#${id}`).toEqual({ contents: "read" });
    }
  });
});
