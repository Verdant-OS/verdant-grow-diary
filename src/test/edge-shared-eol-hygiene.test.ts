/**
 * Windows checkout hygiene for the generated Edge shared-library mirror.
 *
 * Sources may be CRLF under core.autocrlf, but generated mirror artifacts
 * are canonical LF. This sandbox models the release-hygiene attributes and
 * pins both comparison behavior and the normal write-mode generator path.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC = join(REPO_ROOT, "scripts/sync-edge-shared.mjs");
const VERIFY = join(REPO_ROOT, "scripts/verify-edge-shared-in-sync.mjs");
const STAMPER = join(REPO_ROOT, "scripts/stamp-version.mjs");
const TREE_HASH = join(REPO_ROOT, "scripts/lib/tree-hash.mjs");
const WINDOWS_FIXTURE_ATTRIBUTES = [
  "# Fixture mirrors the generated-artifact rules from release hygiene.",
  "supabase/functions/_shared/lib/** text eol=lf",
  "src/routeTree.gen.ts text eol=lf",
  "",
].join("\n");

const temporaryRoots: string[] = [];
afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vgd-edge-eol-"));
  temporaryRoots.push(root);
  return root;
}

function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GITHUB_")),
  );
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...cleanEnv(),
      GIT_AUTHOR_NAME: "Verdant test",
      GIT_AUTHOR_EMAIL: "verdant-test@example.invalid",
      GIT_COMMITTER_NAME: "Verdant test",
      GIT_COMMITTER_EMAIL: "verdant-test@example.invalid",
    },
  }).trim();
}

function runNode(cwd: string, script: string, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnv(),
  });
}

function expectSuccess(result: ReturnType<typeof runNode>): void {
  expect(result.error?.message ?? result.stderr ?? result.stdout).toBeFalsy();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function writeFile(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function makeWindowsStyleCheckout(): string {
  const seed = makeTempRoot();
  mkdirSync(join(seed, "scripts/lib"), { recursive: true });
  writeFile(seed, ".gitattributes", WINDOWS_FIXTURE_ATTRIBUTES);
  cpSync(SYNC, join(seed, "scripts/sync-edge-shared.mjs"));
  cpSync(VERIFY, join(seed, "scripts/verify-edge-shared-in-sync.mjs"));
  cpSync(STAMPER, join(seed, "scripts/stamp-version.mjs"));
  cpSync(TREE_HASH, join(seed, "scripts/lib/tree-hash.mjs"));

  writeFile(seed, "package.json", '{ "name": "edge-eol-sandbox", "version": "0.0.0" }\n');
  writeFile(seed, "index.html", "<html></html>\n");
  writeFile(seed, "src/routeTree.gen.ts", "export const routeTree = {};\n");
  writeFile(seed, "src/lib/edgeShared.ts", 'export const edgeShared = "ok";\n');
  writeFile(
    seed,
    "supabase/functions/demo/index.ts",
    'import { edgeShared } from "@/lib/edgeShared";\nexport { edgeShared };\n',
  );

  expectSuccess(runNode(seed, "scripts/sync-edge-shared.mjs"));
  writeFile(seed, "public/version.json", '{ "tracked": "before-stamp" }\n');
  writeFile(seed, "src/generated/buildInfo.ts", "export const beforeStamp = true;\n");

  git(seed, ["init", "-q"]);
  git(seed, ["add", "-A"]);
  git(seed, ["commit", "-qm", "seed"]);

  const windowsCheckout = makeTempRoot();
  git(seed, ["clone", "--quiet", seed, windowsCheckout]);
  git(windowsCheckout, ["config", "core.autocrlf", "true"]);

  // Force Git to re-materialize tracked text using the Windows checkout rule.
  for (const relativePath of git(windowsCheckout, ["ls-files", "-z"]).split("\0").filter(Boolean)) {
    rmSync(join(windowsCheckout, relativePath), { force: true });
  }
  git(windowsCheckout, ["checkout", "--", "."]);
  return windowsCheckout;
}

describe("Edge shared mirror Windows EOL hygiene", () => {
  it("pins generated mirror artifacts to LF even when source files are checked out as CRLF", () => {
    const checkout = makeWindowsStyleCheckout();
    const source = readFileSync(join(checkout, "src/lib/edgeShared.ts"), "utf8");
    const mirrorPath = "supabase/functions/_shared/lib/lib/edgeShared.ts";
    const mirror = readFileSync(join(checkout, mirrorPath), "utf8");
    const routeTreePath = "src/routeTree.gen.ts";
    const routeTree = readFileSync(join(checkout, routeTreePath), "utf8");

    expect(source).toContain("\r\n");
    expect(mirror).not.toContain("\r\n");
    expect(routeTree).not.toContain("\r\n");
    expect(git(checkout, ["check-attr", "eol", "--", mirrorPath])).toBe(`${mirrorPath}: eol: lf`);
    expect(git(checkout, ["check-attr", "eol", "--", routeTreePath])).toBe(
      `${routeTreePath}: eol: lf`,
    );
  });

  it("does not report false drift or taint the stamp in a Windows-style checkout", () => {
    const checkout = makeWindowsStyleCheckout();

    expectSuccess(runNode(checkout, "scripts/sync-edge-shared.mjs", ["--check"]));
    const dryRun = runNode(checkout, "scripts/sync-edge-shared.mjs", ["--dry-run"]);
    expectSuccess(dryRun);
    expect(dryRun.stdout).toMatch(/update:\s+0/);
    expectSuccess(runNode(checkout, "scripts/verify-edge-shared-in-sync.mjs", ["--check-only"]));

    const stamped = runNode(checkout, "scripts/stamp-version.mjs");
    expectSuccess(stamped);
    const record = JSON.parse(readFileSync(join(checkout, "public/version.json"), "utf8"));
    expect(record.dirty).toBe(false);
    expect(git(checkout, ["status", "--porcelain"])).toMatchInlineSnapshot(`
      "M public/version.json
       M src/generated/buildInfo.ts"
    `);
  });

  it("writes canonical LF mirror content from CRLF source material", () => {
    const checkout = makeWindowsStyleCheckout();
    const sourcePath = join(checkout, "src/lib/edgeShared.ts");
    const mirrorPath = join(checkout, "supabase/functions/_shared/lib/lib/edgeShared.ts");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("\r\n");
    writeFileSync(sourcePath, `${source}export const writeMode = "regenerated";\r\n`);

    expectSuccess(runNode(checkout, "scripts/sync-edge-shared.mjs"));
    const regenerated = readFileSync(mirrorPath, "utf8");
    expect(regenerated).toContain('export const writeMode = "regenerated";\n');
    expect(regenerated).not.toContain("\r\n");
    expectSuccess(runNode(checkout, "scripts/sync-edge-shared.mjs", ["--check"]));
  });

  it("continues to report a real mirror-content mutation in a Windows-style checkout", () => {
    const checkout = makeWindowsStyleCheckout();
    const mirrorPath = join(checkout, "supabase/functions/_shared/lib/lib/edgeShared.ts");
    writeFileSync(mirrorPath, readFileSync(mirrorPath, "utf8") + "// real drift\n");

    const dryRun = runNode(checkout, "scripts/sync-edge-shared.mjs", ["--dry-run"]);
    expectSuccess(dryRun);
    expect(dryRun.stdout).toMatch(/update:\s+1/);

    const check = runNode(checkout, "scripts/sync-edge-shared.mjs", ["--check"]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("DRIFT:");
    expect(check.stderr).toContain("differs from generator output");
  });
});
