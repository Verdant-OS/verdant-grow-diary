import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");
const ROBOTS = readFileSync(resolve(ROOT, "public/robots.txt"), "utf8");
const INDEXING_AGENTS = ["Googlebot", "Bingbot", "*"] as const;

function parseDisallowRules(text: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
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
      if (!groups.has(value)) groups.set(value, []);
      continue;
    }

    acceptingAgents = false;
    if (field !== "disallow" || !value) continue;
    for (const agent of currentAgents) {
      groups.get(agent)?.push(value);
    }
  }

  return groups;
}

function isBlockedByPrefix(routePath: string, rules: readonly string[]): boolean {
  return rules.some((rule) => routePath === rule || routePath.startsWith(rule));
}

describe("robots private-route coverage", () => {
  it("blocks every authenticated, operator, and internal route from indexing crawlers", () => {
    const groups = parseDisallowRules(ROBOTS);
    const privatePaths = APP_ROUTES.filter((route) =>
      ["auth", "operator", "internal"].includes(route.access),
    ).map((route) => route.path);

    for (const agent of INDEXING_AGENTS) {
      const rules = groups.get(agent) ?? [];
      const uncovered = privatePaths.filter((path) => !isBlockedByPrefix(path, rules));
      expect(uncovered, `Unblocked private routes for User-agent: ${agent}`).toEqual([]);
    }
  });
});
