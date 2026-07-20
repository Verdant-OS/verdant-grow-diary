#!/usr/bin/env node
/**
 * check-sitemap-robots-parity
 *
 * Fails CI when public/sitemap.xml and public/robots.txt disagree:
 *   1. Every <loc> in sitemap.xml must be Allow-ed by robots.txt for
 *      every named User-agent group AND for the wildcard group.
 *   2. No route Disallow-ed for any named agent may appear in the
 *      sitemap (crawlers obey their most-specific group, so a
 *      Disallow under "*" alone is not sufficient to catch a URL
 *      slipping past Googlebot/Bingbot).
 *
 * Pure static analysis over the checked-in files. No network.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SITEMAP_PATH = resolve(ROOT, "public/sitemap.xml");
const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");

/** Parse robots.txt into { agent: { allow: string[], disallow: string[] } }. */
function parseRobots(text) {
  const groups = new Map();
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
    if (field === "user-agent") {
      if (!inGroup) currentAgents = [];
      currentAgents.push(value);
      inGroup = true;
      for (const a of currentAgents) {
        if (!groups.has(a)) groups.set(a, { allow: [], disallow: [] });
      }
    } else if (field === "allow" || field === "disallow") {
      inGroup = false; // next user-agent starts a new group
      for (const a of currentAgents) {
        const g = groups.get(a) ?? { allow: [], disallow: [] };
        (field === "allow" ? g.allow : g.disallow).push(value);
        groups.set(a, g);
      }
    }
  }
  return groups;
}

/** Extract path from a full URL or return the path string as-is. */
function toPath(loc) {
  try {
    return new URL(loc).pathname;
  } catch {
    return loc;
  }
}

/**
 * Google's matching rule: the most-specific (longest) matching Allow or
 * Disallow rule wins. Empty Disallow value means "allow everything".
 * Rules use path prefix matching; we do not implement wildcards ($/*)
 * here because our robots.txt uses only literal prefixes.
 */
function isAllowed(path, group) {
  if (!group) return true;
  let bestLen = -1;
  let bestAllow = true;
  const consider = (rule, allow) => {
    if (rule === "") {
      // Empty Disallow => allow all; empty Allow is meaningless.
      if (!allow && bestLen < 0) {
        bestLen = 0;
        bestAllow = true;
      }
      return;
    }
    if (path === rule || path.startsWith(rule)) {
      if (rule.length > bestLen) {
        bestLen = rule.length;
        bestAllow = allow;
      }
    }
  };
  for (const rule of group.allow) consider(rule, true);
  for (const rule of group.disallow) consider(rule, false);
  return bestLen < 0 ? true : bestAllow;
}

function parseSitemap(text) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(text)) !== null) locs.push(m[1]);
  return locs;
}

function main() {
  const robotsText = readFileSync(ROBOTS_PATH, "utf8");
  const sitemapText = readFileSync(SITEMAP_PATH, "utf8");
  const groups = parseRobots(robotsText);
  const agents = [...groups.keys()];
  const sitemapPaths = parseSitemap(sitemapText).map(toPath);

  if (sitemapPaths.length === 0) {
    console.error("check-sitemap-robots-parity: sitemap has zero <loc> entries");
    process.exit(1);
  }
  if (agents.length === 0) {
    console.error("check-sitemap-robots-parity: robots.txt has no user-agent groups");
    process.exit(1);
  }

  const violations = [];
  for (const path of sitemapPaths) {
    for (const agent of agents) {
      if (!isAllowed(path, groups.get(agent))) {
        violations.push({ path, agent });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `check-sitemap-robots-parity: ${violations.length} sitemap URL(s) blocked by robots.txt:`,
    );
    for (const v of violations) {
      console.error(`  ✗ ${v.path}  (blocked for User-agent: ${v.agent})`);
    }
    process.exit(1);
  }

  console.log(
    `check-sitemap-robots-parity: OK — ${sitemapPaths.length} sitemap URLs allowed across ${agents.length} robots user-agent group(s).`,
  );
}

main();
