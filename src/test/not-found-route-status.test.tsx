import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { healthResponseFor, withHostHeaders } from "@/lib/cloudflareHostRoutingRules";
import { Route as SplatRoute } from "@/routes/$";
import type { RootRouteContext } from "@/routes/__root";

vi.mock("@/pages/NotFound", () => ({ default: () => null }));

// The file route is already bound to src/routes/__root.tsx by the router
// plugin, so mount its production loader and components on a splat under a
// minimal root. Status assertions must exercise the real loader so removing its
// notFound() throw fails this regression.
const rootRoute = createRootRouteWithContext<RootRouteContext>()({
  component: () => null,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});
const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  loader: SplatRoute.options.loader,
  notFoundComponent: SplatRoute.options.notFoundComponent,
  component: SplatRoute.options.component,
});
const routeTree = rootRoute.addChildren([indexRoute, splatRoute]);

function buildRouter(path: string) {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("catch-all route reports HTTP 404 (no soft 404)", () => {
  it.each(["/definitely-missing", "/plants/does/not/exist", "/manifest.webmanifest"])(
    "unmatched path %s loads with router statusCode 404",
    async (path) => {
      const router = buildRouter(path);
      await router.load();
      expect(router.stores.statusCode.get()).toBe(404);
      expect(router.hasNotFoundMatch()).toBe(true);
    },
  );

  it("answers /healthz with 200 and no app data", async () => {
    const request = new Request("https://verdantgrowdiary.com/healthz?unused=1");
    const health = healthResponseFor(request);
    expect(health).not.toBeNull();
    const response = withHostHeaders(request, health!);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe('{"ok":true}');
    expect(JSON.parse(body)).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(healthResponseFor(new Request("https://verdantgrowdiary.com/healthz/extra"))).toBeNull();
    expect(
      healthResponseFor(new Request("https://verdantgrowdiary.com/manifest.webmanifest")),
    ).toBeNull();
  });

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
});
