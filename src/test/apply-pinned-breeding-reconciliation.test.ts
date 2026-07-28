/**
 * Contract tests for the protected one-file breeding reconciliation lane.
 *
 * The load-bearing difference from the three-file lane: the breeding
 * migration OWNS ITS TRANSACTION (one top-level BEGIN … COMMIT plus a
 * post-commit NOTIFY), so the runner must never wrap it in
 * `--single-transaction`, and must record the 20260728163100 ledger marker
 * only after the file's own COMMIT and the exact postconditions verified —
 * including the rerun state where the file committed but the marker was
 * never recorded.
 */
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  APPLY_CONFIRMATION,
  BREEDING_RPC_SIGNATURE,
  classifyBreedingState,
  EXIT,
  EXPECTED_API_ACL_ROWS,
  EXPECTED_INDEX_NAMES,
  EXPECTED_POLICY_SHAPE,
  EXPECTED_RPC_ACL_ROWS,
  extractBreedingRpcBody,
  findBreedingUnsafeSqlReason,
  HISTORICAL_BREEDING_ROW,
  MARKER_SQL,
  PINNED_BREEDING_MIGRATION,
  POSTFLIGHT_SQL,
  PREFLIGHT_SQL,
  PRODUCTION_PROJECT_REF,
  REQUIRED_PRIOR_RECONCILIATION_ROWS,
  runPinnedBreedingReconciliation,
  validatePinnedBreedingMigration,
} from "../../scripts/apply-pinned-breeding-reconciliation.mjs";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "apply-pinned-breeding-reconciliation.mjs");
const WORKFLOW_PATH = resolve(
  REPO_ROOT,
  ".github",
  "workflows",
  "apply-pinned-breeding-reconciliation.yml",
);
const MIGRATIONS_ROOT = resolve(REPO_ROOT, "supabase", "migrations");
const PASSWORD = "production-password-never-print";
const DATABASE_URL = `postgresql://postgres:${PASSWORD}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=verify-full`;

/**
 * GitHub's ubuntu checkout preserves the reviewed LF Git-blob bytes. This
 * Windows worktree uses core.autocrlf=true, so focused local tests normalize
 * only checkout CRLF back to the exact bytes the protected runner receives.
 */
function readLfCheckoutFile(path: string) {
  const raw = readFileSync(path);
  return Buffer.from(raw.toString("utf8").split("\r\n").join("\n"), "utf8");
}

const validatedFixture = validatePinnedBreedingMigration({
  root: MIGRATIONS_ROOT,
  readFile: readLfCheckoutFile,
});
const pinnedRpcBody = extractBreedingRpcBody(validatedFixture.text);

type SpawnCall = {
  command: string;
  args: string[];
};

function exactRow(row: { version: string; name: string }) {
  return {
    version: row.version,
    name: row.name,
    matches: [{ version: row.version, name: row.name }],
  };
}

function absentRow(row: { version: string; name: string }) {
  return { version: row.version, name: row.name, matches: [] };
}

function collisionRow(row: { version: string; name: string }) {
  return {
    version: row.version,
    name: row.name,
    matches: [{ version: row.version, name: "some_other_migration" }],
  };
}

type ContractPresence = Readonly<{
  breeding_events_table: boolean;
  rpc_function: boolean;
  owner_trigger: boolean;
}>;

const CONTRACT_PRESENT: ContractPresence = Object.freeze({
  breeding_events_table: true,
  rpc_function: true,
  owner_trigger: true,
});
const CONTRACT_ABSENT: ContractPresence = Object.freeze({
  breeding_events_table: false,
  rpc_function: false,
  owner_trigger: false,
});

function preflightPayload({
  prior = "exact",
  historical = "absent",
  marker = "absent",
  contract = CONTRACT_ABSENT,
}: {
  prior?: "exact" | "absent" | "collision";
  historical?: "exact" | "absent";
  marker?: "exact" | "absent" | "collision";
  contract?: ContractPresence;
} = {}) {
  const shape = (state: string, row: { version: string; name: string }) =>
    state === "exact" ? exactRow(row) : state === "collision" ? collisionRow(row) : absentRow(row);
  return {
    current_user: "postgres",
    ledger_columns: { version: "text", name: "text", statements: "ARRAY" },
    targets: [
      ...REQUIRED_PRIOR_RECONCILIATION_ROWS.map((row) => shape(prior, row)),
      shape(historical, HISTORICAL_BREEDING_ROW),
      shape(marker, PINNED_BREEDING_MIGRATION),
    ],
    contract,
    dependencies: {
      grow_events: true,
      plants: true,
      tents: true,
      grows: true,
      quicklog_idempotency: true,
      action_queue: true,
    },
  };
}

function postflightPayload({ markerRecorded = true }: { markerRecorded?: boolean } = {}) {
  return {
    ledger_exact_count: markerRecorded ? 5 : 4,
    ledger_mismatch_count: markerRecorded ? 0 : 1,
    ledger_collision_count: 0,
    rpc_present: true,
    rpc_security_definer: true,
    rpc_owner: "postgres",
    rpc_search_path: "search_path=public, pg_temp",
    rpc_prosrc: pinnedRpcBody,
    rpc_acl_rows: [...EXPECTED_RPC_ACL_ROWS],
    table_present: true,
    table_rls_enabled: true,
    table_policy_shape: [...EXPECTED_POLICY_SHAPE],
    table_api_acl_rows: [...EXPECTED_API_ACL_ROWS],
    table_index_names: [...EXPECTED_INDEX_NAMES],
    owner_trigger_enabled: true,
  };
}

/**
 * Fake psql. Scripted per-call: `-c PREFLIGHT` → preflight JSON, `--file` →
 * apply, `-c MARKER` → marker, `-c POSTFLIGHT` → postflight JSON (first the
 * pre-marker shape, then the post-marker shape).
 */
function makeFakePsql({
  preflight,
  postflights,
  failMarker = false,
  failApply = false,
}: {
  preflight: unknown;
  postflights: unknown[];
  failMarker?: boolean;
  failApply?: boolean;
}) {
  const calls: SpawnCall[] = [];
  let postflightIndex = 0;
  const spawnImpl = (command: string, args: string[]) => {
    calls.push({ command, args });
    if (args.includes("--file")) {
      return failApply ? { status: 1, stdout: "" } : { status: 0, stdout: "" };
    }
    const sqlIndex = args.indexOf("-c") + 1;
    const sql = String(args[sqlIndex] ?? "");
    if (sql === PREFLIGHT_SQL) {
      return { status: 0, stdout: JSON.stringify(preflight) };
    }
    if (sql === POSTFLIGHT_SQL) {
      const payload = postflights[Math.min(postflightIndex, postflights.length - 1)];
      postflightIndex += 1;
      return { status: 0, stdout: JSON.stringify(payload) };
    }
    if (sql === MARKER_SQL) {
      return failMarker ? { status: 1, stdout: "" } : { status: 0, stdout: "" };
    }
    return { status: 1, stdout: "" };
  };
  return { calls, spawnImpl };
}

function runnerEnv(tempDir: string) {
  return {
    TARGET_ENV: "production",
    CONFIRM_PROJECT_REF: PRODUCTION_PROJECT_REF,
    CONFIRM_APPLY: APPLY_CONFIRMATION,
    SUPABASE_DB_URL: DATABASE_URL,
    REPORT_PATH: join(tempDir, "report.md"),
    AUDIT_PATH: join(tempDir, "audit.json"),
    PATH: process.env.PATH ?? "",
  };
}

const tempDirs: string[] = [];
function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "breeding-lane-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

function runWithFakes(options: Parameters<typeof makeFakePsql>[0]) {
  const tempDir = makeTempDir();
  const { calls, spawnImpl } = makeFakePsql(options);
  const exitCode = runPinnedBreedingReconciliation({
    env: runnerEnv(tempDir),
    spawnImpl: spawnImpl as never,
    readFile: readLfCheckoutFile as never,
    logger: { log: () => {}, error: () => {} } as never,
  });
  const report = existsSync(join(tempDir, "report.md"))
    ? readFileSync(join(tempDir, "report.md"), "utf8")
    : "";
  const audit = existsSync(join(tempDir, "audit.json"))
    ? readFileSync(join(tempDir, "audit.json"), "utf8")
    : "";
  return { exitCode, calls, report, audit };
}

describe("pinned breeding migration file", () => {
  it("matches the reviewed LF hash, byte size, and safety shape", () => {
    expect(validatedFixture.sha256).toBe(
      "D8C9D83BE772C8B2422403F1B1291AE6C9C33FCF6D7D08B7CB5F221233D96E70",
    );
    expect(Buffer.byteLength(validatedFixture.text, "utf8")).toBe(75_738);
    expect(validatedFixture.text.includes("\r")).toBe(false);
    expect(validatedFixture.text.endsWith("\n")).toBe(true);
  });

  it("owns exactly one top-level BEGIN … COMMIT pair and a post-commit NOTIFY", () => {
    expect(findBreedingUnsafeSqlReason(validatedFixture.text)).toBeNull();
    expect(validatedFixture.text).toMatch(/\nCOMMIT;\s*\nNOTIFY pgrst, 'reload schema';\s*$/);
  });

  it("pins the exact RPC body the postflight will compare against", () => {
    expect(pinnedRpcBody).toContain("uid uuid := auth.uid()");
    expect(pinnedRpcBody).toContain("invalid_event_type");
    expect(pinnedRpcBody).toContain("idempotency_key_conflict");
  });
});

describe("findBreedingUnsafeSqlReason — transaction ownership", () => {
  const OWNED = "BEGIN;\nselect 1;\nCOMMIT;\nNOTIFY pgrst, 'reload schema';\n";

  it("accepts exactly one owned BEGIN/COMMIT pair", () => {
    expect(findBreedingUnsafeSqlReason(OWNED)).toBeNull();
  });

  it("refuses a file with no transaction ownership", () => {
    expect(findBreedingUnsafeSqlReason("select 1;\n")).toBe("transaction_ownership_shape");
  });

  it("refuses a second BEGIN", () => {
    expect(findBreedingUnsafeSqlReason("BEGIN;\nselect 1;\nCOMMIT;\nBEGIN;\nCOMMIT;\n")).toBe(
      "transaction_ownership_shape",
    );
  });

  it("refuses ROLLBACK, savepoints, and prepared transactions", () => {
    expect(findBreedingUnsafeSqlReason("BEGIN;\nROLLBACK;\n")).toBe("transaction_ownership_shape");
    expect(findBreedingUnsafeSqlReason("BEGIN;\nSAVEPOINT a;\nCOMMIT;\n")).toBe(
      "transaction_ownership_shape",
    );
    expect(findBreedingUnsafeSqlReason("BEGIN;\nselect 1;\nPREPARE TRANSACTION 'x';\n")).toBe(
      "transaction_ownership_shape",
    );
  });

  it("still refuses psql external input and non-transactional statements", () => {
    expect(findBreedingUnsafeSqlReason("BEGIN;\n\\i evil.sql\nCOMMIT;\n")).toBe(
      "psql_external_input",
    );
    expect(findBreedingUnsafeSqlReason("BEGIN;\nVACUUM;\nCOMMIT;\n")).toBe(
      "transaction_forbidden_statement",
    );
    expect(
      findBreedingUnsafeSqlReason("BEGIN;\nCREATE INDEX CONCURRENTLY x ON t (c);\nCOMMIT;\n"),
    ).toBe("transaction_forbidden_statement");
  });

  it("ignores plpgsql block keywords inside dollar-quoted bodies", () => {
    const body = "BEGIN;\nDO $x$ BEGIN PERFORM 1; END $x$;\nCOMMIT;\n";
    expect(findBreedingUnsafeSqlReason(body)).toBeNull();
  });
});

describe("classifyBreedingState", () => {
  it("blocks when the three-file reconciliation is not recorded", () => {
    const state = classifyBreedingState(preflightPayload({ prior: "absent" }));
    expect(state.status).toBe("blocked");
    expect(state.reason).toContain("prior_reconciliation_missing");
  });

  it("fails closed on prior-row collisions", () => {
    expect(classifyBreedingState(preflightPayload({ prior: "collision" })).status).toBe(
      "collision",
    );
  });

  it("fails closed on a breeding marker collision", () => {
    expect(classifyBreedingState(preflightPayload({ marker: "collision" })).status).toBe(
      "collision",
    );
  });

  it("verify_only when the marker is exact and the contract is present — zero writes", () => {
    const state = classifyBreedingState(
      preflightPayload({ marker: "exact", historical: "exact", contract: CONTRACT_PRESENT }),
    );
    expect(state.status).toBe("verify_only");
  });

  it("invalid when the marker exists without the contract", () => {
    const state = classifyBreedingState(
      preflightPayload({ marker: "exact", historical: "exact", contract: CONTRACT_ABSENT }),
    );
    expect(state.status).toBe("invalid");
    expect(state.reason).toBe("marker_without_contract");
  });

  it("apply for hosted drift (marker and contract absent)", () => {
    const state = classifyBreedingState(preflightPayload());
    expect(state.status).toBe("apply");
    expect(state.contractState).toBe("absent");
  });

  it("apply with complete_unrecorded for the committed-but-unrecorded rerun state", () => {
    const state = classifyBreedingState(
      preflightPayload({ historical: "exact", contract: CONTRACT_PRESENT }),
    );
    expect(state.status).toBe("apply");
    expect(state.contractState).toBe("complete_unrecorded");
  });
});

describe("runner flow", () => {
  it("apply path: file runs WITHOUT --single-transaction, marker only after postflight", () => {
    const { exitCode, calls } = runWithFakes({
      preflight: preflightPayload(),
      postflights: [postflightPayload({ markerRecorded: false }), postflightPayload()],
    });
    expect(exitCode).toBe(EXIT.OK);

    const fileCall = calls.find((call) => call.args.includes("--file"));
    expect(fileCall).toBeDefined();
    expect(fileCall?.args).not.toContain("--single-transaction");

    const order = calls.map((call) =>
      call.args.includes("--file")
        ? "apply"
        : call.args[call.args.indexOf("-c") + 1] === PREFLIGHT_SQL
          ? "preflight"
          : call.args[call.args.indexOf("-c") + 1] === MARKER_SQL
            ? "marker"
            : "postflight",
    );
    expect(order).toEqual(["preflight", "apply", "postflight", "marker", "postflight"]);
  });

  it("verify_only path performs zero writes", () => {
    const { exitCode, calls, audit } = runWithFakes({
      preflight: preflightPayload({
        marker: "exact",
        historical: "exact",
        contract: CONTRACT_PRESENT,
      }),
      postflights: [postflightPayload()],
    });
    expect(exitCode).toBe(EXIT.OK);
    expect(calls.some((call) => call.args.includes("--file"))).toBe(false);
    expect(calls.some((call) => call.args[call.args.indexOf("-c") + 1] === MARKER_SQL)).toBe(false);
    expect(audit).toContain("already_applied_verified");
  });

  it("rerun after the file committed but before the marker was recorded", () => {
    const { exitCode, calls } = runWithFakes({
      preflight: preflightPayload({ historical: "exact", contract: CONTRACT_PRESENT }),
      postflights: [postflightPayload({ markerRecorded: false }), postflightPayload()],
    });
    expect(exitCode).toBe(EXIT.OK);
    // The migration documents this state as a safe rerun input; the runner
    // re-runs the file and then records the marker exactly once.
    expect(calls.some((call) => call.args.includes("--file"))).toBe(true);
    expect(
      calls.filter((call) => call.args[call.args.indexOf("-c") + 1] === MARKER_SQL),
    ).toHaveLength(1);
  });

  it("refuses to run when the three-file reconciliation is missing", () => {
    const { exitCode, calls } = runWithFakes({
      preflight: preflightPayload({ prior: "absent" }),
      postflights: [postflightPayload()],
    });
    expect(exitCode).toBe(EXIT.LEDGER_DRIFT);
    expect(calls.some((call) => call.args.includes("--file"))).toBe(false);
  });

  it("never records the marker when the postflight contract fails", () => {
    const badPostflight = { ...postflightPayload({ markerRecorded: false }), rpc_owner: "anon" };
    const { exitCode, calls } = runWithFakes({
      preflight: preflightPayload(),
      postflights: [badPostflight],
    });
    expect(exitCode).toBe(EXIT.POSTFLIGHT_FAILED);
    expect(calls.some((call) => call.args[call.args.indexOf("-c") + 1] === MARKER_SQL)).toBe(false);
  });

  it("reports a safe re-dispatch when only the marker insert fails", () => {
    const { exitCode, report } = runWithFakes({
      preflight: preflightPayload(),
      postflights: [postflightPayload({ markerRecorded: false })],
      failMarker: true,
    });
    expect(exitCode).toBe(EXIT.MARKER_FAILED);
    expect(report).toContain("only the marker insert failed");
  });

  it("fails closed when the apply itself fails, without recording the marker", () => {
    const { exitCode, calls } = runWithFakes({
      preflight: preflightPayload(),
      postflights: [postflightPayload()],
      failApply: true,
    });
    expect(exitCode).toBe(EXIT.APPLY_FAILED);
    expect(calls.some((call) => call.args[call.args.indexOf("-c") + 1] === MARKER_SQL)).toBe(false);
  });

  it("rejects wrong confirmations before any database contact", () => {
    const tempDir = makeTempDir();
    const { calls, spawnImpl } = makeFakePsql({
      preflight: preflightPayload(),
      postflights: [postflightPayload()],
    });
    const exitCode = runPinnedBreedingReconciliation({
      env: { ...runnerEnv(tempDir), CONFIRM_APPLY: "wrong phrase" },
      spawnImpl: spawnImpl as never,
      readFile: readLfCheckoutFile as never,
      logger: { log: () => {}, error: () => {} } as never,
    });
    expect(exitCode).toBe(EXIT.INPUT_REJECTED);
    expect(calls).toHaveLength(0);
  });

  it("never leaks the database password into artifacts", () => {
    const { report, audit } = runWithFakes({
      preflight: preflightPayload(),
      postflights: [postflightPayload({ markerRecorded: false }), postflightPayload()],
    });
    expect(report).not.toContain(PASSWORD);
    expect(audit).not.toContain(PASSWORD);
  });
});

describe("runner source and workflow pins", () => {
  const runnerSource = readFileSync(SCRIPT_PATH, "utf8");
  const workflowSource = readFileSync(WORKFLOW_PATH, "utf8");

  it("never passes --single-transaction", () => {
    expect(runnerSource).not.toContain("--single-transaction");
  });

  it("pins the production project and confirmation phrase", () => {
    expect(runnerSource).toContain('PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh"');
    expect(runnerSource).toContain('"APPLY PINNED BREEDING RECONCILIATION"');
    expect(BREEDING_RPC_SIGNATURE).toContain("public.breeding_log_save_event(");
  });

  it("workflow is manual-dispatch only, branch-guarded, and environment-gated", () => {
    expect(workflowSource).toContain("workflow_dispatch:");
    expect(workflowSource).not.toMatch(/\n\s{2}(push|pull_request|schedule):/);
    expect(workflowSource).toContain("refs/heads/verdant-grow-diary");
    expect(workflowSource).toContain("environment: verdant-production");
    expect(workflowSource).toContain("group: pinned-production-migrations");
    expect(workflowSource).toContain("APPLY PINNED BREEDING RECONCILIATION");
    expect(workflowSource).toContain("knkwiiywfkbqznbxwqfh");
  });

  it("exposes the database URL only to the runner step", () => {
    const occurrences = workflowSource.match(/secrets\.SUPABASE_DB_URL/g) ?? [];
    expect(occurrences).toHaveLength(2);
    expect(workflowSource).toContain("run: node scripts/apply-pinned-breeding-reconciliation.mjs");
  });
});
