import { describe, expect, it } from "vitest";

import {
  buildSupabaseCliEnvironment,
  evaluateSubscriberGrowthBackendRemoteVerification,
  extractRemoteMigrationIds,
  extractSecretNames,
  sourceContainsPaidReturnCompletionRecorder,
  sourceMatchesReviewedRelease,
  SUBSCRIBER_GROWTH_REQUIRED_REMOTE_FUNCTION_MARKERS,
  verifySubscriberGrowthBackendRelease,
} from "../../scripts/releases/subscriber-growth-backend-remote-verification.mjs";
import { SUBSCRIBER_GROWTH_MIGRATION_CONTRACT } from "../../scripts/releases/subscriber-growth-migration-contract.mjs";
import { SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF } from "../../scripts/releases/subscriber-growth-launch-gate-rules.mjs";

const migrationIds = SUBSCRIBER_GROWTH_MIGRATION_CONTRACT.map(
  (migration) => migration.path.match(/\/(\d{14})_/)?.[1],
);
const recorderSource = SUBSCRIBER_GROWTH_REQUIRED_REMOTE_FUNCTION_MARKERS.join("\n");

describe("subscriber growth backend remote verification", () => {
  it("recognizes only remote migration IDs and secret names from authenticated CLI output", () => {
    const migrationOutput = JSON.stringify({
      migrations: migrationIds.map((id) => ({ local: id, remote: id })),
    });
    const secretOutput = JSON.stringify([{ name: "SUPABASE_SERVICE_ROLE_KEY" }]);

    expect(extractRemoteMigrationIds(migrationOutput)).toEqual(new Set(migrationIds));
    expect(extractSecretNames(secretOutput)).toEqual(new Set(["SUPABASE_SERVICE_ROLE_KEY"]));
    expect(
      extractRemoteMigrationIds(
        [
          "LOCAL              │ REMOTE             │ TIME (UTC)",
          `${migrationIds[0]} │                    │ 2026-07-14`,
          `${migrationIds[1]} │ ${migrationIds[1]} │ 2026-07-14`,
        ].join("\n"),
      ),
    ).toEqual(new Set([migrationIds[1]]));
  });

  it("verifies the paid-return backend only when the linked project, remote ledger, secret name, and downloaded source all pass", () => {
    const migrationOutput = JSON.stringify({
      migrations: migrationIds.map((id) => ({ local: id, remote: id })),
    });
    const verification = evaluateSubscriberGrowthBackendRemoteVerification({
      linkedProjectRef: SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
      migrationCommandPassed: true,
      migrationOutput,
      secretsCommandPassed: true,
      secretsOutput: JSON.stringify([{ name: "SUPABASE_SERVICE_ROLE_KEY" }]),
      functionDownloadPassed: true,
      localFunctionSource: recorderSource,
      remoteFunctionSource: recorderSource,
      temporaryArtifactsRemoved: true,
    });

    expect(verification).toEqual({
      kind: "authenticated_supabase_remote_check",
      projectLinked: true,
      migrationsVerified: true,
      completionRecorderSecretVerified: true,
      temporaryArtifactsRemoved: true,
      functionSourceVerified: true,
      verified: true,
    });
  });

  it("fails closed for a local-only migration, a missing secret name, or a remotely stale function", () => {
    const remoteMissingLast = JSON.stringify({
      migrations: migrationIds.map((id, index) => ({
        local: id,
        remote: index === migrationIds.length - 1 ? null : id,
      })),
    });
    const verification = evaluateSubscriberGrowthBackendRemoteVerification({
      linkedProjectRef: SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
      migrationCommandPassed: true,
      migrationOutput: remoteMissingLast,
      secretsCommandPassed: true,
      secretsOutput: JSON.stringify([{ name: "OTHER_SECRET" }]),
      functionDownloadPassed: true,
      localFunctionSource: recorderSource,
      remoteFunctionSource: "function without the completion recorder",
      temporaryArtifactsRemoved: true,
    });

    expect(verification).toMatchObject({
      projectLinked: true,
      migrationsVerified: false,
      completionRecorderSecretVerified: false,
      functionSourceVerified: false,
      verified: false,
    });
  });

  it("does not invoke remote commands when the worktree is not linked to the expected project", () => {
    let commands = 0;
    const verification = verifySubscriberGrowthBackendRelease({
      root: "C:/release",
      runCommand: () => {
        commands += 1;
        return { ok: true, output: "" };
      },
      fileSystem: {
        readFileSync: (file: string) =>
          file.endsWith("project-ref") ? "wrong-project" : recorderSource,
      },
    });

    expect(commands).toBe(0);
    expect(verification).toMatchObject({ projectLinked: false, verified: false });
  });

  it("fails closed instead of throwing when a temporary download directory cannot be created", () => {
    const verification = verifySubscriberGrowthBackendRelease({
      root: "C:/release",
      runCommand: (args: string[]) => {
        if (args[0] === "migration") {
          return {
            ok: true,
            output: JSON.stringify({
              migrations: migrationIds.map((id) => ({ local: id, remote: id })),
            }),
          };
        }
        return { ok: true, output: JSON.stringify([{ name: "SUPABASE_SERVICE_ROLE_KEY" }]) };
      },
      fileSystem: {
        readFileSync: (file: string) =>
          file.endsWith("project-ref") ? SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF : recorderSource,
      },
      tempDirectory: () => {
        throw new Error("temporary directory unavailable");
      },
    });

    expect(verification).toMatchObject({
      projectLinked: true,
      migrationsVerified: true,
      completionRecorderSecretVerified: true,
      functionSourceVerified: false,
      verified: false,
    });
  });

  it("runs only read-only remote checks and retains no remote command output", () => {
    const invoked: string[][] = [];
    let cleaned = false;
    const verification = verifySubscriberGrowthBackendRelease({
      root: "C:/release",
      runCommand: (args: string[]) => {
        invoked.push(args);
        if (args[0] === "migration") {
          return {
            ok: true,
            output: JSON.stringify({
              migrations: migrationIds.map((id) => ({ local: id, remote: id })),
            }),
          };
        }
        if (args[0] === "secrets") {
          return { ok: true, output: JSON.stringify([{ name: "SUPABASE_SERVICE_ROLE_KEY" }]) };
        }
        return { ok: true, output: "remote output is deliberately not retained" };
      },
      fileSystem: {
        readFileSync: (file: string) => {
          if (file.endsWith("project-ref")) return SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF;
          return recorderSource;
        },
        existsSync: () => true,
        rmSync: () => {
          cleaned = true;
        },
      },
      tempDirectory: () => "C:/temporary-remote-function",
    });

    expect(invoked).toEqual([
      ["migration", "list", "--linked", "--output-format=json"],
      [
        "secrets",
        "list",
        "--project-ref",
        SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
        "--output-format=json",
      ],
      [
        "functions",
        "download",
        "ai-doctor-review",
        "--project-ref",
        SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
        "--use-api",
      ],
    ]);
    expect(cleaned).toBe(true);
    expect(verification).toMatchObject({ verified: true });
    expect(JSON.stringify(verification)).not.toContain("remote output");
  });

  it("fails closed if its downloaded source cannot be removed", () => {
    const verification = verifySubscriberGrowthBackendRelease({
      root: "C:/release",
      runCommand: (args: string[]) => {
        if (args[0] === "migration") {
          return {
            ok: true,
            output: JSON.stringify({
              migrations: migrationIds.map((id) => ({ local: id, remote: id })),
            }),
          };
        }
        if (args[0] === "secrets") {
          return { ok: true, output: JSON.stringify([{ name: "SUPABASE_SERVICE_ROLE_KEY" }]) };
        }
        return { ok: true, output: "" };
      },
      fileSystem: {
        readFileSync: (file: string) =>
          file.endsWith("project-ref") ? SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF : recorderSource,
        existsSync: () => true,
        rmSync: () => {
          throw new Error("cleanup failed");
        },
      },
      tempDirectory: () => "C:/temporary-remote-function",
    });

    expect(verification).toMatchObject({
      temporaryArtifactsRemoved: false,
      functionSourceVerified: false,
      verified: false,
    });
  });

  it("requires every completion-recorder marker and source parity with the reviewed release", () => {
    expect(sourceContainsPaidReturnCompletionRecorder(recorderSource)).toBe(true);
    expect(
      sourceContainsPaidReturnCompletionRecorder(
        recorderSource.replace("record_ai_doctor_review_completion", "missing"),
      ),
    ).toBe(false);
    expect(
      sourceMatchesReviewedRelease(recorderSource, recorderSource.replace(/\n/g, "\r\n")),
    ).toBe(true);
    expect(sourceMatchesReviewedRelease(recorderSource, `${recorderSource}\n// different`)).toBe(
      false,
    );
  });

  it("passes only the Supabase CLI's minimum authenticated environment", () => {
    const environment = buildSupabaseCliEnvironment({
      Path: "C:/bin",
      TEMP: "C:/temp",
      SUPABASE_ACCESS_TOKEN: "access-token",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-pass",
      VITE_SUPABASE_ANON_KEY: "must-not-pass",
      PADDLE_API_KEY: "must-not-pass",
    });

    expect(environment).toEqual({
      Path: "C:/bin",
      TEMP: "C:/temp",
      SUPABASE_ACCESS_TOKEN: "access-token",
    });
  });
});
