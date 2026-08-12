#!/usr/bin/env node
/**
 * Fail closed when the generated sitemap and robots crawl contract drift.
 * This checker is intentionally static: no network, credentials, or crawler
 * simulation outside the literal-prefix rules used by Verdant's robots file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SITEMAP_PATH = resolve(ROOT, "public/sitemap.xml");
const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");
const EXPECTED_ORIGIN = "https://verdantgrowdiary.com";
const EXPECTED_SITEMAP_URL = `${EXPECTED_ORIGIN}/sitemap.xml`;

/** Parse robots.txt into groups plus global Sitemap directives. */
function parseRobots(text) {
  const groups = new Map();
  const sitemapDirectives = [];
  let currentAgents = [];
  let inGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      inGroup = false;
      currentAgents = [];
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "sitemap") {
      sitemapDirectives.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!inGroup) currentAgents = [];
      currentAgents.push(value);
      inGroup = true;
      for (const agent of currentAgents) {
        if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [] });
      }
      continue;
    }
    if (field !== "allow" && field !== "disallow") continue;
    inGroup = false;
    for (const agent of currentAgents) {
      const group = groups.get(agent) ?? { allow: [], disallow: [] };
      (field === "allow" ? group.allow : group.disallow).push(value);
      groups.set(agent, group);
    }
  }
  return { groups, sitemapDirectives };
}

/**
 * Google's literal-prefix matching rule: the longest matching Allow or
 * Disallow wins. Empty Disallow means allow everything.
 */
function isAllowed(path, group) {
  if (!group) return true;
  let bestLength = -1;
  let bestAllow = true;
  const consider = (rule, allow) => {
    if (rule === "") {
      if (!allow && bestLength < 0) {
        bestLength = 0;
        bestAllow = true;
      }
      return;
    }
    if ((path === rule || path.startsWith(rule)) && rule.length > bestLength) {
      bestLength = rule.length;
      bestAllow = allow;
    }
  };
  for (const rule of group.allow) consider(rule, true);
  for (const rule of group.disallow) consider(rule, false);
  return bestLength < 0 ? true : bestAllow;
}

function parseSitemap(text) {
  return [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

function validateSitemapUrl(rawLoc) {
  let parsed;
  try {
    parsed = new URL(rawLoc);
  } catch {
    return { error: "not an absolute URL" };
  }
  if (parsed.origin !== EXPECTED_ORIGIN) {
    return { error: `foreign origin ${parsed.origin}` };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return { error: "must use HTTPS without URL credentials" };
  }
  if (parsed.search || parsed.hash) {
    return { error: "query strings and fragments are forbidden" };
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return { error: "invalid URI encoding" };
  }
  if (/[:*{}\[\]]/.test(decodedPath)) {
    return { error: "dynamic route placeholder" };
  }
  if (decodedPath === "/strains" || decodedPath.startsWith("/strains/")) {
    return { error: "legacy /strains alias" };
  }
  if (decodedPath !== "/" && decodedPath.endsWith("/")) {
    return { error: "non-canonical trailing slash" };
  }
  const expected = decodedPath === "/" ? `${EXPECTED_ORIGIN}/` : `${EXPECTED_ORIGIN}${decodedPath}`;
  if (rawLoc !== expected || parsed.pathname !== decodedPath) {
    return { error: "URL is not the exact canonical route form" };
  }
  return { path: decodedPath };
}

function main() {
  const robotsText = readFileSync(ROBOTS_PATH, "utf8");
  const sitemapText = readFileSync(SITEMAP_PATH, "utf8");
  const { groups, sitemapDirectives } = parseRobots(robotsText);
  const agents = [...groups.keys()];
  const rawLocations = parseSitemap(sitemapText);
  const errors = [];

  if (rawLocations.length === 0) {
    errors.push("sitemap has zero <loc> entries");
  }
  if (agents.length === 0) {
    errors.push("robots.txt has no user-agent groups");
  }
  if (!groups.has("*")) {
    errors.push("robots.txt has no wildcard User-agent group");
  }
  if (
    sitemapDirectives.length !== 1 ||
    sitemapDirectives[0] !== EXPECTED_SITEMAP_URL
  ) {
    errors.push(
      `robots.txt must contain exactly one \"Sitemap: ${EXPECTED_SITEMAP_URL}\" directive (found: ${sitemapDirectives.join(", ") || "none"})`,
    );
  }

  const seenLocations = new Set();
  const seenPaths = new Set();
  for (const rawLoc of rawLocations) {
    if (seenLocations.has(rawLoc)) {
      errors.push(`duplicate sitemap URL: ${rawLoc}`);
      continue;
    }
    seenLocations.add(rawLoc);
    const validation = validateSitemapUrl(rawLoc);
    if (validation.error) {
      errors.push(`${rawLoc}: ${validation.error}`);
      continue;
    }
    if (seenPaths.has(validation.path)) {
      errors.push(`duplicate sitemap path: ${validation.path}`);
      continue;
    }
    seenPaths.add(validation.path);
    for (const agent of agents) {
      if (!isAllowed(validation.path, groups.get(agent))) {
        errors.push(`${validation.path} is blocked for User-agent: ${agent}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`check-sitemap-robots-parity: ${errors.length} violation(s):`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }

  console.log(
    `check-sitemap-robots-parity: OK — ${rawLocations.length} canonical sitemap URLs allowed across ${agents.length} robots user-agent group(s); sitemap directive is exact.`,
  );
}

main();
