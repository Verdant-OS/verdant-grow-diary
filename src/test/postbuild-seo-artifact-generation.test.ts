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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ogImageSlugForPath } from "@/lib/build/ogImageCard";

const repoRoot = resolve(__dirname, "../..");
const generator = join(repoRoot, "scripts/generate-seo-artifacts.ts");
const assertScript = join(repoRoot, "scripts/assert-seo-manifest-present.mjs");
const headSnapshotScript = join(repoRoot, "scripts/assert-ssr-head-snapshots-present.mjs");

type HeadSnapshotGateResult = {
  ok: boolean;
  checked: number;
  problems: string[];
  total?: number;
};

function importHeadSnapshotGate(): Promise<{
  validateHeadSnapshots: (distDir: string) => HeadSnapshotGateResult;
}> {
  return import("../../scripts/assert-ssr-head-snapshots-present.mjs") as Promise<{
    validateHeadSnapshots: (distDir: string) => HeadSnapshotGateResult;
  }>;
}

type ManifestDocument = {
  path: string;
  fileName: string;
  metadata: {
    title: string;
    description: string;
    url: string;
    image?: string;
    imageAlt?: string;
    robots?: string;
  };
};

type ManifestShape = {
  origin: string;
  documents: ManifestDocument[];
};

let distDir = "";
let generatorOutput = "";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readManifest(): ManifestShape {
  return JSON.parse(readFileSync(join(distDir, "seo-manifest.json"), "utf8")) as ManifestShape;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Minimal SSR-shaped head snapshot for one manifest document. */
function renderHeadSnapshot(document: ManifestDocument): string {
  const { title, description, url, image = "", imageAlt = "" } = document.metadata;
  const metas: Array<[string, string, string]> = [
    ["name", "description", description],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:alt", imageAlt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
  ];
  const metaTags = metas
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`)
    .join("\n    ");
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(url)}" />
    ${metaTags}
  </head>
  <body></body>
</html>
`;
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

    for (const document of manifest.documents) {
      expect(document.path?.length ?? 0).toBeGreaterThan(0);
      expect(document.fileName?.length ?? 0).toBeGreaterThan(0);
      expect(document.metadata?.title?.length ?? 0).toBeGreaterThan(0);
      expect(document.metadata?.description?.length ?? 0).toBeGreaterThan(0);

      const canonical = document.metadata?.url;
      expect(typeof canonical).toBe("string");
      expect(canonical.trim()).not.toBe("");
      expect(new URL(canonical).origin).toBe(origin);
    }
  });

  it("writes non-empty OG cards, including the homepage card", () => {
    const homeCard = join(distDir, "client/og/home.png");
    expect(existsSync(homeCard)).toBe(true);
    expect(statSync(homeCard).size).toBeGreaterThan(0);
  });

  it("writes a non-empty OG card for every manifest document", () => {
    const manifest = readManifest();
    const missing: string[] = [];
    const empty: string[] = [];

    for (const document of manifest.documents) {
      const canonicalPath = new URL(document.metadata.url).pathname;
      const cardPath = join(distDir, "client/og", `${ogImageSlugForPath(canonicalPath)}.png`);
      if (!existsSync(cardPath)) {
        missing.push(`${document.path} -> ${cardPath}`);
        continue;
      }
      // A truncated/failed resvg render still writes a file; require real bytes.
      if (statSync(cardPath).size < 1024) empty.push(`${document.path} -> ${cardPath}`);
    }

    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });

  it("declares a relative .html output document for every manifest entry", () => {
    const manifest = readManifest();
    for (const document of manifest.documents) {
      expect(document.fileName.startsWith("/")).toBe(false);
      expect(document.fileName).toMatch(/\.html$/);
    }
    const fileNames = manifest.documents.map((document) => document.fileName);
    expect(new Set(fileNames).size).toBe(fileNames.length);
  });

  it("does not let the head-fidelity validator pass while the static route documents are absent", async () => {
    const { validateDist } = (await import(
      "../../scripts/validate-static-route-head-fidelity.mjs"
    )) as {
      validateDist: (dir: string) => {
        ok: boolean;
        issues: string[];
        report: { totals: { routes: number; missingFiles: number } } | null;
      };
    };

    const manifest = readManifest();
    const { ok, issues, report } = validateDist(distDir);

    expect(ok).toBe(false);
    expect(report?.totals.routes).toBe(manifest.documents.length);
    expect(report?.totals.missingFiles).toBe(manifest.documents.length);
    expect(issues.join("\n")).toContain("expected pre-rendered file");
  });

  it("accepts a static route document once its SSR head snapshot is present and non-empty", async () => {
    const { validateDist } = (await import(
      "../../scripts/validate-static-route-head-fidelity.mjs"
    )) as {
      validateDist: (dir: string) => {
        report: { routes: Array<{ path: string; missing?: boolean }> } | null;
      };
    };

    const manifest = readManifest();
    const target = manifest.documents[0];
    const snapshotDir = mkdtempSync(join(tmpdir(), "verdant-seo-snapshot-"));
    try {
      writeFileSync(
        join(snapshotDir, "seo-manifest.json"),
        JSON.stringify({ origin: manifest.origin, documents: [target] }),
      );
      const snapshotPath = join(snapshotDir, target.fileName);
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, renderHeadSnapshot(target));

      expect(statSync(snapshotPath).size).toBeGreaterThan(0);
      const route = validateDist(snapshotDir).report?.routes[0];
      expect(route?.path).toBe(target.path);
      expect(route?.missing).not.toBe(true);
    } finally {
      rmSync(snapshotDir, { recursive: true, force: true });
    }
  });

  it("passes the manifest precondition gate against the generated dist", () => {
    const output = run("node", [assertScript, distDir]);
    expect(output).toContain("assert-seo-manifest-present: OK");
    expect(output).toContain("non-empty absolute canonical URL");
  });

  describe("pre-rendered head snapshot gate", () => {
    /** dist with a manifest whose every document has a valid head snapshot. */
    function makeSnapshotDist(
      documents: ManifestDocument[],
      render: (document: ManifestDocument) => string | null = renderHeadSnapshot,
    ): string {
      const manifest = readManifest();
      const dir = mkdtempSync(join(tmpdir(), "verdant-seo-heads-"));
      writeFileSync(
        join(dir, "seo-manifest.json"),
        JSON.stringify({ origin: manifest.origin, documents }),
      );
      for (const document of documents) {
        const html = render(document);
        if (html === null) continue;
        const filePath = join(dir, document.fileName);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, html);
      }
      return dir;
    }

    it("accepts every manifest document when its snapshot is present, non-empty, and well-formed", () => {
      const manifest = readManifest();
      const dir = makeSnapshotDist(manifest.documents);
      try {
        const output = run("node", [headSnapshotScript, dir]);
        expect(output).toContain("assert-ssr-head-snapshots-present: OK");
        expect(output).toContain(
          `${manifest.documents.length}/${manifest.documents.length} pre-rendered head snapshot(s)`,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("reports every manifest document whose snapshot file is missing", async () => {
      const manifest = readManifest();
      const { validateHeadSnapshots } = await importHeadSnapshotGate();
      const result = validateHeadSnapshots(distDir);

      expect(result.ok).toBe(false);
      expect(result.checked).toBe(0);
      expect(result.problems).toHaveLength(manifest.documents.length);
      expect(result.problems.join("\n")).toContain("head snapshot missing at");
    });

    it("rejects an empty snapshot file", async () => {
      const manifest = readManifest();
      const target = manifest.documents[0];
      const dir = makeSnapshotDist([target], () => "");
      try {
        const { validateHeadSnapshots } = await importHeadSnapshotGate();
        const result = validateHeadSnapshots(dir);
        expect(result.ok).toBe(false);
        expect(result.problems.join("\n")).toContain("is empty (0 bytes)");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("rejects a truncated snapshot file", async () => {
      const manifest = readManifest();
      const target = manifest.documents[0];
      const dir = makeSnapshotDist([target], () => "<!doctype html><html><head>");
      try {
        const { validateHeadSnapshots } = await importHeadSnapshotGate();
        const result = validateHeadSnapshots(dir);
        expect(result.ok).toBe(false);
        expect(result.problems.join("\n")).toMatch(/byte\(s\); expected at least/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it.each([
      [
        "a snapshot with no <title>",
        (html: string) => html.replace(/<title>[\s\S]*?<\/title>/i, ""),
        "has no <title>",
      ],
      [
        "a snapshot with an empty <title>",
        (html: string) => html.replace(/<title>[\s\S]*?<\/title>/i, "<title>   </title>"),
        "<title> is empty",
      ],
      [
        "a snapshot with no meta description",
        (html: string) => html.replace(/<meta name="description"[^>]*>/i, ""),
        "has no meta description",
      ],
      [
        "a snapshot with no canonical link",
        (html: string) => html.replace(/<link rel="canonical"[^>]*>/i, ""),
        'has no <link rel="canonical">',
      ],
      [
        "a snapshot whose canonical disagrees with the manifest",
        (html: string) =>
          html.replace(/<link rel="canonical" href="[^"]*"/i, '<link rel="canonical" href="/wrong"'),
        "does not match manifest canonical",
      ],
      [
        "a snapshot that is not an HTML document",
        () => `{"note":"this is JSON, not a pre-rendered head snapshot"}`.padEnd(400, " "),
        "not an HTML document",
      ],
    ])("rejects %s", async (_label, mutate, expectedProblem) => {
      const manifest = readManifest();
      const target = manifest.documents[0];
      const dir = makeSnapshotDist([target], (document) =>
        (mutate as (html: string) => string)(renderHeadSnapshot(document)),
      );
      try {
        const { validateHeadSnapshots } = await importHeadSnapshotGate();
        const result = validateHeadSnapshots(dir);
        expect(result.ok).toBe(false);
        expect(result.problems.join("\n")).toContain(expectedProblem);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("exits non-zero from the CLI when a snapshot is missing", () => {
      expect(() => run("node", [headSnapshotScript, distDir])).toThrow();
    });
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


type OgDimensionGateResult = {
  ok: boolean;
  checked: number;
  total: number;
  problems: string[];
};

function importOgDimensionGate(): Promise<{
  validateOgCardDimensions: (distDir: string) => OgDimensionGateResult;
  readPngHeader: (buffer: Buffer) => Record<string, unknown>;
  EXPECTED_OG_WIDTH: number;
  EXPECTED_OG_HEIGHT: number;
}> {
  return import("../../scripts/assert-og-card-dimensions.mjs") as never;
}

/** Builds a syntactically valid PNG header of the given size, padded past the byte floor. */
function fakePng(width: number, height: number, bitDepth = 8): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.writeUInt8(bitDepth, 24);
  header.writeUInt8(6, 25);
  return Buffer.concat([header, Buffer.alloc(2048)]);
}

describe("generated OG cards match the expected image resolution", () => {
  it("renders every manifest OG card at exactly 1200x630", async () => {
    const { validateOgCardDimensions, EXPECTED_OG_WIDTH, EXPECTED_OG_HEIGHT } =
      await importOgDimensionGate();
    expect(EXPECTED_OG_WIDTH).toBe(1200);
    expect(EXPECTED_OG_HEIGHT).toBe(630);

    const result = validateOgCardDimensions(distDir);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(5);
    expect(result.checked).toBe(result.total);
  });

  it("reads PNG dimensions from the IHDR chunk", async () => {
    const { readPngHeader } = await importOgDimensionGate();
    expect(readPngHeader(fakePng(1200, 630))).toMatchObject({
      ok: true,
      width: 1200,
      height: 630,
      bitDepth: 8,
    });
    expect(readPngHeader(Buffer.alloc(64))).toMatchObject({ ok: false });
    expect(readPngHeader(Buffer.alloc(4))).toMatchObject({ ok: false });
  });

  it.each([
    ["a 1x1 placeholder render", fakePng(1, 1), /is 1×1; expected 1200×630/],
    ["a half-resolution render", fakePng(600, 315), /is 600×315; expected 1200×630/],
    ["a transposed render", fakePng(630, 1200), /is 630×1200; expected 1200×630/],
    ["a sub-8-bit render", fakePng(1200, 630, 4), /bit depth is 4/],
    ["a non-PNG payload", Buffer.alloc(2048, 0x20), /missing PNG signature/],
    ["a truncated render", Buffer.from("broken"), /bytes \(< 1024\)/],
  ])("fails the gate for %s", async (_label, bytes, expected) => {
    const { validateOgCardDimensions } = await importOgDimensionGate();
    const brokenDir = mkdtempSync(join(tmpdir(), "verdant-og-broken-"));
    try {
      const manifest = readManifest();
      writeFileSync(join(brokenDir, "seo-manifest.json"), JSON.stringify(manifest));
      mkdirSync(join(brokenDir, "client/og"), { recursive: true });
      for (const document of manifest.documents) {
        const slug = ogImageSlugForPath(new URL(document.metadata.url).pathname);
        writeFileSync(join(brokenDir, "client/og", `${slug}.png`), fakePng(1200, 630));
      }
      const firstSlug = ogImageSlugForPath(new URL(manifest.documents[0].metadata.url).pathname);
      writeFileSync(join(brokenDir, "client/og", `${firstSlug}.png`), bytes);

      const result = validateOgCardDimensions(brokenDir);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toMatch(expected);
    } finally {
      rmSync(brokenDir, { recursive: true, force: true });
    }
  });

  it("fails the gate when an OG card is missing entirely", async () => {
    const { validateOgCardDimensions } = await importOgDimensionGate();
    const brokenDir = mkdtempSync(join(tmpdir(), "verdant-og-missing-"));
    try {
      writeFileSync(
        join(brokenDir, "seo-manifest.json"),
        readFileSync(join(distDir, "seo-manifest.json"), "utf8"),
      );
      mkdirSync(join(brokenDir, "client/og"), { recursive: true });
      const result = validateOgCardDimensions(brokenDir);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toMatch(/OG card missing/);
    } finally {
      rmSync(brokenDir, { recursive: true, force: true });
    }
  });

  it("does not vacuously pass against an empty dist", async () => {
    const { validateOgCardDimensions } = await importOgDimensionGate();
    const emptyDir = mkdtempSync(join(tmpdir(), "verdant-og-empty-"));
    try {
      const result = validateOgCardDimensions(emptyDir);
      expect(result.ok).toBe(false);
      expect(result.checked).toBe(0);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("fails the CLI gate with a non-zero exit for a broken render", () => {
    const brokenDir = mkdtempSync(join(tmpdir(), "verdant-og-cli-"));
    try {
      const manifest = readManifest();
      writeFileSync(join(brokenDir, "seo-manifest.json"), JSON.stringify(manifest));
      mkdirSync(join(brokenDir, "client/og"), { recursive: true });
      for (const document of manifest.documents) {
        const slug = ogImageSlugForPath(new URL(document.metadata.url).pathname);
        writeFileSync(join(brokenDir, "client/og", `${slug}.png`), fakePng(600, 315));
      }

      let stderr = "";
      try {
        run("node", [join(repoRoot, "scripts/assert-og-card-dimensions.mjs"), brokenDir]);
        throw new Error("expected the OG dimension gate to fail");
      } catch (error) {
        stderr = String((error as { stderr?: string }).stderr ?? (error as Error).message);
      }
      expect(stderr).toContain("assert-og-card-dimensions: FAIL");
      expect(stderr).toContain("expected 1200×630");
    } finally {
      rmSync(brokenDir, { recursive: true, force: true });
    }
  });
});
