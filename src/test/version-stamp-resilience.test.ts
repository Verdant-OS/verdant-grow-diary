/**
 * Version-stamp resilience contract.
 *
 * Production publishes through Lovable, whose build sandbox was proven
 * (2026-08-05) to sometimes be a history-less snapshot: a freshly
 * `git init`-ed directory with zero commits, untracked files, and no
 * GITHUB_* env. In that environment the stamper used to emit
 * `commit: "unknown"` with no usable identity at all.
 *
 * These tests pin the resilience contract:
 *   1. tree-hash: deterministic, CRLF/LF-invariant, stamp-file-invariant.
 *   2. stamper in a simulated history-less sandbox: honest "unknown"
 *      commit, commitSource "none", treeHash identity in the version
 *      string, inherited tracked-stamp lineage labeled untrusted.
 *   3. stamper with git / with GITHUB_* env: legacy behavior unchanged,
 *      all legacy fields still present (consumer additivity).
 *   4. auto-tag-release records the treeHash → commit mapping.
 */
import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeTreeHash, isBinary, normalizeCrlf } from "../../scripts/lib/tree-hash.mjs";

const REPO_ROOT = resolve(__dirname, "../..");
const STAMPER = resolve(REPO_ROOT, "scripts/stamp-version.mjs");
const TREE_HASH_LIB = resolve(REPO_ROOT, "scripts/lib/tree-hash.mjs");
const AUTO_TAG_WORKFLOW = resolve(REPO_ROOT, ".github/workflows/auto-tag-release.yml");

const temporaryRoots: string[] = [];
afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vgd-stamp-test-"));
  temporaryRoots.push(root);
  return root;
}

/** Env with every GITHUB_* variable removed (plus optional overrides). */
function cleanEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GITHUB_")),
  );
  return { ...env, ...overrides };
}

/** Minimal buildable sandbox with the real stamper + hash lib copied in. */
function makeSandbox(): string {
  const box = makeTempRoot();
  mkdirSync(join(box, "scripts/lib"), { recursive: true });
  mkdirSync(join(box, "public"), { recursive: true });
  mkdirSync(join(box, "src/components"), { recursive: true });
  cpSync(STAMPER, join(box, "scripts/stamp-version.mjs"));
  cpSync(TREE_HASH_LIB, join(box, "scripts/lib/tree-hash.mjs"));
  writeFileSync(join(box, "package.json"), '{ "name": "sandbox", "version": "0.0.0" }\n');
  writeFileSync(join(box, "index.html"), "<html></html>\n");
  writeFileSync(join(box, "src/components/App.tsx"), "export const x = 1;\n");
  return box;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: cleanEnv({
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
    }),
  }).trim();
}

function runStamper(
  cwd: string,
  envOverrides: Record<string, string> = {},
): {
  record: Record<string, unknown>;
  stdout: string;
} {
  const stdout = execFileSync("node", ["scripts/stamp-version.mjs"], {
    cwd,
    encoding: "utf8",
    env: cleanEnv(envOverrides),
  });
  const record = JSON.parse(readFileSync(join(cwd, "public/version.json"), "utf8"));
  return { record, stdout };
}

const LEGACY_FIELDS = [
  "version",
  "packageVersion",
  "commit",
  "shortCommit",
  "ref",
  "tag",
  "commitTime",
  "buildTime",
  "dirty",
  "ciRunId",
  "ciRunUrl",
] as const;

describe("tree-hash content identity", () => {
  it("is deterministic and file-creation-order independent", async () => {
    const a = makeTempRoot();
    const b = makeTempRoot();
    for (const [root, order] of [
      [a, ["one.ts", "two.ts", "three.ts"]],
      [b, ["three.ts", "one.ts", "two.ts"]],
    ] as const) {
      mkdirSync(join(root, "src"), { recursive: true });
      for (const name of order) writeFileSync(join(root, "src", name), `// ${name}\n`);
    }
    const ha = await computeTreeHash(a);
    const hb = await computeTreeHash(b);
    expect(ha.treeHash).toBe(hb.treeHash);
    expect(ha.fileCount).toBe(3);
    expect((await computeTreeHash(a)).treeHash).toBe(ha.treeHash);
  });

  it("hashes CRLF and LF checkouts of the same content identically", async () => {
    const lf = makeTempRoot();
    const crlf = makeTempRoot();
    mkdirSync(join(lf, "src"), { recursive: true });
    mkdirSync(join(crlf, "src"), { recursive: true });
    writeFileSync(join(lf, "src/a.ts"), "line one\nline two\n");
    writeFileSync(join(crlf, "src/a.ts"), "line one\r\nline two\r\n");
    expect((await computeTreeHash(lf)).treeHash).toBe((await computeTreeHash(crlf)).treeHash);
  });

  it("normalizeCrlf drops CR only in CRLF pairs and preserves lone CR", () => {
    expect(normalizeCrlf(Buffer.from("a\r\nb"))).toEqual(Buffer.from("a\nb"));
    expect(normalizeCrlf(Buffer.from("a\rb"))).toEqual(Buffer.from("a\rb"));
    expect(normalizeCrlf(Buffer.from("a\r\r\nb"))).toEqual(Buffer.from("a\r\nb"));
    const noCr = Buffer.from("plain\n");
    expect(normalizeCrlf(noCr)).toBe(noCr);
  });

  it("ignores the generated stamp files, so stamping never moves the identity", async () => {
    const root = makeTempRoot();
    mkdirSync(join(root, "src/generated"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, "src/app.ts"), "export {};\n");
    const before = await computeTreeHash(root);
    writeFileSync(join(root, "public/version.json"), '{"any":"thing"}\n');
    writeFileSync(join(root, "src/generated/buildInfo.ts"), "export const x = 1;\n");
    const after = await computeTreeHash(root);
    expect(after.treeHash).toBe(before.treeHash);
    expect(after.fileCount).toBe(before.fileCount);
  });

  it("hashes binary files byte-exact: CRLF-vs-LF inside a binary stays distinct", async () => {
    // Regression (Codex review on #735): normalizing binaries collided
    // distinct shipped bytes. Binary = NUL in first 8000 bytes (git's rule).
    const pngIshCrlf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
      Buffer.from("data\r\nmore"),
    ]);
    const pngIshLf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
      Buffer.from("data\nmore"),
    ]);
    expect(isBinary(pngIshCrlf)).toBe(true);
    expect(isBinary(Buffer.from("plain text\r\n"))).toBe(false);

    const a = makeTempRoot();
    const b = makeTempRoot();
    mkdirSync(join(a, "public"), { recursive: true });
    mkdirSync(join(b, "public"), { recursive: true });
    writeFileSync(join(a, "public/asset.png"), pngIshCrlf);
    writeFileSync(join(b, "public/asset.png"), pngIshLf);
    expect((await computeTreeHash(a)).treeHash).not.toBe((await computeTreeHash(b)).treeHash);
  });

  it("changes when app content changes", async () => {
    const root = makeTempRoot();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "v1\n");
    const before = await computeTreeHash(root);
    writeFileSync(join(root, "src/a.ts"), "v2\n");
    const after = await computeTreeHash(root);
    expect(after.treeHash).not.toBe(before.treeHash);
  });

  it("changes when a committed Vite env file changes (inlined VITE_* values ship)", async () => {
    // Regression (Codex review on #735): env-only commits produce different
    // shipped JS and must not share a hash with their parent.
    const root = makeTempRoot();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "app\n");
    writeFileSync(join(root, ".env"), "VITE_SUPABASE_URL=https://one.example\n");
    const before = await computeTreeHash(root);
    writeFileSync(join(root, ".env"), "VITE_SUPABASE_URL=https://two.example\n");
    const after = await computeTreeHash(root);
    expect(after.treeHash).not.toBe(before.treeHash);
    expect(after.fileCount).toBe(before.fileCount);
  });
});

describe("stamper in the proven Lovable history-less sandbox", () => {
  it("emits honest unknown commit with treeHash identity and untrusted inherited lineage", () => {
    const box = makeSandbox();
    // The exact signature proven in production 2026-08-05: unborn HEAD.
    git(box, ["init", "-q"]);
    // Seed the tracked-stamp residue the repo actually carries.
    writeFileSync(
      join(box, "public/version.json"),
      JSON.stringify({
        version: "0.0.0+20260804.aaaaaaaaaaaa-dirty",
        commit: "a".repeat(40),
        shortCommit: "a".repeat(12),
        ref: "edit/edt-test",
        commitTime: "2026-08-04T16:18:29Z",
        buildTime: "2026-08-04T16:18:37.663Z",
      }) + "\n",
    );

    const { record } = runStamper(box);
    expect(record.commit).toBe("unknown");
    expect(record.shortCommit).toBe("unknown");
    expect(record.commitSource).toBe("none");
    expect(record.ciRunId).toBeNull();
    expect(typeof record.treeHash).toBe("string");
    expect(record.treeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.version).toMatch(/^0\.0\.0\+\d{8}\.t[0-9a-f]{12}$/);
    const inherited = record.inherited as Record<string, unknown>;
    expect(inherited).not.toBeNull();
    expect(inherited.trusted).toBe(false);
    expect(inherited.source).toBe("tracked-stamp");
    expect(inherited.commit).toBe("a".repeat(40));
    // Never fabricate: the top-level commit must NOT adopt the inherited SHA.
    expect(record.commit).not.toBe(inherited.commit);
  });

  it("omits inherited lineage when no tracked stamp exists, and still exits 0", () => {
    const box = makeSandbox();
    git(box, ["init", "-q"]);
    const { record } = runStamper(box);
    expect(record.commitSource).toBe("none");
    expect(record.inherited).toBeNull();
    expect(record.version).toMatch(/\.t[0-9a-f]{12}$/);
  });

  it("degrades without dying when hashing itself throws: warn + treeHashError, exit 0", () => {
    const box = makeSandbox();
    git(box, ["init", "-q"]);
    // Replace the copied hash module with one that always rejects — the
    // prebuild contract must hold even then.
    writeFileSync(
      join(box, "scripts/lib/tree-hash.mjs"),
      "export async function computeTreeHash() { throw new Error('boom \\u0007 disk'); }\n",
    );
    const result = execFileSync("node", ["scripts/stamp-version.mjs"], {
      cwd: box,
      encoding: "utf8",
      env: cleanEnv(),
    });
    // execFileSync throwing would have failed the test: exit 0 held.
    expect(result).toContain("Stamped version");
    const record = JSON.parse(readFileSync(join(box, "public/version.json"), "utf8"));
    expect(record.treeHash).toBeNull();
    expect(record.treeHashShort).toBeNull();
    expect(typeof record.treeHashError).toBe("string");
    expect(record.treeHashError).toContain("boom");
    // Sanitized: the control char must not survive into the record.
    expect(record.treeHashError).not.toMatch(/[^\x20-\x7e]/);
    // No git identity AND no hash: version falls back to the honest unknown.
    expect(record.version).toMatch(/\.unknown$/);
  });
});

describe("stamper with real git identity (legacy behavior preserved)", () => {
  it("keeps the legacy record shape and version format on a committed repo", () => {
    const box = makeSandbox();
    git(box, ["init", "-q"]);
    git(box, ["add", "-A"]);
    git(box, ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init"]);
    const sha = git(box, ["rev-parse", "HEAD"]);

    const { record } = runStamper(box);
    for (const field of LEGACY_FIELDS) expect(record).toHaveProperty(field);
    expect(record.commit).toBe(sha);
    expect(record.commitSource).toBe("git");
    expect(record.version).toMatch(new RegExp(`^0\\.0\\.0\\+\\d{8}\\.${sha.slice(0, 12)}`));
    expect(record.treeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.inherited).toBeNull();
  });

  it("treats a set-but-empty or malformed GITHUB_SHA as absent (forgery regression)", () => {
    // Regression: `??` alone let GITHUB_SHA="" through, stamping commit ""
    // with a lying commitSource and an identity-free version string.
    const unborn = makeSandbox();
    git(unborn, ["init", "-q"]);
    const emptyEnv = runStamper(unborn, { GITHUB_SHA: "" }).record;
    expect(emptyEnv.commit).toBe("unknown");
    expect(emptyEnv.commitSource).toBe("none");
    expect(emptyEnv.version).toMatch(/\.t[0-9a-f]{12}$/);

    const committed = makeSandbox();
    git(committed, ["init", "-q"]);
    git(committed, ["add", "-A"]);
    git(committed, [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "commit",
      "-qm",
      "init",
    ]);
    const sha = git(committed, ["rev-parse", "HEAD"]);
    const malformedEnv = runStamper(committed, { GITHUB_SHA: "nothex" }).record;
    expect(malformedEnv.commit).toBe(sha);
    expect(malformedEnv.commitSource).toBe("git");
  });

  it("rejects malformed inherited timestamps and reports healthy treeHash without error", () => {
    const box = makeSandbox();
    git(box, ["init", "-q"]);
    writeFileSync(
      join(box, "public/version.json"),
      JSON.stringify({
        commit: "c".repeat(40),
        ref: "edit/edt-x",
        commitTime: "2026-08-04T...Z",
        buildTime: "not a time",
      }) + "\n",
    );
    const { record } = runStamper(box);
    const inherited = record.inherited as Record<string, unknown>;
    expect(inherited.commitTime).toBe("unknown");
    expect(inherited.buildTime).toBe("unknown");
    expect(record.treeHashError).toBeNull();
  });

  it("prefers GITHUB_* env identity and records commitSource github-env with CI run linkage", () => {
    const box = makeSandbox();
    git(box, ["init", "-q"]);
    const envSha = "b".repeat(40);
    const { record } = runStamper(box, {
      GITHUB_SHA: envSha,
      GITHUB_REF_NAME: "verdant-grow-diary",
      GITHUB_RUN_ID: "12345",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
    });
    expect(record.commit).toBe(envSha);
    expect(record.commitSource).toBe("github-env");
    expect(record.ref).toBe("verdant-grow-diary");
    expect(record.ciRunId).toBe("12345");
    expect(record.ciRunUrl).toBe(
      "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/12345",
    );
    expect(record.inherited).toBeNull();
  });
});

describe("release-tag treeHash mapping", () => {
  it("auto-tag-release computes the treeHash and records it in the tag annotation", () => {
    const workflow = readFileSync(AUTO_TAG_WORKFLOW, "utf8");
    expect(workflow).toContain("node scripts/lib/tree-hash.mjs");
    // Annotation line and summary line both carry the mapping.
    expect(workflow).toMatch(/-m "Tree-Hash: \$\{TREE_HASH\}"/);
    expect(workflow).toMatch(/Tree-Hash: \\`\$\{TREE_HASH\}\\`/);
  });

  it("computes the hash BEFORE the pre-tagged early exit and records it on that path", () => {
    // Regression: hashing below the early exit meant pre-tagged commits got
    // no recorded mapping at all. Pin the ordering, not just presence.
    const workflow = readFileSync(AUTO_TAG_WORKFLOW, "utf8");
    const hashIdx = workflow.indexOf("node scripts/lib/tree-hash.mjs");
    const earlyExitIdx = workflow.indexOf("already tagged as");
    expect(hashIdx).toBeGreaterThan(-1);
    expect(earlyExitIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeLessThan(earlyExitIdx);
    // The early-exit block itself must write the mapping to the summary
    // before its `exit 0`.
    const exitIdx = workflow.indexOf("exit 0", earlyExitIdx);
    const earlyBlock = workflow.slice(earlyExitIdx, exitIdx);
    expect(earlyBlock).toMatch(/Tree-Hash: \\`\$\{TREE_HASH\}\\`/);
  });
});

describe("resolve-release-provenance", () => {
  const RESOLVER = resolve(REPO_ROOT, "scripts/resolve-release-provenance.mjs");

  /** Sandbox repo with one commit; resolver + hash lib copied in. */
  function makeResolverSandbox(): { box: string; headSha: string } {
    const box = makeSandbox();
    cpSync(RESOLVER, join(box, "scripts/resolve-release-provenance.mjs"));
    git(box, ["init", "-q"]);
    git(box, ["add", "-A"]);
    git(box, ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init"]);
    return { box, headSha: git(box, ["rev-parse", "HEAD"]) };
  }

  function runResolver(cwd: string, args: string[]): { out: string; status: number } {
    try {
      const out = execFileSync("node", ["scripts/resolve-release-provenance.mjs", ...args], {
        cwd,
        encoding: "utf8",
        env: cleanEnv(),
      });
      return { out, status: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; status?: number };
      return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, status: e.status ?? -1 };
    }
  }

  it("finds a hash via tag annotation, even when the message contains lines starting with 'v'", () => {
    const { box, headSha } = makeResolverSandbox();
    const fakeHash = "ab".repeat(32);
    // Regression: an annotation line beginning with "v" used to fracture the
    // block parser and crash the lookup.
    git(box, [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "tag",
      "-a",
      "v2026.01.01-testtag",
      "-m",
      "Automated release tag",
      "-m",
      "verdant deploy notes\nTree-Hash: " + fakeHash,
    ]);
    git(box, [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "tag",
      "-a",
      "v2026.01.02-other",
      "-m",
      "no hash here",
    ]);
    const { out, status } = runResolver(box, [`--hash=${fakeHash}`]);
    expect(status).toBe(0);
    expect(out).toContain("MATCH via release-tag annotation");
    expect(out).toContain(headSha);
    expect(out).toContain("v2026.01.01-testtag");
    expect(out).not.toContain("v2026.01.02-other");
  });

  it("reports the union: tag-annotated commit AND annotation-less content twin", async () => {
    const { box, headSha } = makeResolverSandbox();
    const { treeHash } = await computeTreeHash(box);
    // Annotate the first commit with its real hash…
    git(box, [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "tag",
      "-a",
      "v2026.01.03-annotated",
      "-m",
      "tag",
      "-m",
      `Tree-Hash: ${treeHash}`,
    ]);
    // …then add a content twin: a commit changing only a file OUTSIDE the
    // hashed roots, so it shares the treeHash but carries no annotation.
    writeFileSync(join(box, "README.md"), "docs only\n");
    git(box, ["add", "-A"]);
    git(box, ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "docs"]);
    const twinSha = git(box, ["rev-parse", "HEAD"]);

    const { out, status } = runResolver(box, [`--hash=${treeHash}`, "--scan=2", "--ref=HEAD"]);
    expect(status).toBe(0);
    expect(out).toContain("MATCH via release-tag annotation");
    expect(out).toContain(headSha);
    expect(out).toContain("MATCH via recomputation");
    expect(out).toContain(twinSha);
  });

  it("falls back to recomputation and matches HEAD content", async () => {
    const { box, headSha } = makeResolverSandbox();
    // Clean checkout ⇒ working-tree hash equals the committed content's hash.
    const { treeHash } = await computeTreeHash(box);
    const { out, status } = runResolver(box, [`--hash=${treeHash}`, "--scan=1", "--ref=HEAD"]);
    expect(status).toBe(0);
    expect(out).toContain("MATCH via recomputation");
    expect(out).toContain(headSha);
  });

  it("reports NO_MATCH with the canary hint and exits 1 for an unknown hash", () => {
    const { box } = makeResolverSandbox();
    const { out, status } = runResolver(box, [
      `--hash=${"f".repeat(64)}`,
      "--scan=1",
      "--ref=HEAD",
    ]);
    expect(status).toBe(1);
    expect(out).toContain("NO_MATCH");
    expect(out).toContain("Canary");
  });

  it("rejects a malformed hash with exit 2 and no git activity", () => {
    const { box } = makeResolverSandbox();
    const { out, status } = runResolver(box, ["--hash=nothex"]);
    expect(status).toBe(2);
    expect(out).toContain("BLOCKED");
  });
});
