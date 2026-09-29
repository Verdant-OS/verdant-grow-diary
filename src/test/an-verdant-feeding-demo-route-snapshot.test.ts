/**
 * Route-snapshot guard: the AN × Verdant feeding demo stays a public,
 * unlinked fixture with noindex/nofollow head metadata.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createMemoryHistory, HeadContent, RouterContextProvider } from "@tanstack/react-router";
import { describe, it, expect } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { getRouter } from "@/router";

const ROUTE = "/internal/demo-advanced-nutrients-feeding";

async function resolvedRobotsHead(pathname: string) {
  const router = getRouter();
  router.update({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  await router.load();

  const html = renderToStaticMarkup(
    React.createElement(RouterContextProvider, {
      router,
      children: React.createElement(HeadContent),
    }),
  );
  const fragment = JSDOM.fragment(html);

  return {
    routeIds: router.state.matches.map((match) => match.routeId),
    robots: [...fragment.querySelectorAll<HTMLMetaElement>('meta[name="robots"]')].map((meta) =>
      meta.getAttribute("content"),
    ),
  };
}

describe("AN × Verdant feeding demo — route snapshot", () => {
  it("manifest declares a public fixture-only demo route", () => {
    const entry = APP_ROUTES.find((r) => r.path === ROUTE);
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("public");
    expect(entry?.description).toMatch(/fixture/i);
    expect(entry?.description).toMatch(/in-memory/i);
  });

  it("resolves exactly one composed noindex, nofollow robots directive", async () => {
    const head = await resolvedRobotsHead(ROUTE);

    expect(head.routeIds).toEqual(["__root__", ROUTE]);
    expect(head.robots).toEqual(["noindex, nofollow"]);
  });
});
