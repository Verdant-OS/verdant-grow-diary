import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  extractDefinition,
  FORWARD_MIGRATION_FILE,
  FORWARD_MIGRATION_SHA256,
  MIGRATION_FILE,
  MIGRATION_SHA256,
  mutateLockWait,
  runEventReplayLockHarness,
  validateLocalTarget,
} from "../../scripts/run-quicklog-event-replay-lock-pg15-harness.mjs";

const localUrl =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";
const source = readFileSync(resolve("supabase/migrations", MIGRATION_FILE), "utf8").replace(
  /\r/g,
  "",
);
const definition = extractDefinition(
  source,
  "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
);

describe("event replay locking disposable PostgreSQL proof", () => {
  it.each([
    undefined,
    null,
    {},
    {
      url: "postgresql://postgres:synthetic@db.example.test:5432/verdant_quicklog_delegate_repair",
    },
    { url: "postgresql://postgres:synthetic@127.0.0.1:5432/postgres" },
  ])("rejects invalid target %j", (options) => {
    expect(validateLocalTarget(options)).toBeNull();
  });

  it("rejects invalid containers and accepts only the attested loopback database", () => {
    expect(validateLocalTarget({ url: localUrl })).not.toBeNull();
    expect(validateLocalTarget({ url: localUrl, containerId: "bad;command" })).toBeNull();
    expect(validateLocalTarget({ url: localUrl, containerRuntime: "shell" })).toBeNull();
  });

  it("starts no database process for a rejected target", async () => {
    const sync = vi.fn();
    const asyncSpawn = vi.fn();
    await expect(
      runEventReplayLockHarness({
        url: "postgresql://postgres:synthetic@production.example.test:5432/postgres",
        spawnImpl: sync,
        spawnAsyncImpl: asyncSpawn,
      }),
    ).resolves.toBe(1);
    expect(sync).not.toHaveBeenCalled();
    expect(asyncSpawn).not.toHaveBeenCalled();
  });

  it("requires the existing sentinel before any schema reset or concurrent session", async () => {
    const sync = vi.fn((_command: string, _args: string[], _options: { input: string }) => ({
      status: 0,
      stdout: "rejected\n",
      stderr: "",
    }));
    const asyncSpawn = vi.fn();
    await expect(
      runEventReplayLockHarness({ url: localUrl, spawnImpl: sync, spawnAsyncImpl: asyncSpawn }),
    ).resolves.toBe(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][2].input).not.toContain("drop schema");
    expect(asyncSpawn).not.toHaveBeenCalled();
  });

  it("pins the actual self-transactional migration bytes", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(MIGRATION_SHA256);
    expect(source).toContain("BEGIN;");
    expect(source.trimEnd()).toMatch(/COMMIT;$/);
  });

  it("pins the self-transactional forward repair and proves it on its live wrapper", () => {
    const forward = readFileSync(
      resolve("supabase/migrations", FORWARD_MIGRATION_FILE),
      "utf8",
    ).replace(/\r/g, "");
    expect(createHash("sha256").update(forward).digest("hex")).toBe(FORWARD_MIGRATION_SHA256);
    expect(forward).toContain("BEGIN;");
    expect(forward.trimEnd()).toMatch(/COMMIT;$/);
    // The lock controls mutate the wrapper the forward repair installs.
    const live = extractDefinition(
      forward,
      "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
    );
    expect(mutateLockWait(live, "receipt")).toContain("FOR UPDATE OF de;");
    expect(mutateLockWait(live, "metadata")).not.toContain("SKIP LOCKED");
  });

  it("sets the real INSERT timestamp context and verifies fixture stamps before applying", async () => {
    const responses = ["verdant_quicklog_delegate_repair_pg15_disposable_v1", "", "", "f"];
    const sync = vi.fn((_command: string, _args: string[], _options: { input: string }) => ({
      status: 0,
      stdout: responses.shift(),
      stderr: "",
    }));
    const asyncSpawn = vi.fn();
    await expect(
      runEventReplayLockHarness({ url: localUrl, spawnImpl: sync, spawnAsyncImpl: asyncSpawn }),
    ).resolves.toBe(1);
    expect(sync).toHaveBeenCalledTimes(4);
    const setup = sync.mock.calls[2][2].input;
    expect(setup).toMatch(/^begin;/);
    expect(setup.trimEnd()).toMatch(/commit;$/);
    expect(
      setup.indexOf("set local verdant.quicklog_logged_at = '2026-01-01T10:01:00Z'"),
    ).toBeLessThan(setup.indexOf("insert into public.grow_events"));
    expect(setup).toContain("set local verdant.quicklog_logged_at = '2026-01-01T10:01:00Z'");
    expect(sync.mock.calls[3][2].input).toContain("logged_at='2026-01-01T10:01:00Z'");
    expect(asyncSpawn).not.toHaveBeenCalled();
  });

  it("constructs separate controls for the receipt lock and legacy metadata lock", () => {
    const receipt = mutateLockWait(definition, "receipt");
    const metadata = mutateLockWait(definition, "metadata");
    expect(receipt).toContain("FOR UPDATE OF de;");
    expect(receipt).toContain("FOR UPDATE OF de SKIP LOCKED");
    expect(metadata).not.toContain("FOR UPDATE OF de;");
    expect(metadata).not.toContain("SKIP LOCKED");
    expect(metadata).toContain("FOR UPDATE OF de");
    expect(definition).not.toContain("FOR UPDATE OF de;");
    expect(definition).toContain("SKIP LOCKED");
  });

  it("refuses ambiguous, missing or invalid mutation/extraction inputs", () => {
    expect(() => extractDefinition(null, "marker")).toThrow("source_shape_rejected");
    expect(() => extractDefinition(source, "missing marker")).toThrow("source_shape_rejected");
    expect(() =>
      extractDefinition(
        `${source}\n${definition}`,
        "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
      ),
    ).toThrow("source_shape_rejected");
    expect(() => mutateLockWait(definition, "other")).toThrow("mutation_shape_rejected");
    expect(() => mutateLockWait(null, "receipt")).toThrow("mutation_shape_rejected");
  });

  it("resolves real workflow triggers and a pinned secret-free local service", () => {
    const workflow = loadYaml(
      readFileSync(resolve(".github/workflows/quicklog-event-replay-lock-pg15.yml"), "utf8"),
    ) as {
      on: Record<string, { paths?: string[]; branches?: string[] }>;
      permissions: Record<string, string>;
      jobs: {
        pg15_runtime: {
          env: Record<string, string>;
          services: { postgres: { image: string } };
          steps: Array<{ run?: string }>;
        };
      };
    };
    expect(Object.keys(workflow.on).sort()).toEqual(["merge_group", "pull_request", "push"]);
    expect(workflow.on.pull_request.paths).toContain(`supabase/migrations/${MIGRATION_FILE}`);
    expect(workflow.on.pull_request.paths).toContain(
      `supabase/migrations/${FORWARD_MIGRATION_FILE}`,
    );
    expect(workflow.on.push.branches).toEqual(["verdant-grow-diary"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.pg15_runtime.env.QUICKLOG_EVENT_REPLAY_LOCK_PG15_URL).toBe(localUrl);
    expect(workflow.jobs.pg15_runtime.services.postgres.image).toMatch(
      /^postgres:15\.18@sha256:[a-f0-9]{64}$/,
    );
    expect(
      workflow.jobs.pg15_runtime.steps.some(
        (step) => step.run === "node scripts/run-quicklog-event-replay-lock-pg15-harness.mjs",
      ),
    ).toBe(true);
    expect(JSON.stringify(workflow)).not.toContain("secrets.");
  });
});
