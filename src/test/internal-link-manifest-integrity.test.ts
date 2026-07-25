/**
 * Literal internal-link integrity.
 *
 * Scans rendered page/component source for static `to="/..."`,
 * `href="/..."`, object `to`/`href` fields, and `navigate("/...")` calls.
 * Every discovered app path must resolve to a mounted APP_ROUTES entry.
 *
 * Dynamic/template links are covered by their focused route-helper tests;
 * this gate catches the easy-to-miss literal typo and deleted-route cases.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { APP_ROUTES } from "@/lib/appRouteManifest";

const REPO_ROOT = resolve(__dirname, "../..");
const SOURCE_ROOTS = [
  resolve(REPO_ROOT, "src/pages"),
  resolve(REPO_ROOT, "src/components"),
] as const;

const LINK_PATTERNS = [
  /\b(?:to|href)\s*=\s*["'](\/[^"'{}]*)["']/g,
  /\b(?:to|href)\s*:\s*["'](\/[^"'{}]*)["']/g,
  /\bnavigate\(\s*["'](\/[^"'{}]*)["']/g,
] as const;

const STATIC_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".pdf",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".xml",
]);

interface LiteralInternalLink {
  source: string;
  line: number;
  target: string;
}

function walkTsxFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out.sort();
}

function canonicalPath(target: string): string {
  const withoutFragment = target.split("#", 1)[0];
  return withoutFragment.split("?", 1)[0] || "/";
}

function isStaticAsset(target: string): boolean {
  return STATIC_ASSET_EXTENSIONS.has(extname(canonicalPath(target)).toLowerCase());
}

function routePatternMatches(pattern: string, path: string): boolean {
  if (pattern === "*" || !pattern.startsWith("/")) return false;
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function resolvesToMountedRoute(target: string): boolean {
  const path = canonicalPath(target);
  return APP_ROUTES.some((entry) => routePatternMatches(entry.path, path));
}

function extractLiteralInternalLinks(): LiteralInternalLink[] {
  const links: LiteralInternalLink[] = [];
  for (const file of SOURCE_ROOTS.flatMap(walkTsxFiles)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of LINK_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const target = match[1];
        if (!target || target.startsWith("//") || isStaticAsset(target)) continue;
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        links.push({
          source: relative(REPO_ROOT, file).replace(/\\/g, "/"),
          line,
          target,
        });
      }
    }
  }
  return links;
}

describe("literal internal links", () => {
  it(
    "all resolve to mounted application routes",
    () => {
      const links = extractLiteralInternalLinks();
      const broken = links
        .filter((link) => !resolvesToMountedRoute(link.target))
        .map((link) => `${link.source}:${link.line} -> ${link.target}`);

      expect(broken, `Broken literal internal links:\n${broken.join("\n")}`).toEqual([]);
      expect(links.length).toBeGreaterThan(50);
    },
    15_000,
  );
});
