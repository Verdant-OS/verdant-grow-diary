import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APP = read("src/App.tsx");
const SIDEBAR = stripSourceComments(read("src/components/AppSidebar.tsx"));
const MOBILE_NAV = stripSourceComments(read("src/components/MobileNav.tsx"));
const GLOBAL_SEARCH = stripSourceComments(read("src/lib/globalSearchItems.ts"));
const DASHBOARD = stripSourceComments(read("src/pages/Dashboard.tsx"));
const MOCK = stripSourceComments(read("src/mock/index.ts"));
const USE_MOCK_DATA = stripSourceComments(read("src/hooks/useMockData.ts"));
const ROBOTS = read("public/robots.txt");

describe("retired standalone Tasks surface", () => {
  it("keeps /tasks as a context-preserving alias to the approval-required Action Queue", () => {
    expect(APP).toMatch(/path="\/tasks"\s+element=\{<RouteAliasRedirect\s+to="\/actions"\s*\/>\}/);
    expect(APP).not.toMatch(/import\(\s*["']\.\/pages\/Tasks["']\s*\)/);

    expect(APP_ROUTES.find((route) => route.path === "/tasks")).toMatchObject({
      access: "redirect",
      description: "→ /actions",
    });
  });

  it("removes the dead page and mock Task source instead of presenting placeholders", () => {
    expect(existsSync(resolve(ROOT, "src/pages/Tasks.tsx"))).toBe(false);
    expect(MOCK).not.toMatch(/export\s+interface\s+Task\b/);
    expect(MOCK).not.toMatch(/export\s+const\s+tasks\b/);
    expect(USE_MOCK_DATA).not.toMatch(/\buseTasks\b/);
    expect(USE_MOCK_DATA).not.toMatch(/queryKey:\s*\[\s*["']tasks["']\s*\]/);
  });

  it("removes standalone Tasks promotion while keeping the canonical Action Queue", () => {
    for (const source of [SIDEBAR, MOBILE_NAV, GLOBAL_SEARCH]) {
      expect(source).not.toMatch(/["']\/tasks["']/);
      expect(source).toMatch(/["']\/actions["']/);
    }

    expect(DASHBOARD).not.toMatch(/label=["']Due today["']/);
    expect(DASHBOARD).not.toMatch(/No tasks yet/);
    expect(DASHBOARD).not.toMatch(/const\s+tasks\b/);
  });

  it("keeps the retired private route blocked for every crawler group", () => {
    expect(ROBOTS.match(/^Disallow: \/tasks$/gm) ?? []).toHaveLength(3);
  });
});
