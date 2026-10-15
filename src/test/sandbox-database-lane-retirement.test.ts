import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * AGENTS.md: "Verdant has no sandbox ... CI probes production or nothing."
 * These pins keep the retired sandbox database out of every workflow and hold
 * the remaining manual production verifiers behind a typed LIVE confirmation.
 */

const WORKFLOWS_DIR = resolve(__dirname, "..", "..", ".github", "workflows");

interface DispatchInput {
  default?: string;
  options?: string[];
  required?: boolean;
  type?: string;
}

interface Workflow {
  on?: { workflow_dispatch?: { inputs?: Record<string, DispatchInput> } };
  jobs: Record<string, { if?: string; environment?: string | { name?: string } }>;
}

/** Reads a workflow's source text with normalized line endings. */
function readWorkflowSource(fileName: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, fileName), "utf8").replace(/\r\n/g, "\n");
}

/** Parses a workflow so assertions run against resolved YAML values. */
function parseWorkflow(fileName: string): Workflow {
  return loadYaml(readWorkflowSource(fileName)) as Workflow;
}

/** Returns a job's GitHub environment name, whichever YAML form declares it. */
function environmentName(job: Workflow["jobs"][string]): string | undefined {
  return typeof job.environment === "string" ? job.environment : job.environment?.name;
}

const WORKFLOW_FILES = readdirSync(WORKFLOWS_DIR).filter((name) => /\.ya?ml$/.test(name));

const MANUAL_PRODUCTION_VERIFIERS = [
  {
    file: "signup-attribution-cta-readiness.yml",
    job: "live-cta-readiness-live",
    target: "live",
    condition:
      "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'live' && inputs.confirm_live == 'LIVE' }}",
  },
  {
    file: "required-core-migrations.yml",
    job: "verify-production",
    target: "production",
    condition:
      "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'production' && inputs.confirm_live == 'LIVE' }}",
  },
  {
    file: "verify-candidate-number-migration-status.yml",
    job: "verify-production",
    target: "production",
    condition:
      "${{ github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'production' && inputs.confirm_live == 'LIVE' }}",
  },
] as const;

describe("retired sandbox database lanes", () => {
  it("reads a non-trivial set of workflows", () => {
    expect(WORKFLOW_FILES.length).toBeGreaterThan(50);
  });

  it("binds no workflow job to the verdant-sandbox environment", () => {
    for (const file of WORKFLOW_FILES) {
      for (const [name, job] of Object.entries(parseWorkflow(file).jobs ?? {})) {
        expect(environmentName(job), `${file} → ${name}`).not.toBe("verdant-sandbox");
      }
    }
  });

  it("passes the sandbox database secret to no workflow", () => {
    // Parsed YAML drops comments, so a historical comment naming the secret
    // (for example in the held money-migration-drift-alert.yml) is not a use.
    for (const file of WORKFLOW_FILES) {
      expect(JSON.stringify(parseWorkflow(file)), file).not.toContain("SUPABASE_DB_URL_SANDBOX");
    }
  });

  it("removes the nightly sandbox credit-packs smoke workflow", () => {
    expect(existsSync(resolve(WORKFLOWS_DIR, "sandbox-credit-packs-smoke.yml"))).toBe(false);
  });

  it.each(MANUAL_PRODUCTION_VERIFIERS)(
    "offers $file only its production target, with a typed LIVE confirmation",
    ({ file, target }) => {
      const inputs = parseWorkflow(file).on?.workflow_dispatch?.inputs ?? {};
      expect(inputs.target_env).toMatchObject({
        default: target,
        required: true,
        type: "choice",
        options: [target],
      });
      expect(inputs.confirm_live).toMatchObject({ required: true, type: "string" });
    },
  );

  it.each(MANUAL_PRODUCTION_VERIFIERS)(
    "gates $file's $job on the deploy branch, the target and the LIVE confirmation",
    ({ file, job, condition }) => {
      const parsed = parseWorkflow(file);
      expect(parsed.jobs[job].if).toBe(condition);
      expect(environmentName(parsed.jobs[job])).toBe("verdant-production");
    },
  );

  it("keeps signup attribution's push and pull-request job static and secret-free", () => {
    const parsed = parseWorkflow("signup-attribution-cta-readiness.yml");
    expect(Object.keys(parsed.jobs).sort()).toEqual([
      "live-cta-readiness-live",
      "static-cta-readiness",
    ]);
    const staticJob = parsed.jobs["static-cta-readiness"];
    expect(staticJob.if).toBeUndefined();
    expect(environmentName(staticJob)).toBeUndefined();
    expect(JSON.stringify(staticJob)).not.toContain("secrets.");
  });

  it("leaves candidate-number status with its production job only", () => {
    expect(Object.keys(parseWorkflow("verify-candidate-number-migration-status.yml").jobs)).toEqual(
      ["verify-production"],
    );
  });
});
