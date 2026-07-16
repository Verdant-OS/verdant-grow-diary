import sharp from "sharp";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { VERDANT_CULTIVARS } from "../../src/constants/verdantCultivars";
import {
  buildCultivarSeo,
  buildCultivarsIndexSeo,
  CULTIVAR_SITE_ORIGIN,
  type CultivarSeoDescriptor,
} from "../../src/lib/cultivarSeoRules";

const FILTER_VARIANTS = [
  "?q=oreoz",
  "?difficulty=Intermediate",
  "?q=cookies&difficulty=Beginner-friendly",
  "?difficulty=Advanced&q=gas",
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|lt|gt|apos);/gi, (entity, code: string) => {
    const normalized = code.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "quot") return '"';
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "apos") return "'";
    const value = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
  });
}

export function readMeta(html: string, attr: "name" | "property", key: string): string | null {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*${attr}=["']${escapeRegex(key)}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`,
    "i",
  );
  const value = html.match(pattern)?.[1];
  return value === undefined ? null : decodeHtmlAttribute(value);
}

export function readCanonicals(html: string): string[] {
  return [
    ...html.matchAll(/<link\b(?=[^>]*rel=["']canonical["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi),
  ].map((match) => decodeHtmlAttribute(match[1]));
}

export function inspectRawCultivarHtml(
  html: string,
  seo: CultivarSeoDescriptor,
  options: { queryVariant?: boolean } = {},
): string[] {
  const expectedUrl = `${CULTIVAR_SITE_ORIGIN}${seo.path}`;
  const problems: string[] = [];
  const canonicals = readCanonicals(html);
  if (canonicals.length !== 1 || canonicals[0] !== expectedUrl) {
    problems.push(`canonical mismatch: ${JSON.stringify(canonicals)}`);
  }
  for (const [attr, key, expected] of [
    ["name", "description", seo.description],
    ["property", "og:title", seo.title],
    ["property", "og:description", seo.description],
    ["property", "og:url", expectedUrl],
    ["property", "og:type", seo.ogType],
    ["property", "og:image", seo.ogImage],
    ["property", "og:image:alt", seo.ogImageAlt],
    ["property", "og:image:width", String(seo.ogImageWidth)],
    ["property", "og:image:height", String(seo.ogImageHeight)],
    ["property", "og:image:type", seo.ogImageType],
    ["name", "twitter:title", seo.title],
    ["name", "twitter:description", seo.description],
    ["name", "twitter:image", seo.ogImage],
    ["name", "twitter:image:alt", seo.ogImageAlt],
  ] as const) {
    const actual = readMeta(html, attr, key);
    if (actual !== expected) problems.push(`${key} mismatch: ${JSON.stringify(actual)}`);
  }
  const robots = readMeta(html, "name", "robots");
  if (options.queryVariant) {
    // Static route documents cannot vary by query string; the canonical is the
    // non-JS duplicate-control signal. The hydrated route additionally emits
    // noindex/follow, covered by browser regression tests.
    if (robots !== "index, follow" && robots !== "noindex, follow") {
      problems.push(`unexpected robots value: ${JSON.stringify(robots)}`);
    }
  } else if (robots !== "index, follow") {
    problems.push(`robots mismatch: ${JSON.stringify(robots)}`);
  }
  return problems;
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status < 500 || attempt === 3) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
  }
  throw lastError;
}

async function main() {
  const base = (
    process.env.SMOKE_BASE ??
    process.env.SEO_DEPLOYED_URL ??
    CULTIVAR_SITE_ORIGIN
  ).replace(/\/$/, "");
  const headers = { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" };
  let passed = 0;
  const failures: string[] = [];

  const canonicalRoutes = [buildCultivarsIndexSeo(), ...VERDANT_CULTIVARS.map(buildCultivarSeo)];
  for (const seo of canonicalRoutes) {
    const response = await fetchWithRetry(`${base}${seo.path}`, { headers });
    const html = await response.text();
    const problems = response.ok ? inspectRawCultivarHtml(html, seo) : [`HTTP ${response.status}`];
    if (problems.length === 0) passed++;
    else failures.push(`${seo.path}: ${problems.join("; ")}`);
  }

  for (const search of FILTER_VARIANTS) {
    const seo = buildCultivarsIndexSeo(search);
    const response = await fetchWithRetry(`${base}/cultivars${search}`, { headers });
    const html = await response.text();
    const problems = response.ok
      ? inspectRawCultivarHtml(html, seo, { queryVariant: true })
      : [`HTTP ${response.status}`];
    if (problems.length === 0) passed++;
    else failures.push(`/cultivars${search}: ${problems.join("; ")}`);
  }

  for (const seo of canonicalRoutes) {
    const imagePath = new URL(seo.ogImage).pathname;
    const response = await fetchWithRetry(`${base}${imagePath}`, { headers });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const info = response.ok
      ? await sharp(bytes)
          .metadata()
          .catch(() => null)
      : null;
    if (
      response.ok &&
      /^image\/png(?:;|$)/i.test(contentType) &&
      info?.format === "png" &&
      info.width === 1200 &&
      info.height === 630
    ) {
      passed++;
    } else {
      failures.push(
        `${imagePath}: expected HTTP 2xx 1200x630 image/png, got ${response.status} ${contentType} ${info?.width ?? "?"}x${info?.height ?? "?"}`,
      );
    }
  }

  for (const [legacy, target] of [
    ["/strains", "/cultivars"],
    ["/strains/oreoz", "/cultivars/oreoz"],
  ] as const) {
    const response = await fetchWithRetry(`${base}${legacy}`, { headers, redirect: "manual" });
    const location = response.headers.get("location");
    const locationPath = location ? new URL(location, base).pathname : null;
    if ([301, 302, 307, 308].includes(response.status) && locationPath === target) {
      passed++;
    } else {
      failures.push(
        `${legacy}: expected HTTP redirect to ${target}, got ${response.status} ${location ?? "(no location)"}`,
      );
    }
  }

  const total = passed + failures.length;
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `Cultivar post-deploy SEO: ${failures.length === 0 ? "PASS" : "FAIL"} (${passed}/${total})`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
