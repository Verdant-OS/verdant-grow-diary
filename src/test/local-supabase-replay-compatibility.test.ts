import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = resolve("scripts/prepare-local-supabase-replay.mjs");
const REAL_MANIFEST = resolve("config/local-supabase-replay-compatibility.json");
const SECURITY_DB_WORKFLOW = resolve(".github/workflows/security-db-local.yml");
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

  it("runs every local Supabase lifecycle command against the disposable workdir", () => {
    const workflow = readFileSync(SECURITY_DB_WORKFLOW, "utf8");
    const lifecycleCommands = workflow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /\bsupabase (start|status|db reset|stop)\b/.test(line));

    expect(lifecycleCommands).toHaveLength(4);
    expect(lifecycleCommands).toEqual([
      'supabase start --workdir "$SUPABASE_REPLAY_WORKDIR" 2>&1 | tee supabase-start.log',
      'STATUS_JSON="$(supabase status --workdir "$SUPABASE_REPLAY_WORKDIR" -o json)"',
      'supabase db reset --workdir "$SUPABASE_REPLAY_WORKDIR" 2>&1 | tee supabase-db-reset.log',
      'run: supabase stop --workdir "$SUPABASE_REPLAY_WORKDIR" --no-backup || true',
    ]);
  });

  it("verifies the real immutable compatibility manifest without writing", () => {
    const result = runScript([`--manifest=${REAL_MANIFEST}`, "--verify-only", "--json"]);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim()) as {
      mode: string;
      compatibility_entry_count: number;
      source_migrations_unchanged: boolean;
    };
    expect(report).toMatchObject({
      mode: "verify_only",
      compatibility_entry_count: 3,
      source_migrations_unchanged: true,
    });
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
