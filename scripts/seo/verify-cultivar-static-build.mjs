import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const DIST = resolve(process.cwd(), "dist");

function fail(message) {
  throw new Error(message);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlAttribute(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|lt|gt|apos);/gi, (entity, code) => {
    const normalized = code.toLowerCase();
    const namedEntities = {
      amp: "&",
      quot: '"',
      lt: "<",
      gt: ">",
      apos: "'",
    };

    if (normalized in namedEntities) {
      return namedEntities[normalized];
    }

    const parsed = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);

    return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
  });
}

function meta(html, attr, key) {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*${attr}=["']${escapeRegex(key)}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`,
    "i",
  );
  const match = html.match(pattern)?.[1];
  return match === undefined ? null : decodeHtmlAttribute(match);
}

function canonicalValues(html) {
  return [
    ...html.matchAll(/<link\b(?=[^>]*rel=["']canonical["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi),
  ].map((match) => decodeHtmlAttribute(match[1]));
}

const manifest = JSON.parse(await readFile(resolve(DIST, "cultivar-seo-manifest.json"), "utf8"));
if (manifest.version !== 1) fail(`Unsupported cultivar SEO manifest version: ${manifest.version}`);

let assertions = 0;
for (const route of manifest.routes) {
  const html = await readFile(resolve(DIST, route.fileName), "utf8");
  const expected = route.metadata;
  const canonicals = canonicalValues(html);
  if (canonicals.length !== 1 || canonicals[0] !== expected.url) {
    fail(`${route.routePath}: canonical mismatch ${JSON.stringify(canonicals)}`);
  }
  assertions++;

  const expectedMeta = [
    ["name", "description", expected.description],
    ["name", "robots", expected.robots],
    ["property", "og:title", expected.title],
    ["property", "og:description", expected.description],
    ["property", "og:url", expected.url],
    ["property", "og:type", expected.ogType],
    ["property", "og:image", expected.image],
    ["property", "og:image:alt", expected.imageAlt],
    ["property", "og:image:width", String(expected.imageWidth)],
    ["property", "og:image:height", String(expected.imageHeight)],
    ["property", "og:image:type", expected.imageType],
    ["name", "twitter:title", expected.title],
    ["name", "twitter:description", expected.description],
    ["name", "twitter:image", expected.image],
    ["name", "twitter:image:alt", expected.imageAlt],
  ];
  for (const [attr, key, value] of expectedMeta) {
    if (meta(html, attr, key) !== value) {
      fail(`${route.routePath}: ${key} mismatch`);
    }
    assertions++;
  }
  if (!html.includes(`<title>${expected.title}</title>`))
    fail(`${route.routePath}: title mismatch`);
  if (!html.includes('<div id="root"></div>')) fail(`${route.routePath}: app root missing`);
  assertions += 2;
}

const hashes = new Set();
for (const image of manifest.images) {
  const bytes = await readFile(resolve(DIST, image.fileName));
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fail(`${image.fileName}: invalid PNG signature`);
  }
  const info = await sharp(bytes).metadata();
  if (info.format !== "png" || info.width !== 1200 || info.height !== 630) {
    fail(
      `${image.fileName}: expected 1200x630 PNG, got ${info.width}x${info.height} ${info.format}`,
    );
  }
  hashes.add(createHash("sha256").update(bytes).digest("hex"));
  assertions += 2;
}

if (hashes.size !== manifest.images.length) {
  fail("Cultivar OpenGraph cards are not slug-specific; duplicate image bytes detected");
}
assertions++;

console.log(
  `Cultivar static SEO build: PASS (${manifest.routes.length} documents, ${manifest.images.length} PNGs, ${assertions} assertions)`,
);
