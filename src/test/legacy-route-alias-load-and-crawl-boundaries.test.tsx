import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { Route as HelpAlias } from "@/routes/help";

const root = resolve(__dirname, "../..");
const robots = readFileSync(resolve(root, "public/robots.txt"), "utf8");
const matrix = readFileSync(resolve(root, "docs/seo/route-indexation-matrix.md"), "utf8");

describe("legacy aliases preserve crawl and pre-render boundaries", () => {
  it.each(["Googlebot", "Bingbot", "*"])("excludes the private alias for %s", (agent) => {
    const groups = robots.split(/(?=^User-agent:)/m);
    const group = groups.find((block) => block.split("\n")[0].trim() === `User-agent: ${agent}`);
    expect(group).toBeDefined();
    expect(group?.split("\n").map((line) => line.trim())).toContain(
      "Disallow: /agent-integrations",
    );
  });

  it("states the actual manifest redirect count in the matrix prose", () => {
    const declared = matrix.match(/^These (\d+) manifest paths are `access: "redirect"`\./m);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBe(
      APP_ROUTES.filter((route) => route.access === "redirect").length,
    );
  });

  it.each(["", "?ref=qa#top"])(
    "resolves /help%s before rendering any application shell",
    async (suffix) => {
      const routeRoot = createRootRoute();
      const alias = createRoute({
        getParentRoute: () => routeRoot,
        path: "/help",
        // Delegate to the actual file-route load hook. Only the surrounding
        // test tree changes; no React render (and thus no provider) occurs.
        beforeLoad: (context) => HelpAlias.options.beforeLoad?.(context as never),
        component: HelpAlias.options.component,
      });
      const toolkit = createRoute({
        getParentRoute: () => routeRoot,
        path: "/tools/grow-help-toolkit",
        component: () => null,
      });
      const history = createMemoryHistory({ initialEntries: [`/help${suffix}`] });
      const router = createRouter({ routeTree: routeRoot.addChildren([alias, toolkit]), history });
      try {
        await router.load();
        await waitFor(() =>
          expect(router.state.location.pathname).toBe("/tools/grow-help-toolkit"),
        );
        expect(router.state.location.searchStr).toBe(suffix ? "?ref=qa" : "");
        expect(router.state.location.hash.replace(/^#/, "")).toBe(suffix ? "top" : "");
      } finally {
        history.destroy();
      }
    },
  );
});
