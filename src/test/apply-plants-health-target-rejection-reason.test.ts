import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";
import { SupabaseDatabaseTargetIdentityError } from "../../scripts/lib/supabaseDatabaseTargetIdentity.mjs";
import {
  EXIT,
  runPlantsHealthUnassessedDefault,
  TOOL_NAME,
} from "../../scripts/apply-plants-health-unassessed-default.mjs";

const identityControl = vi.hoisted(() => ({
  impl: null as null | ((input: { targetEnv: string; databaseUrl: string }) => unknown),
}));

vi.mock("../../scripts/lib/supabaseDatabaseTargetIdentity.mjs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const realAssert = actual.assertSupabaseDatabaseTargetIdentity as (input: {
    targetEnv: string;
    databaseUrl: string;
  }) => unknown;
  return {
    ...actual,
    assertSupabaseDatabaseTargetIdentity(input: { targetEnv: string; databaseUrl: string }) {
      if (identityControl.impl) return identityControl.impl(input);
      return realAssert(input);
    },
  };
});

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const WRONG_REF = "bbbbbbbbbbbbbbbbbbbb";
const EXPECTED_HEAD_SHA = "a".repeat(40);
const RAW_PASSWORD = "ZZfakePw9#Q";
const ENCODED_PASSWORD = "ZZfakePw9%23Q";
const PERCENT_PASSWORD = "ZZfakePw9%Q";
const FAKE_USER = "zzfake_user";
const FAKE_HOST = "zzfake-host.example";
const POOLER_HOST = "aws-0-zzfake.pooler.supabase.com";
const SOLO_FOUNDER_ACKNOWLEDGEMENT = "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN";

const PRIOR_AUDIT_KEYS = [
  "schema_version",
  "tool",
  "target_env",
  "project_ref",
  "checked_at",
  "outcome",
  "migration_version",
  "migration_name",
  "migration_sha256",
  "expected_head_sha",
  "observed_head_sha",
  "repository",
  "repository_id",
  "workflow_path",
  "run_id",
  "run_attempt",
  "operation",
  "delivery_mode",
  "founder_github_user_id",
  "founder_github_login",
  "production_environment",
  "solo_founder_acknowledgement_verified",
  "environment_contract_verified",
  "environment_approval_verified",
  "minimum_review_seconds",
  "maximum_review_seconds",
] as const;

const FORBIDDEN_MESSAGE_FRAGMENTS = [
  "Database URL is not a valid absolute URL.",
  "Database URL contains leading, trailing, or control whitespace.",
  "Database URL project ref does not match",
  "Database URL does not use a supported Supabase database host.",
  "Database URL must target the postgres database.",
  "Database URL must use sslmode=require",
  "URI malformed",
  "leak-me",
  "not_on_the_allowlist",
];

const temporaryRoots: string[] = [];

function evidenceEnv() {
  const root = mkdtempSync(join(tmpdir(), "verdant-plants-target-rejection-"));
  temporaryRoots.push(root);
  const caPath = join(root, PRODUCTION_SUPABASE_CA_FILENAME);
  const ca = rootCertificates[0];
  if (!ca) throw new Error("Node did not provide a root certificate for the test.");
  writeFileSync(caPath, ca, { mode: 0o600 });
  return {
    REPORT_PATH: join(root, "report.md"),
    AUDIT_PATH: join(root, "audit.json"),
    PREFLIGHT_RECEIPT_PATH: join(root, "preflight-receipt.json"),
    RUNNER_TEMP: root,
    SUPABASE_DB_CA_CERT_PATH: caPath,
    SUPABASE_DB_CA_CERT_B64: "fabricated-ca-marker",
  };
}

function baseEnv(databaseUrl: string) {
  const evidence = evidenceEnv();
  return {
    evidence,
    env: {
      OPERATION: "PREFLIGHT",
      TARGET_ENV: "production",
      EXPECTED_HEAD_SHA,
      CURRENT_DEPLOY_HEAD_SHA: EXPECTED_HEAD_SHA,
      GITHUB_SHA: EXPECTED_HEAD_SHA,
      GITHUB_REF_NAME: "verdant-grow-diary",
      GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
      GITHUB_REPOSITORY_ID: "8675309",
      GITHUB_RUN_ID: "24680",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_WORKFLOW_REF:
        "Verdant-OS/verdant-grow-diary/.github/workflows/apply-plants-health-unassessed-default.yml@refs/heads/verdant-grow-diary",
      CONFIRM_PROJECT_REF: PROJECT_REF,
      CONFIRM_APPLY: "",
      PREFLIGHT_RUN_ID: "13579",
      PREFLIGHT_RECEIPT_DIGEST: "",
      SOLO_FOUNDER_ACKNOWLEDGEMENT,
      SOLO_FOUNDER_DELIVERY_MODE: "solo_founder_self_review_v1",
      SOLO_FOUNDER_VERIFIED_USER_ID: "72639960",
      SOLO_FOUNDER_VERIFIED_LOGIN: "cheekhimself",
      SOLO_FOUNDER_VERIFIED_ENVIRONMENT: "verdant-production-solo-founder",
      SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED: "true",
      SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED: "true",
      SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED: "true",
      SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS: "900",
      SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS: "86400",
      SUPABASE_DB_URL: databaseUrl,
      PATH: process.env.PATH ?? "",
      ...evidence,
    },
  };
}

function directUrl(
  user: string,
  password: string,
  host: string,
  path = "postgres",
  query = "sslmode=require",
) {
  return `postgresql://${user}:${password}@${host}:5432/${path}?${query}`;
}

function assertRedacted(surface: string, urls: string[]) {
  const forbidden = [
    RAW_PASSWORD,
    ENCODED_PASSWORD,
    PERCENT_PASSWORD,
    "ZZfakePw9",
    FAKE_USER,
    FAKE_HOST,
    POOLER_HOST,
    WRONG_REF,
    `db.${PROJECT_REF}.supabase.co`,
    ...FORBIDDEN_MESSAGE_FRAGMENTS,
    ...urls,
  ];
  for (const secret of forbidden) {
    expect(surface, secret).not.toContain(secret);
  }
}

function runCase(databaseUrl: string) {
  const { evidence, env } = baseEnv(databaseUrl);
  const lines: string[] = [];
  let calls = 0;
  const status = runPlantsHealthUnassessedDefault({
    env,
    spawnImpl: () => {
      calls += 1;
      return { status: 1, stdout: "", stderr: "" };
    },
    logger: {
      log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
    },
    now: () => new Date("2026-10-11T00:00:00.000Z"),
  });
  const report = readFileSync(evidence.REPORT_PATH, "utf8");
  const auditText = readFileSync(evidence.AUDIT_PATH, "utf8");
  const audit = JSON.parse(auditText) as Record<string, unknown>;
  const surface = [...lines, report, auditText].join("\n");
  return { status, calls, lines, report, audit, auditText, surface };
}

afterEach(() => {
  identityControl.impl = null;
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("plants health target rejection reason", () => {
  const cases: Array<{ name: string; url: string; code: string }> = [
    {
      name: "unencoded hash in the password",
      url: directUrl(FAKE_USER, RAW_PASSWORD, `db.${PROJECT_REF}.supabase.co`),
      code: "malformed_database_url",
    },
    {
      name: "trailing newline",
      url: `${directUrl(FAKE_USER, ENCODED_PASSWORD, `db.${PROJECT_REF}.supabase.co`)}\n`,
      code: "unsafe_database_url",
    },
    {
      name: "wrong project ref",
      url: directUrl("postgres", ENCODED_PASSWORD, `db.${WRONG_REF}.supabase.co`),
      code: "project_ref_mismatch",
    },
    {
      name: "custom host",
      url: directUrl(FAKE_USER, ENCODED_PASSWORD, FAKE_HOST),
      code: "unsupported_supabase_host",
    },
    {
      name: "wrong database path",
      url: directUrl(FAKE_USER, ENCODED_PASSWORD, `db.${PROJECT_REF}.supabase.co`, "notpostgres"),
      code: "unexpected_database_name",
    },
    {
      name: "sslmode disable",
      url: directUrl(
        FAKE_USER,
        ENCODED_PASSWORD,
        `db.${PROJECT_REF}.supabase.co`,
        "postgres",
        "sslmode=disable",
      ),
      code: "unsupported_sslmode",
    },
    {
      name: "raw percent that passes identity",
      url: directUrl("postgres", PERCENT_PASSWORD, `db.${PROJECT_REF}.supabase.co`),
      code: "libpq_environment_rejected",
    },
  ];

  it.each(cases)("records $code for $name and redacts the fake URL", ({ url, code }) => {
    const result = runCase(url);
    const expectedLine = `Production database identity was rejected (${code}).`;

    expect(result.status).toBe(EXIT.TARGET_REJECTED);
    expect(result.status).toBe(3);
    expect(result.calls).toBe(0);
    expect(result.lines.join("\n")).toContain(expectedLine);
    expect(result.report).toContain(expectedLine);
    expect(result.report).toContain("No database process was started.");
    expect(result.audit.outcome).toBe("target_rejected");
    expect(result.audit.identity_reason_code).toBe(code);
    expect(result.audit.tool).toBe(TOOL_NAME);
    expect(Object.keys(result.audit)).toEqual([...PRIOR_AUDIT_KEYS, "identity_reason_code"]);
    assertRedacted(result.surface, [url]);
  });

  it("records unknown_identity_error for a plain Error and an unlisted identity code", () => {
    const url = directUrl("postgres", ENCODED_PASSWORD, `db.${PROJECT_REF}.supabase.co`);
    const injections = [
      () => {
        throw new Error("leak-me-ZZfakePw9");
      },
      () => {
        throw new SupabaseDatabaseTargetIdentityError("not_on_the_allowlist", "leak-me-ZZfakePw9");
      },
    ];

    for (const impl of injections) {
      identityControl.impl = impl;
      const result = runCase(url);
      expect(result.status).toBe(EXIT.TARGET_REJECTED);
      expect(result.calls).toBe(0);
      expect(result.audit.outcome).toBe("target_rejected");
      expect(result.audit.identity_reason_code).toBe("unknown_identity_error");
      expect(result.lines.join("\n")).toContain(
        "Production database identity was rejected (unknown_identity_error).",
      );
      expect(Object.keys(result.audit)).toEqual([...PRIOR_AUDIT_KEYS, "identity_reason_code"]);
      assertRedacted(result.surface, [url, "leak-me-ZZfakePw9"]);
      identityControl.impl = null;
    }
  });

  it("lets a valid fake direct URL and a valid fake pooler URL pass identity", () => {
    const urls = [
      directUrl("postgres", ENCODED_PASSWORD, `db.${PROJECT_REF}.supabase.co`),
      `postgresql://${FAKE_USER}:${ENCODED_PASSWORD}@${POOLER_HOST}:6543/postgres?sslmode=require`,
    ];
    for (const url of urls) {
      const result = runCase(url);
      expect(result.calls, url).toBe(1);
      expect(result.status, url).not.toBe(EXIT.TARGET_REJECTED);
      expect(result.audit.outcome, url).not.toBe("target_rejected");
      expect(result.audit.identity_reason_code, url).toBeUndefined();
      assertRedacted(result.surface, urls);
    }
  });

  it("rejects authorization before the identity step", () => {
    const url = directUrl(FAKE_USER, RAW_PASSWORD, FAKE_HOST);
    const { evidence, env } = baseEnv(url);
    delete (env as Record<string, string | undefined>).SOLO_FOUNDER_ACKNOWLEDGEMENT;
    const lines: string[] = [];
    let calls = 0;
    const status = runPlantsHealthUnassessedDefault({
      env,
      spawnImpl: () => {
        calls += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
      logger: {
        log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      },
      now: () => new Date("2026-10-11T00:00:00.000Z"),
    });
    const report = readFileSync(evidence.REPORT_PATH, "utf8");
    const auditText = readFileSync(evidence.AUDIT_PATH, "utf8");
    const audit = JSON.parse(auditText) as Record<string, unknown>;
    const surface = [...lines, report, auditText].join("\n");

    expect(status).toBe(EXIT.INPUT_REJECTED);
    expect(calls).toBe(0);
    expect(audit.outcome).toBe("authorization_rejected");
    expect(audit.identity_reason_code).toBeUndefined();
    expect(surface).not.toContain("Production database identity was rejected");
    assertRedacted(surface, [url]);
  });
});
