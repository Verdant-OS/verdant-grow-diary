import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");
const ROBOTS = readFileSync(resolve(ROOT, "public/robots.txt"), "utf8");
const INDEXING_AGENTS = ["Googlebot", "Bingbot", "*"] as const;

interface RobotsRules {
  readonly allow: string[];
  readonly disallow: string[];
}

function parseRobotsRules(text: string): Map<string, RobotsRules> {
  const groups = new Map<string, RobotsRules>();
  let currentAgents: string[] = [];
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      currentAgents = [];
      acceptingAgents = false;
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!acceptingAgents) currentAgents = [];
      currentAgents.push(value);
      acceptingAgents = true;
      if (!groups.has(value)) groups.set(value, { allow: [], disallow: [] });
      continue;
    }

    acceptingAgents = false;
    if ((field !== "allow" && field !== "disallow") || !value) continue;
    for (const agent of currentAgents) {
      groups.get(agent)?.[field].push(value);
    }
  }

  return groups;
}

function isAllowedByLongestRule(routePath: string, rules: RobotsRules | undefined): boolean {
  if (!rules) return true;

  let bestLength = -1;
  let bestAllows = true;
  const consider = (rule: string, allows: boolean) => {
    if (routePath !== rule && !routePath.startsWith(rule)) return;
    if (rule.length > bestLength || (rule.length === bestLength && allows)) {
      bestLength = rule.length;
      bestAllows = allows;
    }
  };

  for (const rule of rules.disallow) consider(rule, false);
  for (const rule of rules.allow) consider(rule, true);
  return bestAllows;
}

describe("robots private-route coverage", () => {
  it("blocks every authenticated, operator, and internal route from indexing crawlers", () => {
    const groups = parseRobotsRules(ROBOTS);
    const privatePaths = APP_ROUTES.filter((route) =>
      ["auth", "operator", "internal"].includes(route.access),
    ).map((route) => route.path);

    for (const agent of INDEXING_AGENTS) {
      const rules = groups.get(agent);
      const uncovered = privatePaths.filter((path) => isAllowedByLongestRule(path, rules));
      expect(uncovered, `Unblocked private routes for User-agent: ${agent}`).toEqual([]);
    }
  });

  it("lets crawlers read the public CSV preview noindex while keeping private sensors blocked", () => {
    const groups = parseRobotsRules(ROBOTS);
    expect(APP_ROUTES.find((route) => route.path === "/sensors/csv-preview")?.access).toBe(
      "public",
    );

    for (const agent of INDEXING_AGENTS) {
      const rules = groups.get(agent);
      expect(isAllowedByLongestRule("/sensors", rules), `${agent} can crawl /sensors`).toBe(false);
      expect(
        isAllowedByLongestRule("/sensors/csv-preview", rules),
        `${agent} cannot read the CSV preview noindex`,
      ).toBe(true);
    }
  });
});
