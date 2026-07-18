#!/usr/bin/env node
/**
 * validate-og-image-urls
 *
 * Walks a built `dist/` directory, extracts every og:image and
 * twitter:image URL declared in every emitted .html file, maps each URL
 * back to the local file Vite emitted for it, and validates:
 *
 *   - the URL is absolute, https, and lives on the canonical
 *     verdantgrowdiary.com origin (crawlers cannot follow relative
 *     paths and third-party CDNs can rotate/expire silently)
 *   - the URL has no query string / fragment (LinkedIn, Slack, X, and
 *     Facebook cache the first preview they scrape; signed or
 *     versioned URLs poison the cache)
 *   - a matching file exists in `dist/` at the corresponding path
 *   - the file's magic bytes identify it as PNG or JPEG
 *   - the response Content-Type Vite/host will serve matches the file
 *     format (derived from extension)
 *   - the intrinsic image dimensions equal the expected OG card size
 *     (1200x630) — a wrongly-sized image downgrades to
 *     summary card on every social network at once
 *
 * Errors fail the postbuild. Pure module + thin CLI so tests can drive
 * it directly.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_ORIGIN = "https://verdantgrowdiary.com";
const EXPECTED_WIDTH = 1200;
const EXPECTED_HEIGHT = 630;

/** @typedef {{ file: string; url: string; tag: string; message: string }} Issue */

/**
 * Recursively collect every *.html file under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectHtmlFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && full.toLowerCase().endsWith(".html")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const META_URL_REGEX =
  /<meta\s+(?:name|property)=["'](og:image|twitter:image)["']\s+content=["']([^"']+)["'][^>]*\/?>/gi;

/**
 * Extract all og:image and twitter:image URLs from an HTML document.
 * @param {string} html
 * @returns {{ tag: string; url: string }[]}
 */
export function extractImageMetaUrls(html) {
  const out = [];
  for (const match of html.matchAll(META_URL_REGEX)) {
    out.push({ tag: match[1].toLowerCase(), url: match[2] });
  }
  return out;
}

/**
 * Read the intrinsic dimensions and detected format of a PNG or JPEG
 * file buffer. Throws on unrecognized formats.
 * @param {Buffer} buf
 * @returns {{ format: "png" | "jpeg"; width: number; height: number }}
 */
export function readImageMetadata(buf) {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A, then IHDR at offset 8-24
  // (length=13, "IHDR", width u32 BE, height u32 BE).
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a &&
    buf.toString("ascii", 12, 16) === "IHDR"
  ) {
    return {
      format: "png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  // JPEG: starts with FF D8, then scan segments for SOF0/1/2 (C0/C1/C2).
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      // Standalone markers (RSTn, SOI, EOI, TEM) have no length.
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLen = buf.readUInt16BE(offset + 2);
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { format: "jpeg", width, height };
      }
      offset += 2 + segLen;
    }
    throw new Error("JPEG SOF marker not found");
  }
  throw new Error("Unrecognized image format (expected PNG or JPEG magic bytes)");
}

/**
 * Derive the Content-Type a static host (Vercel / Netlify / Lovable
 * hosting) will serve for a given file, purely from its extension.
 * @param {string} filePath
 * @returns {string | null}
 */
export function contentTypeForExtension(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return null;
}

/**
 * Validate one image URL against the built dist directory.
 * @param {{ distDir: string; file: string; tag: string; url: string }} args
 * @returns {Issue[]}
 */
export function validateImageUrl({ distDir, file, tag, url }) {
  const issues = [];
  const relFile = relative(distDir, file);
  const push = (message) => issues.push({ file: relFile, url, tag, message });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    push("image URL is not absolute / does not parse as URL");
    return issues;
  }
  if (parsed.protocol !== "https:") push(`protocol must be https, got ${parsed.protocol}`);
  if (parsed.origin !== CANONICAL_ORIGIN) {
    push(`origin must be ${CANONICAL_ORIGIN}, got ${parsed.origin}`);
  }
  if (parsed.search) push(`URL must have no query string (breaks scraper cache): ${parsed.search}`);
  if (parsed.hash) push(`URL must have no fragment: ${parsed.hash}`);

  if (issues.length > 0) return issues;

  // Map https://verdantgrowdiary.com/og/foo.png → dist/og/foo.png
  const localPath = join(distDir, parsed.pathname);
  if (!existsSync(localPath)) {
    push(`no file at dist${parsed.pathname} — did the build emit this asset?`);
    return issues;
  }

  const expectedCt = contentTypeForExtension(localPath);
  if (!expectedCt || !expectedCt.startsWith("image/")) {
    push(`extension ${extname(localPath)} is not a supported image content-type`);
    return issues;
  }

  const buf = readFileSync(localPath);
  let meta;
  try {
    meta = readImageMetadata(buf);
  } catch (err) {
    push(`could not read image metadata: ${err instanceof Error ? err.message : String(err)}`);
    return issues;
  }

  const detectedCt = meta.format === "png" ? "image/png" : "image/jpeg";
  if (detectedCt !== expectedCt) {
    push(
      `content-type mismatch: extension says ${expectedCt} but magic bytes are ${detectedCt}`,
    );
  }

  if (meta.width !== EXPECTED_WIDTH || meta.height !== EXPECTED_HEIGHT) {
    push(
      `dimensions ${meta.width}x${meta.height} do not match required OG card size ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`,
    );
  }

  return issues;
}

/**
 * Validate every og:image / twitter:image URL declared in every HTML
 * document under `distDir`.
 * @param {string} distDir
 * @returns {{ issues: Issue[]; checked: number; documents: number }}
 */
export function validateOgImageUrls(distDir) {
  const files = collectHtmlFiles(distDir);
  const issues = [];
  let checked = 0;
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    for (const { tag, url } of extractImageMetaUrls(html)) {
      checked += 1;
      issues.push(...validateImageUrl({ distDir, file, tag, url }));
    }
  }
  return { issues, checked, documents: files.length };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-og-image-urls] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, checked, documents } = validateOgImageUrls(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-og-image-urls] FAIL — ${issues.length} issue(s) across ${documents} document(s), ${checked} URL(s) checked:`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}  [${issue.tag}]  ${issue.url}\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-og-image-urls] OK — ${checked} URL(s) across ${documents} document(s) validated`,
  );
}
