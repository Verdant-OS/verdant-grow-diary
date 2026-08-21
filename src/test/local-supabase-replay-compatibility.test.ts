import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = resolve("scripts/prepare-local-supabase-replay.mjs");
const REAL_MANIFEST = resolve("config/local-supabase-replay-compatibility.json");
const SECURITY_DB_WORKFLOW = resolve(".github/workflows/security-db-local.yml");
const IRRIGATION_EVIDENCE_WORKFLOW = resolve(".github/workflows/irrigation-evidence-gate.yml");
const IRRIGATION_PGTAP_WORKFLOW = resolve(".github/workflows/irrigation-pgtap-rls-gate.yml");
const LOCAL_SEED = resolve("supabase/seed.sql");
const ACTION_QUEUE_ACL_MIGRATION =
  "supabase/migrations/20260820235900_action_queue_table_acl_forward_repair.sql";
const ACTION_QUEUE_ACL_MIGRATION_SHA256 =
  "25867036eccb978aa73b3a6268de20d46cab74cc818ee8ef33fbe7f072ceaf1e";
const temporaryRoots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "verdant-supabase-replay-test-"));
  temporaryRoots.push(root);
  return root;
}

function writeFixture() {
  const container = makeTemporaryRoot();
  const sourceRoot = join(container, "source");
  const migrations = join(sourceRoot, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  writeFileSync(join(sourceRoot, "supabase", "config.toml"), 'project_id = "test"\n');
  writeFileSync(join(sourceRoot, "supabase", "seed.sql"), "SELECT 1;\n");

  const canonicalName = "20260721103000_canonical.sql";
  const duplicateName = "20260721182752_duplicate.sql";
  const canonicalSql = "CREATE TABLE public.fixture (id uuid PRIMARY KEY);\n";
  const duplicateSql = "CREATE TABLE public.fixture (id uuid PRIMARY KEY);\n";
  writeFileSync(join(migrations, canonicalName), canonicalSql);
  writeFileSync(join(migrations, duplicateName), duplicateSql);

  const manifestPath = join(container, "compatibility.json");
  const manifest = {
    version: 1,
    hash_normalization: "utf8_lf",
    compatibility_noops: [
      {
        canonical_path: `supabase/migrations/${canonicalName}`,
        canonical_sha256: sha256(canonicalSql),
        duplicate_path: `supabase/migrations/${duplicateName}`,
        duplicate_sha256: sha256(duplicateSql),
        reason:
          "Hosted history records the canonical fixture and omits this later duplicate fixture.",
      },
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    container,
    sourceRoot,
    manifestPath,
    canonicalName,
    duplicateName,
    canonicalSql,
    duplicateSql,
  };
}

function addInjectionFixture(fixture: ReturnType<typeof writeFixture>) {
  const templatePath = join(
    fixture.sourceRoot,
    "config",
    "local-supabase-replay",
    "fixture-baseline.sql",
  );
  const templateSql = "GRANT SELECT ON TABLE public.fixture TO authenticated;\n";
  mkdirSync(join(fixture.sourceRoot, "config", "local-supabase-replay"), {
    recursive: true,
  });
  writeFileSync(templatePath, templateSql);

  const requiredName = "20260721190000_required.sql";
  writeFileSync(join(fixture.sourceRoot, "supabase", "migrations", requiredName), "SELECT 1;\n");

  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8")) as {
    compatibility_injections?: Array<Record<string, string>>;
  };
  manifest.compatibility_injections = [
    {
      template_path: "config/local-supabase-replay/fixture-baseline.sql",
      template_sha256: sha256(templateSql),
      output_path: "supabase/migrations/20260721189999_local_replay_fixture_baseline.sql",
      required_before_path: `supabase/migrations/${requiredName}`,
      reason: "Fixture establishes a required local replay privilege baseline.",
    },
  ];
  writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    templatePath,
    templateSql,
    outputName: "20260721189999_local_replay_fixture_baseline.sql",
  };
}

function addPatchFixture(fixture: ReturnType<typeof writeFixture>) {
  const sourceName = "20260721150000_patch.sql";
  const sourceSql = "SELECT 'before';\n";
  const patchedSql = "SELECT 'after';\n";
  writeFileSync(join(fixture.sourceRoot, "supabase", "migrations", sourceName), sourceSql);

  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8")) as {
    compatibility_patches?: Array<Record<string, unknown>>;
  };
  manifest.compatibility_patches = [
    {
      source_path: `supabase/migrations/${sourceName}`,
      source_sha256: sha256(sourceSql),
      patched_sha256: sha256(patchedSql),
      replacements: [{ from: "'before'", to: "'after'" }],
      reason: "Fixture repairs one exact statement only in disposable replay.",
    },
  ];
  writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { sourceName, sourceSql, patchedSql };
}

function runScript(args: string[]) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("local Supabase replay compatibility workspace", () => {
  it("prepares the disposable replay workspace before starting local Supabase", () => {
    const workflow = readFileSync(SECURITY_DB_WORKFLOW, "utf8");
    const prepareIndex = workflow.indexOf("Prepare immutable migration replay workspace");
    const startIndex = workflow.indexOf("Start local Supabase");

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(prepareIndex);
    expect(workflow).toContain("node scripts/prepare-local-supabase-replay.mjs");
    expect(workflow).toContain('REPLAY_WORKDIR="${RUNNER_TEMP}/verdant-supabase-replay"');
  });

  it("keeps security-db-local job failures visible in the run conclusion", () => {
    // continue-on-error once rewrote a failing job into a run-level "success"
    // and masked a base red for a full day (run 30940375065). The lane stays
    // optional via branch protection (not-required), never via masking.
    const workflow = readFileSync(SECURITY_DB_WORKFLOW, "utf8");
    // Strip YAML comments (a `#` at line start or after whitespace), then
    // reject the token anywhere in what remains. Every valid key spelling —
    // plain, quoted, or inside a flow mapping — must contain this token in
    // non-comment text, so none can slip past while comments stay legal.
    const uncommented = workflow
      .split(/\r?\n/)
      .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
      .join("\n");
    expect(uncommented).not.toContain("continue-on-error");
  });

  it("runs every local Supabase lifecycle command against the disposable workdir", () => {
    const workflow = readFileSync(SECURITY_DB_WORKFLOW, "utf8");
    const lifecycleCommands = workflow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => !line.startsWith("#") && /\bsupabase (start|status|db reset|stop)\b/.test(line),
      );

    expect(lifecycleCommands).toHaveLength(4);
    expect(lifecycleCommands).toEqual([
      'supabase start --workdir "$SUPABASE_REPLAY_WORKDIR" 2>&1 | tee supabase-start.log',
      'STATUS_JSON="$(supabase status --workdir "$SUPABASE_REPLAY_WORKDIR" -o json)"',
      'supabase db reset --workdir "$SUPABASE_REPLAY_WORKDIR" 2>&1 | tee supabase-db-reset.log',
      'run: supabase stop --workdir "$SUPABASE_REPLAY_WORKDIR" --no-backup || true',
    ]);
  });

  it("routes the irrigation runtime gate through the same disposable replay workdir", () => {
    const workflow = readFileSync(IRRIGATION_EVIDENCE_WORKFLOW, "utf8");
    const prepareIndex = workflow.indexOf("Prepare immutable migration replay workspace");
    const startIndex = workflow.indexOf("Start disposable local Supabase");
    const lifecycleCommands = workflow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => !line.startsWith("#") && /\bsupabase (start|status|db reset|stop)\b/.test(line),
      );

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(prepareIndex);
    expect(workflow).toContain("node scripts/prepare-local-supabase-replay.mjs");
    expect(lifecycleCommands).toHaveLength(4);
    for (const command of lifecycleCommands) {
      expect(command).toContain('--workdir "$SUPABASE_REPLAY_WORKDIR"');
    }
    expect(workflow).not.toMatch(/\bsupabase\s+(link|db push)\b/);
  });

  it("routes irrigation pgTAP through replay without publishing startup credentials", () => {
    const workflow = readFileSync(IRRIGATION_PGTAP_WORKFLOW, "utf8");
    const prepareIndex = workflow.indexOf("Prepare immutable migration replay workspace");
    const startIndex = workflow.indexOf("Start local Supabase (disposable, loopback only)");
    const lifecycleCommands = workflow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => !line.startsWith("#") && /\bsupabase (start|status|db reset|stop)\b/.test(line),
      );

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(prepareIndex);
    expect(workflow).toContain("node scripts/prepare-local-supabase-replay.mjs");
    expect(lifecycleCommands).toHaveLength(4);
    for (const command of lifecycleCommands) {
      expect(command).toContain('--workdir "$SUPABASE_REPLAY_WORKDIR"');
    }
    expect(workflow).toContain('>"${RUNNER_TEMP}/irrigation-pgtap-supabase-start.log" 2>&1');
    expect(workflow).toContain("process.stdout.write(new URL(process.argv[1]).hostname)");
    expect(workflow).not.toContain("awk -F'[@:/]'");
    const artifactBlock = workflow.slice(workflow.indexOf("name: irrigation-pgtap-rls-gate-logs"));
    expect(artifactBlock).not.toContain("irrigation-pgtap-supabase-start.log");
    expect(workflow).not.toMatch(/\bsupabase\s+(link|db push)\b/);
  });

  it("reapplies the irrigation browser-write deny boundary after blanket local grants", () => {
    const seed = readFileSync(LOCAL_SEED, "utf8");

    expect(seed).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE");
    expect(seed).toContain("public.grow_events");
    expect(seed).toContain("public.watering_events");
    expect(seed).toContain("public.feeding_events");
    expect(seed).toContain("FROM PUBLIC, anon, authenticated");
    expect(seed).toContain("TO authenticated");
    expect(seed).toContain("TO service_role");
  });

  it("verifies the real immutable compatibility manifest without writing", () => {
    const result = runScript([`--manifest=${REAL_MANIFEST}`, "--verify-only", "--json"]);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim()) as {
      mode: string;
      compatibility_entry_count: number;
      compatibility_patch_count: number;
      compatibility_injection_count: number;
      source_migrations_unchanged: boolean;
    };
    expect(report).toMatchObject({
      mode: "verify_only",
      compatibility_entry_count: 18,
      compatibility_patch_count: 4,
      compatibility_injection_count: 2,
      source_migrations_unchanged: true,
    });
  });

  it("pins the immutable default-privilege replay repair to global and schema revokes", () => {
    const manifest = JSON.parse(readFileSync(REAL_MANIFEST, "utf8")) as {
      compatibility_patches: Array<{
        source_path: string;
        source_sha256: string;
        patched_sha256: string;
        replacements: Array<{ from: string; to: string }>;
      }>;
    };
    const patch = manifest.compatibility_patches.find((entry) =>
      entry.source_path.endsWith("20260805090000_security_advisor_hardening_followup.sql"),
    );

    expect(patch).toBeDefined();
    expect(patch?.source_sha256).toBe(
      "13d85bde5a60f2df9d5f62e72a61b91b0073f615d2d9e8b4da8e5ef57dbd40ff",
    );
    expect(patch?.patched_sha256).toBe(
      "ac5f665bd97d318cc25b5ee7fd3a50be5d48aca8e1c28b360733bae7d7da31e4",
    );
    expect(patch?.replacements).toHaveLength(1);
    expect(patch?.replacements[0]?.from).toContain(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS",
    );
    expect(patch?.replacements[0]?.to).toContain(
      "ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon",
    );
    expect(patch?.replacements[0]?.to).toContain(
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON FUNCTIONS",
    );
  });

  it("injects an exact Action Queue browser ACL baseline immediately before the immutable repair", () => {
    const output = join(makeTemporaryRoot(), "replay");
    const sourceMigration = readFileSync(resolve(ACTION_QUEUE_ACL_MIGRATION), "utf8");
    const result = runScript([`--manifest=${REAL_MANIFEST}`, `--output=${output}`, "--json"]);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim()) as {
      injections: Array<{
        template_path: string;
        output_path: string;
        required_before_path: string;
      }>;
    };
    const injection = report.injections.find(
      (entry) => entry.required_before_path === ACTION_QUEUE_ACL_MIGRATION,
    );

    expect(injection).toMatchObject({
      template_path: "config/local-supabase-replay/action-queue-acl-baseline.sql",
      output_path: "supabase/migrations/20260820235859_local_replay_action_queue_acl_baseline.sql",
      required_before_path: ACTION_QUEUE_ACL_MIGRATION,
    });

    const replayMigrations = readdirSync(join(output, "supabase", "migrations")).sort();
    const baselineName = injection?.output_path.split("/").at(-1) ?? "";
    const repairName = ACTION_QUEUE_ACL_MIGRATION.split("/").at(-1) ?? "";
    expect(replayMigrations.indexOf(repairName) - replayMigrations.indexOf(baselineName)).toBe(1);

    const baselineSql = readFileSync(resolve(output, injection?.output_path ?? "missing"), "utf8");
    expect(baselineSql).toContain("action_queue_local_replay_acl_baseline_drift");
    expect(baselineSql).toContain("v_local_replay_acl_state");
    expect(baselineSql).toContain("v_canonical_acl_state");
    expect(baselineSql).toContain("v_public_acl_count <> 0");
    expect(baselineSql).toContain("v_client_column_acl_count <> 0");
    expect(baselineSql).toContain("v_client_grant_option_count <> 0");
    expect(baselineSql).toContain("'action_queue|anon|MAINTAIN|f'");
    expect(baselineSql).toContain("'action_queue_events|anon|TRUNCATE|f'");
    expect(baselineSql).not.toContain("'action_queue|anon|SELECT|f'");
    expect(baselineSql).not.toContain("'action_queue_events|anon|INSERT|f'");
    expect(baselineSql).toContain("REVOKE ALL PRIVILEGES ON TABLE");
    expect(baselineSql).toContain("FROM PUBLIC, anon, authenticated");
    expect(baselineSql).toContain("GRANT SELECT, INSERT ON TABLE");
    expect(baselineSql).toContain("TO authenticated");
    expect(baselineSql).not.toContain("service_role");
    expect(baselineSql).not.toContain("sandbox_exec");

    expect(sha256(sourceMigration)).toBe(ACTION_QUEUE_ACL_MIGRATION_SHA256);
    expect(sha256(readFileSync(resolve(output, ACTION_QUEUE_ACL_MIGRATION), "utf8"))).toBe(
      ACTION_QUEUE_ACL_MIGRATION_SHA256,
    );
  });

  it("copies the Supabase project and no-ops only the fingerprinted duplicate", () => {
    const fixture = writeFixture();
    const output = join(fixture.container, "replay");
    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      `--output=${output}`,
      "--json",
    ]);

    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "supabase", "config.toml"), "utf8")).toContain(
      'project_id = "test"',
    );
    expect(
      readFileSync(join(output, "supabase", "migrations", fixture.canonicalName), "utf8"),
    ).toBe(fixture.canonicalSql);
    const replayDuplicate = readFileSync(
      join(output, "supabase", "migrations", fixture.duplicateName),
      "utf8",
    );
    expect(replayDuplicate).toContain("Disposable local-replay compatibility shim");
    expect(replayDuplicate).toContain("SELECT 1;");
    expect(readFileSync(join(output, "supabase", "seed.sql"), "utf8")).toBe("SELECT 1;\n");
    expect(existsSync(join(output, "local-supabase-replay-report.json"))).toBe(true);

    // Source files remain immutable.
    expect(
      readFileSync(
        join(fixture.sourceRoot, "supabase", "migrations", fixture.duplicateName),
        "utf8",
      ),
    ).toBe(fixture.duplicateSql);
  });

  it("patches exact fingerprinted text only in the disposable workspace", () => {
    const fixture = writeFixture();
    const patch = addPatchFixture(fixture);
    const output = join(fixture.container, "replay");
    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      `--output=${output}`,
      "--json",
    ]);

    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "supabase", "migrations", patch.sourceName), "utf8")).toBe(
      patch.patchedSql,
    );
    expect(
      readFileSync(join(fixture.sourceRoot, "supabase", "migrations", patch.sourceName), "utf8"),
    ).toBe(patch.sourceSql);
  });

  it("fails closed when a patch replacement is not an exact single match", () => {
    const fixture = writeFixture();
    addPatchFixture(fixture);
    const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8")) as {
      compatibility_patches: Array<{
        replacements: Array<{ from: string }>;
      }>;
    };
    manifest.compatibility_patches[0].replacements[0].from = "'missing'";
    writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] patch_mismatch");
    expect(result.stderr).toContain("found 0");
  });

  it("injects a fingerprinted precondition only into the disposable workspace", () => {
    const fixture = writeFixture();
    const injection = addInjectionFixture(fixture);
    const output = join(fixture.container, "replay");
    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      `--output=${output}`,
      "--json",
    ]);

    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "supabase", "migrations", injection.outputName), "utf8")).toBe(
      injection.templateSql,
    );
    expect(
      existsSync(join(fixture.sourceRoot, "supabase", "migrations", injection.outputName)),
    ).toBe(false);
  });

  it("fails closed when a compatibility injection fingerprint changes", () => {
    const fixture = writeFixture();
    const injection = addInjectionFixture(fixture);
    writeFileSync(injection.templatePath, `${injection.templateSql}SELECT 2;\n`);

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] hash_mismatch");
    expect(result.stderr).toContain("config/local-supabase-replay/fixture-baseline.sql");
  });

  it("produces a deterministic report with no timestamps or output paths", () => {
    const fixture = writeFixture();
    const first = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
      "--json",
    ]);
    const second = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
      "--json",
    ]);

    expect(first.status).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(first.stdout).not.toContain(fixture.container);
    expect(first.stdout).not.toMatch(/generated_at|timestamp/i);
  });

  it("treats CRLF and LF checkout line endings as the same SQL fingerprint", () => {
    const fixture = writeFixture();
    writeFileSync(
      join(fixture.sourceRoot, "supabase", "migrations", fixture.canonicalName),
      fixture.canonicalSql.replace(/\n/g, "\r\n"),
    );
    writeFileSync(
      join(fixture.sourceRoot, "supabase", "migrations", fixture.duplicateName),
      fixture.duplicateSql.replace(/\n/g, "\r\n"),
    );

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(0);
  });

  it("fails closed when a canonical fingerprint changes", () => {
    const fixture = writeFixture();
    writeFileSync(
      join(fixture.sourceRoot, "supabase", "migrations", fixture.canonicalName),
      `${fixture.canonicalSql}SELECT 2;\n`,
    );

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] hash_mismatch");
    expect(result.stderr).not.toContain(fixture.canonicalSql.trim());
  });

  it("fails closed when a duplicate fingerprint changes", () => {
    const fixture = writeFixture();
    writeFileSync(
      join(fixture.sourceRoot, "supabase", "migrations", fixture.duplicateName),
      `${fixture.duplicateSql}SELECT 2;\n`,
    );

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] hash_mismatch");
  });

  it("rejects manifest paths that escape the migrations directory", () => {
    const fixture = writeFixture();
    const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8")) as {
      compatibility_noops: Array<{ duplicate_path: string }>;
    };
    manifest.compatibility_noops[0].duplicate_path = "supabase/migrations/../seed.sql";
    writeFileSync(fixture.manifestPath, JSON.stringify(manifest));

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      "--verify-only",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] invalid_manifest");
  });

  it("rejects an output directory inside the source repository", () => {
    const fixture = writeFixture();
    const output = join(fixture.sourceRoot, "generated-replay");
    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      `--output=${output}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] unsafe_output");
    expect(existsSync(output)).toBe(false);
  });

  it("rejects an existing output directory instead of reusing stale files", () => {
    const fixture = writeFixture();
    const output = join(fixture.container, "existing-replay");
    mkdirSync(output);

    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
      `--output=${output}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] output_exists");
  });

  it("requires an output directory for preparation mode", () => {
    const fixture = writeFixture();
    const result = runScript([
      `--source=${fixture.sourceRoot}`,
      `--manifest=${fixture.manifestPath}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[supabase-replay] missing_output");
  });
});
