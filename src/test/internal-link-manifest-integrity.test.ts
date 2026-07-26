/**
 * Literal internal-link integrity.
 *
 * Scans all production TypeScript source for static `to="/..."`,
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
import { GLOBAL_SEARCH_ITEMS } from "@/lib/globalSearchItems";
import { LABS_NAVIGATION_DESTINATIONS } from "@/lib/growerNavigationRules";

const REPO_ROOT = resolve(__dirname, "../..");
const SOURCE_ROOT = resolve(REPO_ROOT, "src");
const EXCLUDED_SOURCE_DIRECTORIES = new Set(["test", "__tests__"]);

const LINK_PATTERNS = [
  /\b(?:to|href)\s*=\s*["'](\/[^"'{}]*)["']/g,
  /\b(?:to|href)\s*:\s*["'](\/[^"'{}]*)["']/g,
  /\bnavigate\(\s*["'](\/[^"'{}]*)["']/g,
] as const;

const DEAD_LINK_PATTERNS = [
  /\b(?:to|href)\s*=\s*["']\s*["']/g,
  /\b(?:to|href)\s*:\s*["']\s*["']/g,
  /\b(?:to|href)\s*=\s*["']#["']/g,
  /\b(?:to|href)\s*:\s*["']#["']/g,
  /\b(?:to|href)\s*=\s*["']javascript:/gi,
  /\b(?:to|href)\s*:\s*["']javascript:/gi,
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

interface DataDrivenInternalLink {
  source: string;
  label: string;
  target: string;
}

function walkProductionSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) {
        out.push(...walkProductionSourceFiles(full));
      }
    } else if (
      entry.isFile() &&
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
    ) {
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
  for (const file of walkProductionSourceFiles(SOURCE_ROOT)) {
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

function extractDeadLinks(): LiteralInternalLink[] {
  const links: LiteralInternalLink[] = [];
  for (const file of walkProductionSourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of DEAD_LINK_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        links.push({
          source: relative(REPO_ROOT, file).replace(/\\/g, "/"),
          line,
          target: match[0],
        });
      }
    }
  }
  return links;
}

function getDataDrivenInternalLinks(): DataDrivenInternalLink[] {
  return [
    ...GLOBAL_SEARCH_ITEMS.map((item) => ({
      source: "GLOBAL_SEARCH_ITEMS",
      label: item.label,
      target: item.to,
    })),
    ...LABS_NAVIGATION_DESTINATIONS.map((item) => ({
      source: "LABS_NAVIGATION_DESTINATIONS",
      label: item.label,
      target: item.to,
    })),
  ];
}

describe("literal internal links", () => {
  it("all resolve to mounted application routes", () => {
    const links = extractLiteralInternalLinks();
    const broken = links
      .filter((link) => !resolvesToMountedRoute(link.target))
      .map((link) => `${link.source}:${link.line} -> ${link.target}`);

    expect(broken, `Broken literal internal links:\n${broken.join("\n")}`).toEqual([]);
    expect(links.length).toBeGreaterThan(150);
  }, 15_000);

  it("contains no static empty, hash-only, or javascript links", () => {
    const dead = extractDeadLinks().map((link) => `${link.source}:${link.line} -> ${link.target}`);

    expect(dead, `Dead static links:\n${dead.join("\n")}`).toEqual([]);
  }, 15_000);
});

describe("data-driven internal links", () => {
  it("all Global Search and grower-navigation destinations resolve to mounted routes", () => {
    const links = getDataDrivenInternalLinks();
    const broken = links
      .filter((link) => !resolvesToMountedRoute(link.target))
      .map((link) => `${link.source} '${link.label}' -> ${link.target}`);

    expect(broken, `Broken data-driven internal links:\n${broken.join("\n")}`).toEqual([]);
    expect(links).toHaveLength(GLOBAL_SEARCH_ITEMS.length + LABS_NAVIGATION_DESTINATIONS.length);
  });

  it("resolves concrete destinations against parameterized manifest patterns", () => {
    const parameterizedRoutes = APP_ROUTES.filter((entry) => entry.path.includes(":"));

    for (const route of parameterizedRoutes) {
      const concreteDestination = route.path.replace(/:[^/]+/g, "route-integrity-id");
      expect(
        resolvesToMountedRoute(concreteDestination),
        `${concreteDestination} must resolve against ${route.path}`,
      ).toBe(true);
    }

    expect(parameterizedRoutes.length).toBeGreaterThan(0);
  });
});
