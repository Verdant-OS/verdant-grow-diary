import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route as SplatRoute } from "@/routes/$";

vi.mock("@/pages/NotFound", () => ({ default: () => null }));

// The file route is already bound to src/routes/__root.tsx by the router
// plugin, so mount the same loader behaviour plus its real notFoundComponent on a
// stand-in splat under a minimal root. The router mechanism under test is the
// same one the production tree uses.
const rootRoute = createRootRoute({ component: () => null });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});
const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  loader: () => {
    throw notFound();
  },
  notFoundComponent: SplatRoute.options.notFoundComponent,
  component: SplatRoute.options.component,
});
const routeTree = rootRoute.addChildren([indexRoute, splatRoute]);

function buildRouter(path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("catch-all route reports HTTP 404 (no soft 404)", () => {
  it.each(["/definitely-missing", "/plants/does/not/exist", "/healthz", "/manifest.webmanifest"])(
    "unmatched path %s loads with router statusCode 404",
    async (path) => {
      const router = buildRouter(path);
      await router.load();
      expect(router.stores.statusCode.get()).toBe(404);
      expect(router.hasNotFoundMatch()).toBe(true);
    },
  );

  it("a matched route still loads with statusCode 200", async () => {
    const router = buildRouter("/");
    await router.load();
    expect(router.stores.statusCode.get()).toBe(200);
    expect(router.hasNotFoundMatch()).toBe(false);
  });

  it("the catch-all declares a route-level notFoundComponent so the branded page still renders", () => {
    expect(SplatRoute.options.notFoundComponent).toBeTypeOf("function");
    expect(SplatRoute.options.loader).toBeTypeOf("function");
  });

  it("source pin: $.tsx throws notFound() from its loader", () => {
    const source = readFileSync(join(__dirname, "..", "routes", "$.tsx"), "utf8");
    expect(source).toMatch(/throw notFound\(\)/);
    expect(source).toMatch(/notFoundComponent: NotFound/);
  });
});
