/**
 * Unit tests for scripts/validate-og-image-urls.mjs.
 *
 * Locks the contract that every og:image / twitter:image URL in a
 * built HTML document must be absolute + canonical-origin + cacheable
 * + resolve to a real dist file + have PNG/JPEG magic bytes matching
 * its extension + measure exactly 1200x630. The postbuild wiring
 * exists in package.json; these tests exercise the pure module.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectHtmlFiles,
  extractImageMetaUrls,
  readImageMetadata,
  contentTypeForExtension,
  validateImageUrl,
  validateOgImageUrls,
} from "../../scripts/validate-og-image-urls.mjs";

const ORIGIN = "https://verdantgrowdiary.com";

/** Build a minimal PNG buffer with a valid IHDR at the declared size. */
function pngBuffer(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // length
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // color type RGBA
  // remaining bytes (compression/filter/interlace + CRC placeholder) unused
  return Buffer.concat([sig, ihdr]);
}

/** Build a minimal JPEG with SOI + SOF0 declaring the given size. */
function jpegBuffer(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0, len=17, precision=8
    Buffer.from([(height >> 8) & 0xff, height & 0xff]),
    Buffer.from([(width >> 8) & 0xff, width & 0xff]),
    Buffer.from([0x03]), // components
    Buffer.alloc(9), // component data (dummy)
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

let dist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "og-validate-"));
  mkdirSync(join(dist, "og"), { recursive: true });
  mkdirSync(join(dist, "nested"), { recursive: true });
  writeFileSync(join(dist, "og", "home.png"), pngBuffer(1200, 630));
  writeFileSync(join(dist, "og", "wrong-size.png"), pngBuffer(800, 400));
  writeFileSync(join(dist, "og", "mismatch.jpg"), pngBuffer(1200, 630)); // ext lies
  writeFileSync(join(dist, "og", "valid.jpg"), jpegBuffer(1200, 630));
  writeFileSync(
    join(dist, "index.html"),
    `<html><head>
      <meta property="og:image" content="${ORIGIN}/og/home.png" />
      <meta name="twitter:image" content="${ORIGIN}/og/home.png" />
    </head></html>`,
  );
  writeFileSync(
    join(dist, "nested", "page.html"),
    `<html><head>
      <meta property="og:image" content="${ORIGIN}/og/valid.jpg" />
    </head></html>`,
  );
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe("validate-og-image-urls: pure helpers", () => {
  it("collectHtmlFiles walks nested directories", () => {
    const files = collectHtmlFiles(dist).sort();
    expect(files.length).toBe(2);
    expect(files.some((f: string) => f.endsWith("index.html"))).toBe(true);
    expect(files.some((f: string) => f.endsWith("page.html"))).toBe(true);
  });

  it("extractImageMetaUrls finds og:image and twitter:image tags case-insensitively", () => {
    const urls = extractImageMetaUrls(
      `<meta property="OG:IMAGE" content="${ORIGIN}/a.png" />
       <meta name="twitter:image" content="${ORIGIN}/b.png" />
       <meta property="og:title" content="ignored" />`,
    );
    expect(urls).toEqual([
      { tag: "og:image", url: `${ORIGIN}/a.png` },
      { tag: "twitter:image", url: `${ORIGIN}/b.png` },
    ]);
  });

  it("readImageMetadata reads PNG dimensions from IHDR", () => {
    expect(readImageMetadata(pngBuffer(1200, 630))).toEqual({
      format: "png",
      width: 1200,
      height: 630,
    });
  });

  it("readImageMetadata reads JPEG dimensions from SOF0", () => {
    expect(readImageMetadata(jpegBuffer(1200, 630))).toEqual({
      format: "jpeg",
      width: 1200,
      height: 630,
    });
  });

  it("readImageMetadata throws on unknown formats", () => {
    expect(() => readImageMetadata(Buffer.from("not an image"))).toThrow();
  });

  it("contentTypeForExtension maps extensions to canonical types", () => {
    expect(contentTypeForExtension("foo.png")).toBe("image/png");
    expect(contentTypeForExtension("foo.JPG")).toBe("image/jpeg");
    expect(contentTypeForExtension("foo.svg")).toBe(null);
  });
});

describe("validate-og-image-urls: validateImageUrl", () => {
  const args = (url: string) => ({
    distDir: dist,
    file: join(dist, "index.html"),
    tag: "og:image",
    url,
  });

  it("accepts a canonical-origin absolute URL to a 1200x630 PNG", () => {
    expect(validateImageUrl(args(`${ORIGIN}/og/home.png`))).toEqual([]);
  });

  it("rejects relative URLs", () => {
    const issues = validateImageUrl(args("/og/home.png"));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/not absolute/);
  });

  it("rejects http and non-canonical origins", () => {
    const httpIssues = validateImageUrl(args("http://verdantgrowdiary.com/og/home.png"));
    expect(
      httpIssues.some((i: { message: string }) => /protocol must be https/.test(i.message)),
    ).toBe(true);
    const originIssues = validateImageUrl(args("https://cdn.example.com/og/home.png"));
    expect(originIssues.some((i: { message: string }) => /origin must be/.test(i.message))).toBe(
      true,
    );
  });

  it("rejects URLs with query strings or fragments (cache poisoners)", () => {
    const q = validateImageUrl(args(`${ORIGIN}/og/home.png?v=2`));
    expect(q.some((i: { message: string }) => /query string/.test(i.message))).toBe(true);
    const f = validateImageUrl(args(`${ORIGIN}/og/home.png#x`));
    expect(f.some((i: { message: string }) => /fragment/.test(i.message))).toBe(true);
  });

  it("rejects URLs whose file does not exist in dist", () => {
    const issues = validateImageUrl(args(`${ORIGIN}/og/missing.png`));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/no file at dist/);
  });

  it("rejects wrong dimensions", () => {
    const issues = validateImageUrl(args(`${ORIGIN}/og/wrong-size.png`));
    expect(issues.some((i: { message: string }) => /1200x630/.test(i.message))).toBe(true);
  });

  it("rejects extension/magic-byte mismatch (content-type would be wrong)", () => {
    const issues = validateImageUrl(args(`${ORIGIN}/og/mismatch.jpg`));
    expect(issues.some((i: { message: string }) => /content-type mismatch/.test(i.message))).toBe(
      true,
    );
  });
});

describe("validate-og-image-urls: end-to-end", () => {
  it("returns no issues for a well-formed dist fixture", () => {
    const result = validateOgImageUrls(dist);
    expect(result.documents).toBe(2);
    expect(result.checked).toBe(3);
    expect(result.issues).toEqual([]);
  });

  it("validates the real project dist output when present", () => {
    // Non-fatal when dist doesn't exist locally — CI's build step
    // produces it; this asserts the real artifact when it's around.
    const projectDist = join(process.cwd(), "dist");
    try {
      const stat = statSync(projectDist);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }
    const result = validateOgImageUrls(projectDist);
    expect(
      result.issues,
      `real dist validation should be clean:\n${result.issues.map((i) => `${i.file} ${i.url} — ${i.message}`).join("\n")}`,
    ).toEqual([]);
  });
});
