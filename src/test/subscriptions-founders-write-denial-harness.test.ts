import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  LOCAL_LANE_FLAG,
  PERMISSION_DENIED,
  denied,
  environmentFlipBlocked,
  isLoopbackHost,
  permissionDenied,
  resolveHarnessTarget,
} from "../../scripts/run-subscriptions-founders-write-denial-harness";

const ROOT = resolve(__dirname, "../..");
const HARNESS = "scripts/run-subscriptions-founders-write-denial-harness.ts";
const SCRIPTS = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts as Record<
  string,
  string
>;

type Step = { name?: string; id?: string; if?: string; run?: string; with?: { path?: string } };
const STEPS = (
  load(readFileSync(resolve(ROOT, ".github/workflows/security-db-local.yml"), "utf8")) as {
    jobs: Record<string, { steps: Step[] }>;
  }
).jobs["test-security-db-local"].steps;

const LOCAL = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service",
  SUPABASE_ANON_KEY: "local-anon",
};

describe("write-denial harness refuses anything but the disposable loopback database", () => {
  it("runs against a loopback API with the lane flag", () => {
    expect(resolveHarnessTarget([LOCAL_LANE_FLAG], LOCAL)).toEqual({
      ok: true,
      supabaseUrl: LOCAL.SUPABASE_URL,
      serviceKey: "local-service",
      anonKey: "local-anon",
    });
    for (const url of ["http://localhost:54321", "http://[::1]:54321", "http://LOCALHOST.:54321"]) {
      expect(resolveHarnessTarget([LOCAL_LANE_FLAG], { ...LOCAL, SUPABASE_URL: url }).ok).toBe(
        true,
      );
    }
  });

  it("accepts the documented anon-key aliases", () => {
    const { SUPABASE_ANON_KEY: _unused, ...withoutAnon } = LOCAL;
    expect(
      resolveHarnessTarget([LOCAL_LANE_FLAG], { ...withoutAnon, SUPABASE_PUBLISHABLE_KEY: "p" }),
    ).toMatchObject({ ok: true, anonKey: "p" });
  });

  it("skips (exit 0) without the lane flag, so a bare run touches nothing", () => {
    expect(resolveHarnessTarget([], LOCAL)).toMatchObject({ ok: false, exitCode: 0 });
  });

  it("refuses the hosted Verdant project and every other remote host", () => {
    for (const url of [
      "https://knkwiiywfkbqznbxwqfh.supabase.co",
      "https://example.supabase.co",
      "http://127.0.0.1.attacker.example:54321",
      "http://10.0.0.5:54321",
    ]) {
      expect(resolveHarnessTarget([LOCAL_LANE_FLAG], { ...LOCAL, SUPABASE_URL: url })).toEqual({
        ok: false,
        exitCode: 2,
        message: "local security lane requires a loopback database",
      });
    }
    expect(isLoopbackHost("127.0.0.2")).toBe(false);
  });

  it("refuses missing configuration or an invalid URL", () => {
    for (const key of Object.keys(LOCAL)) {
      const env: Record<string, string | undefined> = { ...LOCAL, [key]: undefined };
      expect(resolveHarnessTarget([LOCAL_LANE_FLAG], env)).toMatchObject({
        ok: false,
        exitCode: 2,
      });
    }
    expect(
      resolveHarnessTarget([LOCAL_LANE_FLAG], { ...LOCAL, SUPABASE_URL: "not a url" }),
    ).toMatchObject({ ok: false, exitCode: 2, message: "database API URL is invalid" });
  });
});

const PERMISSION_ERROR = {
  data: null,
  error: { code: "42501", message: 'permission denied for table "founders"' },
};
const RLS_ERROR = {
  data: null,
  error: { code: "42501", message: 'new row violates row-level security policy for table "x"' },
};
const UNIQUE_VIOLATION = {
  data: null,
  error: { code: "23505", message: 'duplicate key value violates unique constraint "x"' },
};
const NO_ROWS = { data: [], error: null };
const ONE_ROW = { data: [{ user_id: "a" }], error: null };

describe("INSERT denial requires a permission error, not any error", () => {
  it("pins the SQLSTATE", () => {
    expect(PERMISSION_DENIED).toBe("42501");
  });

  it("accepts a missing privilege and a row-level security violation", () => {
    expect(permissionDenied(PERMISSION_ERROR)).toBe(true);
    expect(permissionDenied(RLS_ERROR)).toBe(true);
  });

  it("rejects a unique violation, which is what a future INSERT grant would produce", () => {
    // The loose predicate passes this result; the INSERT checks must not.
    expect(denied(UNIQUE_VIOLATION)).toBe(true);
    expect(permissionDenied(UNIQUE_VIOLATION)).toBe(false);
  });

  it("rejects success, an empty result and an error without a code", () => {
    expect(permissionDenied(ONE_ROW)).toBe(false);
    expect(permissionDenied(NO_ROWS)).toBe(false);
    expect(permissionDenied({ data: null, error: { message: "network" } })).toBe(false);
  });

  it("leaves the loose predicate for UPDATE/UPSERT/DELETE unchanged", () => {
    expect(denied(NO_ROWS)).toBe(true);
    expect(denied(PERMISSION_ERROR)).toBe(true);
    expect(denied(ONE_ROW)).toBe(false);
  });
});

describe("environment flip on an active sandbox subscription", () => {
  const sandbox = { status: "active", environment: "sandbox" };

  it("passes when the update is denied and the row still reads back as sandbox", () => {
    expect(environmentFlipBlocked(NO_ROWS, sandbox)).toBe(true);
    expect(environmentFlipBlocked(PERMISSION_ERROR, sandbox)).toBe(true);
  });

  it("fails when an environment-only grant lets the row turn live", () => {
    const live = { status: "active", environment: "live" };
    expect(environmentFlipBlocked(ONE_ROW, live)).toBe(false);
    // Even if the response hides the write, the service_role read-back catches it.
    expect(environmentFlipBlocked(NO_ROWS, live)).toBe(false);
  });

  it("fails when the update reports an affected row, or the row is missing", () => {
    expect(environmentFlipBlocked(ONE_ROW, sandbox)).toBe(false);
    expect(environmentFlipBlocked(NO_ROWS, undefined)).toBe(false);
    expect(environmentFlipBlocked(NO_ROWS, { status: "canceled", environment: "sandbox" })).toBe(
      false,
    );
  });
});

describe("harness wires the strict predicates into the checks", () => {
  const source = readFileSync(resolve(ROOT, HARNESS), "utf8");
  // @source-scan-justified: main() needs a live loopback database, so which predicate
  // each check calls can only be read from the source in a unit test.
  it("uses permissionDenied for every INSERT check and nowhere looser", () => {
    for (const id of ["S3", "S9", "F3", "F11"]) {
      const check = new RegExp(`["\`]${id}\\. [^"\`]*\\(42501\\)["\`],\\s*permissionDenied\\(`);
      expect(source, id).toMatch(check);
    }
    expect(source.match(/INSERT[^"`]*["`],\s*denied\(/g)).toBeNull();
  });

  it("checks the sandbox environment flip with a service_role read-back", () => {
    expect(source).toContain('.update({ environment: "live" })');
    expect(source).toMatch(/environmentFlipBlocked\(flip,/);
    expect(source).toMatch(/environmentFlipBlocked\(flipUpsert,/);
    expect(source).toContain('environment: "sandbox"');
  });
});

describe("security-db-local runs the write-denial harness", () => {
  it("exposes a package script that passes the lane flag", () => {
    expect(SCRIPTS["test:subscriptions-founders-write-denial"]).toBe(
      `bun run ${HARNESS} ${LOCAL_LANE_FLAG}`,
    );
  });

  it("runs the step after migrations are applied, before the aggregate, when enabled", () => {
    const index = (predicate: (step: Step) => boolean) => STEPS.findIndex(predicate);
    const reset = index((step) => step.run?.includes("supabase db reset") ?? false);
    const position = index((step) => step.id === "subscriptions-founders-write-denial");
    const aggregate = index((step) => step.id === "aggregate");
    expect(reset).toBeGreaterThan(-1);
    expect(position).toBeGreaterThan(reset);
    expect(position).toBeLessThan(aggregate);
    const step = STEPS[position];
    expect(step.if).toBe("env.ENABLED == 'true'");
    expect(step.run).toContain("set -o pipefail");
    expect(step.run).toContain(
      "bun run test:subscriptions-founders-write-denial 2>&1 | tee subscriptions-founders-write-denial.log",
    );
  });

  it("uploads the harness log on failure", () => {
    const upload = STEPS.find((step) => step.id === "upload-artifacts");
    expect(upload?.with?.path).toContain("subscriptions-founders-write-denial.log");
  });
});
