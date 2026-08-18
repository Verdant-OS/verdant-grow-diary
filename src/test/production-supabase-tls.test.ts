import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  expectedProductionSupabaseRootCertPath,
  hardenProductionPsqlEnvironment,
  PRODUCTION_SUPABASE_CA_FILENAME,
  ProductionSupabaseTlsError,
} from "../../scripts/lib/productionSupabaseTls.mjs";

const APPLY_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/apply-quicklog-corrections-retractions.yml",
);
const SIGNUP_APPLY_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/apply-signup-acquisition-forward-repair.yml",
);
const DELEGATE_APPLY_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/apply-quicklog-manual-delegate-forward-repair.yml",
);
const CORE_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/required-core-migrations.yml",
);
const PG15_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/quicklog-corrections-retractions-pg15.yml",
);
const SIGNUP_PG15_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/signup-acquisition-forward-repair-pg15.yml",
);
const DELEGATE_PG15_WORKFLOW_PATH = resolve(
  __dirname,
  "../../.github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml",
);
const FIXED_WORKFLOW_CA_PATH = "${{ runner.temp }}/verdant-production-supabase-root.crt";
const FAKE_CA_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "ZmFrZS10ZXN0LWNh",
  "-----END CERTIFICATE-----",
  "",
].join("\n");

type WorkflowStep = {
  name?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
  with?: Record<string, string>;
};

type WorkflowJob = {
  environment?: string;
  env?: Record<string, string>;
  steps: WorkflowStep[];
};

function successfulTlsOptions(runnerTemp: string) {
  const rootCertPath = join(runnerTemp, PRODUCTION_SUPABASE_CA_FILENAME);
  return {
    sourceEnv: {
      RUNNER_TEMP: runnerTemp,
      SUPABASE_DB_CA_CERT_PATH: rootCertPath,
      SUPABASE_DB_CA_CERT_B64: "must-not-reach-psql",
      PGSSLMODE: "disable",
      PGSSLROOTCERT: "C:\\attacker\\root.crt",
    },
    childEnv: {
      PATH: process.env.PATH,
      PGHOST: "db.knkwiiywfkbqznbxwqfh.supabase.co",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: "database-password-sentinel",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
      PGSSLROOTCERT: "C:\\attacker\\root.crt",
    },
    lstatImpl: vi.fn(() => ({
      isFile: () => true,
      isSymbolicLink: () => false,
      size: Buffer.byteLength(FAKE_CA_PEM),
    })),
    readFileImpl: vi.fn(() => FAKE_CA_PEM),
    parseCertificateImpl: vi.fn(() => ({ ca: true })),
  };
}

function workflow(path: string) {
  return loadYaml(readFileSync(path, "utf8")) as {
    jobs: Record<string, WorkflowJob>;
  };
}

function requireStep(job: WorkflowJob) {
  return job.steps.find(
    (step) =>
      step.uses === "./.github/actions/require-ci-secret" &&
      step.with?.["secret-name"] === "SUPABASE_DB_CA_CERT_B64",
  );
}

function materializeStep(job: WorkflowJob) {
  return job.steps.find((step) => step.name === "Materialize verified Supabase production CA");
}

function cleanupStep(job: WorkflowJob) {
  return job.steps.find((step) => step.name === "Remove Supabase production CA");
}

function expectProtectedCaWorkflow(job: WorkflowJob, expectedEnvironment = "verdant-production") {
  expect(job.environment).toBe(expectedEnvironment);

  const guard = requireStep(job);
  expect(guard).toBeDefined();
  expect(guard?.with?.["secret-value"]).toBe("${{ secrets.SUPABASE_DB_CA_CERT_B64 }}");

  const materialize = materializeStep(job);
  expect(materialize?.env).toEqual({
    SUPABASE_DB_CA_CERT_B64: "${{ secrets.SUPABASE_DB_CA_CERT_B64 }}",
    SUPABASE_DB_CA_CERT_PATH: FIXED_WORKFLOW_CA_PATH,
  });
  expect(materialize?.run).toContain("set -euo pipefail");
  expect(materialize?.run).toContain("umask 077");
  expect(materialize?.run).toContain('base64 --decode > "$SUPABASE_DB_CA_CERT_PATH"');
  expect(materialize?.run).toContain('chmod 600 "$SUPABASE_DB_CA_CERT_PATH"');
  expect(materialize?.run).toContain('openssl x509 -in "$SUPABASE_DB_CA_CERT_PATH" -noout');
  expect(materialize?.run).not.toMatch(/\b(curl|wget)\b/);
  expect(materialize?.run).not.toContain("SUPABASE_DB_URL");

  const cleanup = cleanupStep(job);
  expect(cleanup?.if).toBe("always()");
  expect(cleanup?.env).toEqual({
    SUPABASE_DB_CA_CERT_PATH: FIXED_WORKFLOW_CA_PATH,
  });
  expect(cleanup?.run).toBe('rm -f -- "$SUPABASE_DB_CA_CERT_PATH"');
}

describe("production Supabase TLS hardening", () => {
  it("forces verify-full and the fixed runner-temp CA without mutating the sanitized input", () => {
    const runnerTemp = resolve("C:/verdant-test-runner-temp");
    const options = successfulTlsOptions(runnerTemp);
    const originalChild = { ...options.childEnv };

    const hardened = hardenProductionPsqlEnvironment(options);

    expect(hardened).toEqual({
      ...originalChild,
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: join(runnerTemp, PRODUCTION_SUPABASE_CA_FILENAME),
    });
    expect(options.childEnv).toEqual(originalChild);
    expect(Object.isFrozen(hardened)).toBe(true);
    expect(hardened).not.toHaveProperty("SUPABASE_DB_CA_CERT_B64");
    expect(options.parseCertificateImpl).toHaveBeenCalledWith(FAKE_CA_PEM);
  });

  it("derives one normalized absolute certificate path beneath RUNNER_TEMP", () => {
    const runnerTemp = resolve("C:/verdant-test-runner-temp");
    const rootCertPath = expectedProductionSupabaseRootCertPath({ RUNNER_TEMP: runnerTemp });

    expect(rootCertPath).toBe(join(runnerTemp, PRODUCTION_SUPABASE_CA_FILENAME));
    expect(isAbsolute(rootCertPath)).toBe(true);
  });

  it.each([
    ["missing RUNNER_TEMP", { RUNNER_TEMP: "", SUPABASE_DB_CA_CERT_PATH: "" }],
    [
      "relative RUNNER_TEMP",
      { RUNNER_TEMP: "relative/temp", SUPABASE_DB_CA_CERT_PATH: "relative/temp/root.crt" },
    ],
    [
      "non-canonical RUNNER_TEMP",
      {
        RUNNER_TEMP: `${resolve("C:/verdant-test-runner-temp")}${sep}..${sep}escape`,
        SUPABASE_DB_CA_CERT_PATH: resolve("C:/escape/verdant-production-supabase-root.crt"),
      },
    ],
    [
      "missing CA path",
      { RUNNER_TEMP: resolve("C:/verdant-test-runner-temp"), SUPABASE_DB_CA_CERT_PATH: "" },
    ],
    [
      "wrong CA path",
      {
        RUNNER_TEMP: resolve("C:/verdant-test-runner-temp"),
        SUPABASE_DB_CA_CERT_PATH: resolve("C:/attacker/root.crt"),
      },
    ],
  ])("fails closed for %s", (_label, sourceEnv) => {
    const options = successfulTlsOptions(resolve("C:/verdant-test-runner-temp"));

    expect(() => hardenProductionPsqlEnvironment({ ...options, sourceEnv })).toThrow(
      ProductionSupabaseTlsError,
    );
    expect(options.lstatImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["missing file", () => undefined, () => FAKE_CA_PEM, () => ({ ca: true })],
    [
      "symbolic link",
      () => ({ isFile: () => true, isSymbolicLink: () => true, size: 100 }),
      () => FAKE_CA_PEM,
      () => ({ ca: true }),
    ],
    [
      "non-file",
      () => ({ isFile: () => false, isSymbolicLink: () => false, size: 100 }),
      () => FAKE_CA_PEM,
      () => ({ ca: true }),
    ],
    [
      "empty file",
      () => ({ isFile: () => true, isSymbolicLink: () => false, size: 0 }),
      () => "",
      () => ({ ca: true }),
    ],
    [
      "oversized file",
      () => ({ isFile: () => true, isSymbolicLink: () => false, size: 65_537 }),
      () => FAKE_CA_PEM,
      () => ({ ca: true }),
    ],
    [
      "malformed certificate",
      () => ({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: Buffer.byteLength(FAKE_CA_PEM),
      }),
      () => FAKE_CA_PEM,
      () => {
        throw new Error("invalid certificate");
      },
    ],
    [
      "non-CA certificate",
      () => ({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: Buffer.byteLength(FAKE_CA_PEM),
      }),
      () => FAKE_CA_PEM,
      () => ({ ca: false }),
    ],
  ])("rejects a %s", (_label, lstatImpl, readFileImpl, parseCertificateImpl) => {
    const options = successfulTlsOptions(resolve("C:/verdant-test-runner-temp"));

    expect(() =>
      hardenProductionPsqlEnvironment({
        ...options,
        lstatImpl,
        readFileImpl,
        parseCertificateImpl,
      }),
    ).toThrow(ProductionSupabaseTlsError);
  });

  it("uses Node certificate parsing by default and rejects arbitrary PEM-looking bytes", () => {
    const options = successfulTlsOptions(resolve("C:/verdant-test-runner-temp"));

    expect(() =>
      hardenProductionPsqlEnvironment({
        sourceEnv: options.sourceEnv,
        childEnv: options.childEnv,
        lstatImpl: options.lstatImpl,
        readFileImpl: options.readFileImpl,
      }),
    ).toThrow(ProductionSupabaseTlsError);
  });
});

describe("production Supabase CA workflow boundary", () => {
  it("wires the production TLS helper and its contract test into required CI paths", () => {
    for (const path of [
      CORE_WORKFLOW_PATH,
      PG15_WORKFLOW_PATH,
      SIGNUP_PG15_WORKFLOW_PATH,
      DELEGATE_PG15_WORKFLOW_PATH,
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('"scripts/lib/productionSupabaseTls.mjs"');
      expect(source).toContain('"src/test/production-supabase-tls.test.ts"');
    }
  });

  it("protects, validates, and removes the CA in the Quick Log delivery workflow", () => {
    const parsed = workflow(APPLY_WORKFLOW_PATH);
    const job = parsed.jobs.apply;

    expectProtectedCaWorkflow(job);
    const runner = job.steps.find(
      (step) => step.name === "Run the environment-gated Quick Log delivery gate",
    );
    expect(runner?.env).toEqual({
      SUPABASE_DB_URL: "${{ secrets.SUPABASE_DB_URL }}",
      SUPABASE_DB_CA_CERT_PATH: FIXED_WORKFLOW_CA_PATH,
    });
    expect(JSON.stringify(runner)).not.toContain("SUPABASE_DB_CA_CERT_B64");
  });

  it("protects, validates, and removes the CA in the signup repair delivery workflow", () => {
    const parsed = workflow(SIGNUP_APPLY_WORKFLOW_PATH);
    const job = parsed.jobs.apply;

    expectProtectedCaWorkflow(job, "verdant-production-solo-founder");
    const runner = job.steps.find(
      (step) => step.name === "Run the environment-gated signup-acquisition repair gate",
    );
    expect(runner?.env).toEqual({
      SUPABASE_DB_URL: "${{ secrets.SUPABASE_DB_URL }}",
      SUPABASE_DB_CA_CERT_PATH: FIXED_WORKFLOW_CA_PATH,
    });
    expect(JSON.stringify(runner)).not.toContain("SUPABASE_DB_CA_CERT_B64");
  });

  it("protects, validates, and removes the CA in the manual-delegate repair workflow", () => {
    const parsed = workflow(DELEGATE_APPLY_WORKFLOW_PATH);
    const job = parsed.jobs.apply;

    expectProtectedCaWorkflow(job);
    const runner = job.steps.find(
      (step) => step.name === "Run the environment-gated Quick Log delegate repair",
    );
    expect(runner?.env).toEqual({
      SUPABASE_DB_URL: "${{ secrets.SUPABASE_DB_URL }}",
      SUPABASE_DB_CA_CERT_PATH: FIXED_WORKFLOW_CA_PATH,
    });
    expect(JSON.stringify(runner)).not.toContain("SUPABASE_DB_CA_CERT_B64");
  });

  it("protects the production core verifier without exposing CA material to sandbox", () => {
    const parsed = workflow(CORE_WORKFLOW_PATH);
    const production = parsed.jobs["verify-production"];
    const sandbox = parsed.jobs["verify-sandbox"];

    expectProtectedCaWorkflow(production);
    for (const step of production.steps.filter((candidate) =>
      candidate.run?.includes("assert-required-core-migrations-applied.mjs"),
    )) {
      expect(step.env?.SUPABASE_DB_CA_CERT_PATH).toBe(FIXED_WORKFLOW_CA_PATH);
      expect(step.env).not.toHaveProperty("SUPABASE_DB_CA_CERT_B64");
    }
    expect(JSON.stringify(sandbox)).not.toMatch(/SUPABASE_DB_CA(?:_CERT|_PATH)/);
  });

  it("keeps raw CA material out of database steps and uploaded evidence", () => {
    for (const path of [
      APPLY_WORKFLOW_PATH,
      SIGNUP_APPLY_WORKFLOW_PATH,
      DELEGATE_APPLY_WORKFLOW_PATH,
      CORE_WORKFLOW_PATH,
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source.match(/secrets\.SUPABASE_DB_CA_CERT_B64/g) ?? []).toHaveLength(2);
      expect(source).not.toMatch(/(?:curl|wget)[^\n]*SUPABASE_DB_CA/i);

      const parsed = workflow(path);
      for (const job of Object.values(parsed.jobs)) {
        for (const step of job.steps) {
          if (step.uses?.startsWith("actions/upload-artifact")) {
            expect(JSON.stringify(step)).not.toContain(PRODUCTION_SUPABASE_CA_FILENAME);
            expect(JSON.stringify(step)).not.toContain("SUPABASE_DB_CA_CERT_B64");
          }
        }
      }
    }
  });
});
