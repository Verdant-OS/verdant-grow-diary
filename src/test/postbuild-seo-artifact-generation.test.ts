/**
 * Postbuild SEO artifact generation — end-to-end script test.
 *
 * Runs `scripts/generate-seo-artifacts.ts` into a throwaway dist directory and
 * asserts the artifacts the fidelity validators depend on actually exist and
 * are non-empty, then asserts `scripts/assert-seo-manifest-present.mjs` passes
 * against that directory (and fails against an empty one).
 *
 * This is the regression guard for the class of build failure where validators
 * ran against a wiped dist and reported "0 documents" instead of a real error.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const generator = join(repoRoot, "scripts/generate-seo-artifacts.ts");
const assertScript = join(repoRoot, "scripts/assert-seo-manifest-present.mjs");

let distDir = "";
let generatorOutput = "";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("postbuild SEO artifact generation", () => {
  beforeAll(() => {
    distDir = mkdtempSync(join(tmpdir(), "verdant-seo-dist-"));
    generatorOutput = run("bun", [generator, distDir]);
  }, 180_000);

  afterAll(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true });
  });

  it("reports the documents and OG cards it emitted", () => {
    expect(generatorOutput).toMatch(/generate-seo-artifacts: \d+ documents, \d+ OG cards/);
  });

  it("writes a non-empty seo-manifest.json listing every static document", () => {
    const manifestPath = join(distDir, "seo-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    expect(statSync(manifestPath).size).toBeGreaterThan(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(typeof manifest.origin).toBe("string");
    expect(Array.isArray(manifest.documents)).toBe(true);
    expect(manifest.documents.length).toBeGreaterThanOrEqual(5);

    const origin = new URL(manifest.origin).origin;
    const canonicals = new Set<string>();

    for (const document of manifest.documents) {
      expect(document.path?.length ?? 0).toBeGreaterThan(0);
      expect(document.fileName?.length ?? 0).toBeGreaterThan(0);
      expect(document.metadata?.title?.length ?? 0).toBeGreaterThan(0);
      expect(document.metadata?.description?.length ?? 0).toBeGreaterThan(0);

      const canonical = document.metadata?.url;
      expect(typeof canonical).toBe("string");
      expect(canonical.trim()).not.toBe("");
      expect(new URL(canonical).origin).toBe(origin);
      expect(canonicals.has(canonical)).toBe(false);
      canonicals.add(canonical);
    }
  });

  it("writes non-empty OG cards, including the homepage card", () => {
    const homeCard = join(distDir, "client/og/home.png");
    expect(existsSync(homeCard)).toBe(true);
    expect(statSync(homeCard).size).toBeGreaterThan(0);
  });

  it("passes the manifest precondition gate against the generated dist", () => {
    const output = run("node", [assertScript, distDir]);
    expect(output).toContain("assert-seo-manifest-present: OK");
    expect(output).toContain("unique canonical URL");
  });

  it("fails the manifest precondition gate when dist has no manifest", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "verdant-seo-empty-"));
    try {
      expect(() => run("node", [assertScript, emptyDir])).toThrow();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "a document with an empty canonical URL",
      (manifest: ManifestShape) => {
        manifest.documents[0].metadata.url = "";
      },
      "missing canonical URL",
    ],
    [
      "a document with a relative canonical URL",
      (manifest: ManifestShape) => {
        manifest.documents[0].metadata.url = "/guides/bud-rot";
      },
      "not absolute",
    ],
    [
      "a canonical URL on a foreign origin",
      (manifest: ManifestShape) => {
        manifest.documents[0].metadata.url = "https://example.com/guides/bud-rot";
      },
      "does not match manifest origin",
    ],
    [
      "two documents sharing one canonical URL",
      (manifest: ManifestShape) => {
        manifest.documents[1].metadata.url = manifest.documents[0].metadata.url;
      },
      "duplicate canonical URL",
    ],
    [
      "a truncated documents list",
      (manifest: ManifestShape) => {
        manifest.documents = manifest.documents.slice(0, 1);
      },
      "at least 5 are expected",
    ],
    [
      "a document with a blank title",
      (manifest: ManifestShape) => {
        manifest.documents[0].metadata.title = "   ";
      },
      "missing head title",
    ],
  ])("fails the gate for %s", (_label, mutate, expectedMessage) => {
    const brokenDir = mkdtempSync(join(tmpdir(), "verdant-seo-broken-"));
    try {
      const manifest = JSON.parse(
        readFileSync(join(distDir, "seo-manifest.json"), "utf8"),
      ) as ManifestShape;
      mutate(manifest);
      writeFileSync(join(brokenDir, "seo-manifest.json"), JSON.stringify(manifest));

      let stderr = "";
      try {
        run("node", [assertScript, brokenDir]);
        throw new Error("expected the manifest gate to fail");
      } catch (error) {
        stderr = String((error as { stderr?: string }).stderr ?? (error as Error).message);
      }
      expect(stderr).toContain("assert-seo-manifest-present: FAIL");
      expect(stderr).toContain(expectedMessage);
    } finally {
      rmSync(brokenDir, { recursive: true, force: true });
    }
  });
});

