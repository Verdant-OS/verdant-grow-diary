import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CANONICAL_ORIGIN,
  collectHtmlFiles,
  expectedPathForFile,
  extractCanonicalLinks,
  validateCanonicalInFile,
  validateCanonicalLinks,
} from "../../scripts/validate-canonical-links.mjs";

let tmp: string;

const SHELL = (head: string) =>
  `<!doctype html><html><head>${head}</head><body></body></html>`;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "canonical-validator-"));
});
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, html: string) {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, html);
  return full;
}

describe("extractCanonicalLinks", () => {
  it("returns every canonical link with parsed href", () => {
    const links = extractCanonicalLinks(
      `<link rel="canonical" href="https://verdantgrowdiary.com/a"><link rel="canonical" href='https://verdantgrowdiary.com/b'/>`,
    );
    expect(links).toEqual([
      { tag: expect.stringContaining("/a"), href: "https://verdantgrowdiary.com/a" },
      { tag: expect.stringContaining("/b"), href: "https://verdantgrowdiary.com/b" },
    ]);
  });
  it("is case-insensitive on rel and tag name", () => {
    const links = extractCanonicalLinks(
      `<LINK REL="CANONICAL" HREF="https://verdantgrowdiary.com/x">`,
    );
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("https://verdantgrowdiary.com/x");
  });
  it("ignores non-canonical link tags", () => {
    expect(
      extractCanonicalLinks(
        `<link rel="stylesheet" href="/a.css"><link rel="preload" href="/x.png">`,
      ),
    ).toEqual([]);
  });
});

describe("expectedPathForFile", () => {
  it("maps index.html to /", () => {
    expect(expectedPathForFile("index.html")).toBe("/");
  });
  it("strips .html and prefixes /", () => {
    expect(expectedPathForFile("cultivars.html")).toBe("/cultivars");
    expect(expectedPathForFile("cultivars/oreoz.html")).toBe("/cultivars/oreoz");
  });
  it("normalizes windows separators", () => {
    expect(expectedPathForFile("guides\\vpd.html")).toBe("/guides/vpd");
  });
  it("throws on non-html", () => {
    expect(() => expectedPathForFile("robots.txt")).toThrow();
  });
});

describe("validateCanonicalInFile", () => {
  it("accepts a well-formed per-route canonical", () => {
    const file = write(
      "cultivars/oreoz.html",
      SHELL(`<link rel="canonical" href="${CANONICAL_ORIGIN}/cultivars/oreoz">`),
    );
    expect(validateCanonicalInFile({ distDir: tmp, file })).toEqual([]);
  });
  it("flags a missing canonical", () => {
    const file = write("missing.html", SHELL(""));
    const issues = validateCanonicalInFile({ distDir: tmp, file });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/missing/);
  });
  it("flags more than one canonical", () => {
    const file = write(
      "dup.html",
      SHELL(
        `<link rel="canonical" href="${CANONICAL_ORIGIN}/dup"><link rel="canonical" href="${CANONICAL_ORIGIN}/dup">`,
      ),
    );
    const [issue] = validateCanonicalInFile({ distDir: tmp, file });
    expect(issue.message).toMatch(/exactly one/);
    expect(issue.found).toHaveLength(2);
  });
  it("flags mismatched href", () => {
    const file = write(
      "guides.html",
      SHELL(`<link rel="canonical" href="${CANONICAL_ORIGIN}/other">`),
    );
    const [issue] = validateCanonicalInFile({ distDir: tmp, file });
    expect(issue.message).toMatch(/mismatch/);
  });
  it("flags non-https / off-origin / query / fragment", () => {
    const badFile = write(
      "bad.html",
      SHELL(`<link rel="canonical" href="http://evil.example/bad?x=1#y">`),
    );
    const messages = validateCanonicalInFile({ distDir: tmp, file: badFile }).map(
      (i) => i.message,
    );
    expect(messages.some((m) => /must be https/.test(m))).toBe(true);
    expect(messages.some((m) => /must live on/.test(m))).toBe(true);
    expect(messages.some((m) => /no query\/fragment/.test(m))).toBe(true);
  });
  it("requires zero canonicals in dist/index.html (SPA fallback)", () => {
    const clean = write("index.html", SHELL(""));
    expect(validateCanonicalInFile({ distDir: tmp, file: clean })).toEqual([]);
    const dirty = write(
      "index.html",
      SHELL(`<link rel="canonical" href="${CANONICAL_ORIGIN}/">`),
    );
    const [issue] = validateCanonicalInFile({ distDir: tmp, file: dirty });
    expect(issue.message).toMatch(/SPA fallback/);
  });
});

describe("validateCanonicalLinks (end-to-end)", () => {
  it("walks a tree and reports across all documents", () => {
    const root = mkdtempSync(join(tmpdir(), "canonical-e2e-"));
    try {
      writeFileSync(join(root, "index.html"), SHELL(""));
      writeFileSync(
        join(root, "guides.html"),
        SHELL(`<link rel="canonical" href="${CANONICAL_ORIGIN}/guides">`),
      );
      mkdirSync(join(root, "cultivars"), { recursive: true });
      writeFileSync(
        join(root, "cultivars", "oreoz.html"),
        SHELL(`<link rel="canonical" href="${CANONICAL_ORIGIN}/cultivars/oreoz">`),
      );
      writeFileSync(join(root, "broken.html"), SHELL(""));
      const { issues, documents } = validateCanonicalLinks(root);
      expect(documents).toBe(4);
      expect(issues).toHaveLength(1);
      expect(issues[0].file).toBe("broken.html");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes against the real project dist/ when present", () => {
    const distDir = resolve(process.cwd(), "dist");
    if (!existsSync(distDir)) return;
    const { issues, documents } = validateCanonicalLinks(distDir);
    expect(documents).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });

  it("collectHtmlFiles finds nested files", () => {
    expect(collectHtmlFiles(tmp).length).toBeGreaterThan(0);
  });
});
