import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SUBSCRIBER_GROWTH_RECORDED_FUNCTION_NAME,
  SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
} from "./subscriber-growth-launch-gate-rules.mjs";
import { SUBSCRIBER_GROWTH_MIGRATION_CONTRACT } from "./subscriber-growth-migration-contract.mjs";

const REQUIRED_MIGRATION_IDS = Object.freeze(
  SUBSCRIBER_GROWTH_MIGRATION_CONTRACT.map((migration) =>
    path.basename(migration.path).slice(0, 14),
  ),
);
const REMOTE_FUNCTION_RELATIVE_PATH = path.join(
  "supabase",
  "functions",
  SUBSCRIBER_GROWTH_RECORDED_FUNCTION_NAME,
  "index.ts",
);
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const SUPABASE_CLI_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "CI",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "NO_COLOR",
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_PREFIX",
  "NPM_CONFIG_USERCONFIG",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
  "SUPABASE_ACCESS_TOKEN",
]);

export const SUBSCRIBER_GROWTH_REQUIRED_REMOTE_FUNCTION_MARKERS = Object.freeze([
  "async function recordFreshAiDoctorReviewCompletion",
  'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")',
  'serviceSupabase.rpc("record_ai_doctor_review_completion"',
  '"ai-doctor-review completion=recorded"',
]);

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function migrationId(value) {
  return safeString(value).match(/\b(\d{14})\b/)?.[1] ?? null;
}

function walkJson(value, visit, key = null) {
  if (Array.isArray(value)) {
    value.forEach((entry) => walkJson(entry, visit, key));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, entry]) => walkJson(entry, visit, childKey));
  } else if (typeof value === "string") {
    visit(value, key);
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractRemoteMigrationIds(output) {
  const fromJson = new Set();
  const parsed = parseJson(safeString(output));
  if (parsed !== null) {
    walkJson(parsed, (value, key) => {
      if (key && /remote/i.test(key)) {
        const id = migrationId(value);
        if (id) fromJson.add(id);
      }
    });
  }
  if (fromJson.size > 0) return fromJson;

  const fromTable = new Set();
  for (const line of safeString(output).replace(ANSI_PATTERN, "").split(/\r?\n/)) {
    const columns = line.split(/[│|]/).map((column) => column.trim());
    if (columns.length < 2) continue;
    const id = migrationId(columns[1]);
    if (id) fromTable.add(id);
  }
  return fromTable;
}

export function extractSecretNames(output) {
  const fromJson = new Set();
  const parsed = parseJson(safeString(output));
  if (parsed !== null) {
    walkJson(parsed, (value, key) => {
      if (key && /^(?:name|secret_name)$/i.test(key) && /^[A-Z][A-Z0-9_]+$/.test(value)) {
        fromJson.add(value);
      }
    });
  }
  if (fromJson.size > 0) return fromJson;

  const fromTable = new Set();
  for (const line of safeString(output).replace(ANSI_PATTERN, "").split(/\r?\n/)) {
    const [firstColumn] = line.split(/[│|]/).map((column) => column.trim());
    if (/^[A-Z][A-Z0-9_]+$/.test(firstColumn)) fromTable.add(firstColumn);
  }
  return fromTable;
}

export function sourceContainsPaidReturnCompletionRecorder(source) {
  return (
    typeof source === "string" &&
    SUBSCRIBER_GROWTH_REQUIRED_REMOTE_FUNCTION_MARKERS.every((marker) => source.includes(marker))
  );
}

export function sourceMatchesReviewedRelease(localSource, remoteSource) {
  const normalize = (source) =>
    safeString(source)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");
  const local = normalize(localSource);
  return local.length > 0 && local === normalize(remoteSource);
}

export function evaluateSubscriberGrowthBackendRemoteVerification(input) {
  const remoteMigrationIds = extractRemoteMigrationIds(input?.migrationOutput);
  const secretNames = extractSecretNames(input?.secretsOutput);
  const projectLinked = input?.linkedProjectRef === SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF;
  const migrationsVerified =
    input?.migrationCommandPassed === true &&
    REQUIRED_MIGRATION_IDS.every((id) => remoteMigrationIds.has(id));
  const completionRecorderSecretVerified =
    input?.secretsCommandPassed === true && secretNames.has("SUPABASE_SERVICE_ROLE_KEY");
  const temporaryArtifactsRemoved = input?.temporaryArtifactsRemoved === true;
  const functionSourceVerified =
    input?.functionDownloadPassed === true &&
    temporaryArtifactsRemoved &&
    sourceContainsPaidReturnCompletionRecorder(input?.localFunctionSource) &&
    sourceContainsPaidReturnCompletionRecorder(input?.remoteFunctionSource) &&
    sourceMatchesReviewedRelease(input?.localFunctionSource, input?.remoteFunctionSource);

  return {
    kind: "authenticated_supabase_remote_check",
    projectLinked,
    migrationsVerified,
    completionRecorderSecretVerified,
    temporaryArtifactsRemoved,
    functionSourceVerified,
    verified:
      projectLinked &&
      migrationsVerified &&
      completionRecorderSecretVerified &&
      functionSourceVerified,
  };
}

export function buildSupabaseCliEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name, value]) =>
        typeof value === "string" && SUPABASE_CLI_ENV_ALLOWLIST.has(name.toUpperCase()),
    ),
  );
}

function runSupabaseCli(args, cwd) {
  const result = spawnSync("npx", ["--yes", "supabase@latest", ...args], {
    cwd,
    encoding: "utf8",
    env: buildSupabaseCliEnvironment(),
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  return {
    ok: result.status === 0,
    output: safeString(result.stdout),
  };
}

function runReadOnlyCommand(runCommand, args, cwd) {
  try {
    const result = runCommand(args, cwd);
    return { ok: result?.ok === true, output: safeString(result?.output) };
  } catch {
    return { ok: false, output: "" };
  }
}

function readFileOrNull(readFile, file) {
  try {
    return readFile(file, "utf8");
  } catch {
    return null;
  }
}

function findDownloadedFunctionSource(directory, fileSystem) {
  const expected = path.join(directory, REMOTE_FUNCTION_RELATIVE_PATH);
  if (fileSystem.existsSync(expected)) return expected;

  const visit = (current) => {
    let entries = [];
    try {
      entries = fileSystem.readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const found = visit(candidate);
        if (found) return found;
      } else if (
        entry.isFile() &&
        entry.name === "index.ts" &&
        candidate.includes(SUBSCRIBER_GROWTH_RECORDED_FUNCTION_NAME)
      ) {
        return candidate;
      }
    }
    return null;
  };

  return visit(directory);
}

export function verifySubscriberGrowthBackendRelease({
  root = process.cwd(),
  runCommand = runSupabaseCli,
  fileSystem = fs,
  tempDirectory = () => fileSystem.mkdtempSync(path.join(os.tmpdir(), "verdant-release-")),
} = {}) {
  const linkedProjectRef = safeString(
    readFileOrNull(fileSystem.readFileSync, path.join(root, "supabase", ".temp", "project-ref")),
  ).trim();
  const localFunctionSource = readFileOrNull(
    fileSystem.readFileSync,
    path.join(root, REMOTE_FUNCTION_RELATIVE_PATH),
  );

  if (linkedProjectRef !== SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF) {
    return evaluateSubscriberGrowthBackendRemoteVerification({
      linkedProjectRef,
      localFunctionSource,
    });
  }

  const migration = runReadOnlyCommand(
    runCommand,
    ["migration", "list", "--linked", "--output-format=json"],
    root,
  );
  const secrets = runReadOnlyCommand(
    runCommand,
    [
      "secrets",
      "list",
      "--project-ref",
      SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
      "--output-format=json",
    ],
    root,
  );

  let functionDownload = { ok: false, output: "" };
  let remoteFunctionSource = null;
  let temporaryArtifactsRemoved = false;
  let temporaryDirectory = null;
  try {
    temporaryDirectory = tempDirectory();
    functionDownload = runReadOnlyCommand(
      runCommand,
      [
        "functions",
        "download",
        SUBSCRIBER_GROWTH_RECORDED_FUNCTION_NAME,
        "--project-ref",
        SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF,
        "--use-api",
      ],
      temporaryDirectory,
    );
    const downloadedSourcePath = findDownloadedFunctionSource(temporaryDirectory, fileSystem);
    if (downloadedSourcePath) {
      remoteFunctionSource = readFileOrNull(fileSystem.readFileSync, downloadedSourcePath);
    }
  } catch {
    functionDownload = { ok: false, output: "" };
  } finally {
    if (temporaryDirectory) {
      try {
        fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true });
        temporaryArtifactsRemoved = true;
      } catch {
        // Temporary verification artifacts never block the fail-closed result.
      }
    }
  }

  return evaluateSubscriberGrowthBackendRemoteVerification({
    linkedProjectRef,
    migrationCommandPassed: migration.ok,
    migrationOutput: migration.output,
    secretsCommandPassed: secrets.ok,
    secretsOutput: secrets.output,
    functionDownloadPassed: functionDownload.ok,
    localFunctionSource,
    remoteFunctionSource,
    temporaryArtifactsRemoved,
  });
}
