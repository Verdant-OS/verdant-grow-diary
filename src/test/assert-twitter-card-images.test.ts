/**
 * Unit tests for scripts/assert-twitter-card-images.mjs.
 *
 * Locks the contract that every built document declares exactly one
 * twitter:image, that it resolves to a real PNG inside dist, and that the PNG
 * is 1200x630, 8-bit truecolour (colour type 2 or 6), deflate/adaptive,
 * non-interlaced, IEND-terminated, and inside X's 5 MB card limit.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EXPECTED_TWITTER_CARD_WIDTH,
  EXPECTED_TWITTER_CARD_HEIGHT,
  MIN_TWITTER_CARD_BYTES,
  collectHtmlFiles,
  extractTwitterCardMeta,
  readPngEncoding,
  validateTwitterCardImage,
  validateTwitterCardImages,
} from "../../scripts/assert-twitter-card-images.mjs";

const ORIGIN = "https://verdantgrowdiary.com";

/** Build a syntactically valid PNG with the given IHDR fields and padding. */
function pngBuffer(
  width: number,
  height: number,
  {
    bitDepth = 8,
    colorType = 6,
    compression = 0,
    filter = 0,
    interlace = 0,
    padding = 4096,
    withIend = true,
  }: Partial<{
    bitDepth: number;
    colorType: number;
    compression: number;
    filter: number;
    interlace: number;
    padding: number;
    withIend: boolean;
  }> = {},
): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = bitDepth;
  ihdr[17] = colorType;
  ihdr[18] = compression;
  ihdr[19] = filter;
  ihdr[20] = interlace;
  const body = Buffer.alloc(padding);
  const iend = withIend
    ? Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
    : Buffer.alloc(0);
  return Buffer.concat([sig, ihdr, body, iend]);
}

function htmlDoc(url: string | null, { card = "summary_large_image", extra = "" } = {}): string {
  const image = url === null ? "" : `<meta name="twitter:image" content="${url}" />`;
  return `<!doctype html><html><head><meta name="twitter:card" content="${card}" />${image}${extra}</head><body></body></html>`;
}

const good = () => pngBuffer(EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT);

let dist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "twitter-card-"));
  mkdirSync(join(dist, "client", "og"), { recursive: true });
  writeFileSync(join(dist, "client", "og", "home.png"), good());
  writeFileSync(
    join(dist, "client", "og", "wrong-size.png"),
    pngBuffer(800, 418),
  );
  writeFileSync(
    join(dist, "client", "og", "interlaced.png"),
    pngBuffer(EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT, { interlace: 1 }),
  );
  writeFileSync(
    join(dist, "client", "og", "palette.png"),
    pngBuffer(EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT, { colorType: 3 }),
  );
  writeFileSync(
    join(dist, "client", "og", "sixteen-bit.png"),
    pngBuffer(EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT, { bitDepth: 16 }),
  );
  writeFileSync(
    join(dist, "client", "og", "truncated.png"),
    pngBuffer(EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT, { withIend: false }),
  );
  writeFileSync(join(dist, "client", "og", "tiny.png"), pngBuffer(1200, 630, { padding: 8 }));
  writeFileSync(join(dist, "client", "og", "card.jpg"), good());
  writeFileSync(join(dist, "client", "og", "not-a-png.png"), Buffer.alloc(4096, 0x21));
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

const check = (name: string) => validateTwitterCardImage({ distDir: dist, url: `${ORIGIN}/og/${name}` });

describe("extractTwitterCardMeta", () => {
  it("reads the twitter:image and twitter:card values", () => {
    const meta = extractTwitterCardMeta(htmlDoc(`${ORIGIN}/og/home.png`));
    expect(meta.images).toEqual([`${ORIGIN}/og/home.png`]);
    expect(meta.cards).toEqual(["summary_large_image"]);
  });

  it("returns no images when the tag is absent", () => {
    expect(extractTwitterCardMeta(htmlDoc(null)).images).toEqual([]);
  });

  it("collects duplicate twitter:image tags", () => {
    const html = htmlDoc(`${ORIGIN}/og/home.png`, {
      extra: `<meta name="twitter:image" content="${ORIGIN}/og/wrong-size.png" />`,
    });
    expect(extractTwitterCardMeta(html).images).toHaveLength(2);
  });
});

describe("readPngEncoding", () => {
  it("parses IHDR fields of a valid PNG", () => {
    const encoding = readPngEncoding(good());
    expect(encoding).toMatchObject({
      ok: true,
      width: 1200,
      height: 630,
      bitDepth: 8,
      colorType: 6,
      interlace: 0,
    });
  });

  it("rejects a non-PNG buffer", () => {
    expect(readPngEncoding(Buffer.alloc(4096, 0x21))).toMatchObject({ ok: false });
  });

  it("rejects a PNG with no IEND terminator", () => {
    const result = readPngEncoding(pngBuffer(1200, 630, { withIend: false }));
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/IEND/);
  });

  it("rejects a buffer too short to hold a header", () => {
    expect(readPngEncoding(Buffer.alloc(10))).toMatchObject({ ok: false });
  });
});

describe("validateTwitterCardImage", () => {
  it("accepts a correctly encoded 1200x630 card", () => {
    expect(check("home.png")).toEqual([]);
  });

  it("rejects a missing file", () => {
    expect(check("absent.png").join(" ")).toMatch(/no file emitted/);
  });

  it("rejects a non-absolute URL", () => {
    expect(validateTwitterCardImage({ distDir: dist, url: "/og/home.png" }).join(" ")).toMatch(
      /not an absolute URL/,
    );
  });

  it("rejects a wrong resolution", () => {
    expect(check("wrong-size.png").join(" ")).toMatch(/800x418/);
  });

  it("rejects an interlaced PNG", () => {
    expect(check("interlaced.png").join(" ")).toMatch(/interlaced/i);
  });

  it("rejects a palette PNG", () => {
    expect(check("palette.png").join(" ")).toMatch(/colour type 3/);
  });

  it("rejects a 16-bit PNG", () => {
    expect(check("sixteen-bit.png").join(" ")).toMatch(/bit depth 16/);
  });

  it("rejects a truncated PNG stream", () => {
    expect(check("truncated.png").join(" ")).toMatch(/IEND/);
  });

  it("rejects a file below the truncation floor", () => {
    const problems = check("tiny.png");
    expect(problems.join(" ")).toMatch(new RegExp(`< ${MIN_TWITTER_CARD_BYTES}`));
  });

  it("rejects a non-PNG extension", () => {
    expect(check("card.jpg").join(" ")).toMatch(/requires PNG card images/);
  });

  it("rejects a .png whose bytes are not a PNG", () => {
    expect(check("not-a-png.png").join(" ")).toMatch(/not a PNG/);
  });
});

describe("validateTwitterCardImages", () => {
  function docsDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "twitter-docs-"));
    mkdirSync(join(dir, "client", "og"), { recursive: true });
    writeFileSync(join(dir, "client", "og", "home.png"), good());
    writeFileSync(join(dir, "client", "og", "interlaced.png"), pngBuffer(1200, 630, { interlace: 1 }));
    for (const [name, html] of Object.entries(files)) writeFileSync(join(dir, name), html);
    return dir;
  }

  it("passes when every document has a valid card image", () => {
    const dir = docsDir({ "index.html": htmlDoc(`${ORIGIN}/og/home.png`) });
    const result = validateTwitterCardImages(dir);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.documents).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails a document that declares twitter:card but no image", () => {
    const dir = docsDir({ "index.html": htmlDoc(null) });
    const result = validateTwitterCardImages(dir);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/no twitter:image/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails a document with more than one twitter:image", () => {
    const dir = docsDir({
      "index.html": htmlDoc(`${ORIGIN}/og/home.png`, {
        extra: `<meta name="twitter:image" content="${ORIGIN}/og/home.png" />`,
      }),
    });
    expect(validateTwitterCardImages(dir).problems.join(" ")).toMatch(/expected exactly one/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("propagates encoding failures from referenced images", () => {
    const dir = docsDir({ "index.html": htmlDoc(`${ORIGIN}/og/interlaced.png`) });
    const result = validateTwitterCardImages(dir);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/interlaced/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("never vacuously passes an empty dist", () => {
    const dir = mkdtempSync(join(tmpdir(), "twitter-empty-"));
    const result = validateTwitterCardImages(dir);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/no HTML documents/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a missing dist directory rather than passing", () => {
    const result = validateTwitterCardImages(join(tmpdir(), "twitter-does-not-exist-xyz"));
    expect(result.ok).toBe(false);
  });

  it("collectHtmlFiles finds nested documents", () => {
    const dir = docsDir({ "index.html": htmlDoc(`${ORIGIN}/og/home.png`) });
    mkdirSync(join(dir, "guides"), { recursive: true });
    writeFileSync(join(dir, "guides", "a.html"), htmlDoc(`${ORIGIN}/og/home.png`));
    expect(collectHtmlFiles(dir).length).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("exposes the expected card resolution constants", () => {
    expect([EXPECTED_TWITTER_CARD_WIDTH, EXPECTED_TWITTER_CARD_HEIGHT]).toEqual([1200, 630]);
  });
});
