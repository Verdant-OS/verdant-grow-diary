import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  HeadContent,
  RouterContextProvider,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
} from "@/constants/strainReferenceLibrary";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";
import { CultivarSlugRouteRules } from "@/lib/cultivarSlugRouteRules";
import { getRouter } from "@/router";
import { Route as CultivarSlugRoute } from "@/routes/cultivars.$slug";
import type { RootRouteContext } from "@/routes/__root";

const flags = vi.hoisted(() => ({ cultivarDatabaseReadsEnabled: false }));
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  fail: false,
}));

vi.mock("@/lib/featureFlags", () => ({ featureFlags: flags }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const rows = db.tables[table] ?? [];
      return {
        select() {
          const result = db.fail
            ? { data: null, error: { message: "unavailable" } }
            : { data: rows, error: null };
          return Object.assign(Promise.resolve(result), {
            eq(column: string, value: string) {
              return Promise.resolve(
                db.fail
                  ? { data: null, error: { message: "unavailable" } }
                  : {
                      data: rows.filter(
                        (row) => (row as Record<string, unknown>)[column] === value,
                      ),
                      error: null,
                    },
              );
            },
          });
        },
      };
    },
  },
}));

function seedDbOnly() {
  const sour = VERDANT_CULTIVARS.find((profile) => profile.slug === "sour-stomper");
  if (!sour) throw new Error("sour-stomper missing");
  const extra = {
    ...sour,
    slug: "db-only-cut",
    name: "DB Only Cut",
    aliases: [],
    verificationStatus: "verified" as const,
    dataOrigin: "editorial" as const,
    difficulty: "Intermediate" as const,
  };
  db.tables = cultivarSeedPayloadToSnapshot(
    buildCultivarDatabaseSeedPayload({
      profiles: [...VERDANT_CULTIVARS, extra],
      sources: CULTIVAR_SOURCES,
      sectionsFor: getCultivarGuideSections,
    }),
  ) as unknown as Record<string, unknown[]>;
}

describe("cultivar unknown-slug SSR follow-up", () => {
  beforeEach(() => {
    flags.cultivarDatabaseReadsEnabled = false;
    db.tables = {};
    db.fail = false;
    CultivarSlugRouteRules.resetRequestCache();
  });

  it("server-rendered head for an unknown slug omits og:url and canonical", async () => {
    const router = getRouter();
    router.update({
      ...router.options,
      history: createMemoryHistory({
        initialEntries: ["/cultivars/not-a-real-cultivar"],
      }),
    });
    await router.load();
    const html = renderToStaticMarkup(
      React.createElement(RouterContextProvider, {
        router,
        children: React.createElement(HeadContent),
      }),
    );
    const fragment = JSDOM.fragment(html);
    expect(fragment.querySelector('meta[property="og:url"]')).toBeNull();
    expect(fragment.querySelector('link[rel="canonical"]')).toBeNull();
    expect(html).not.toContain("og:url");
    expect(html).not.toContain("canonical");
    expect(
      [...fragment.querySelectorAll('meta[name="robots"]')].some(
        (meta) => meta.getAttribute("content") === "noindex, follow",
      ),
    ).toBe(true);
  });

  it("retries a failed catalog read on the next request", async () => {
    seedDbOnly();
    flags.cultivarDatabaseReadsEnabled = true;
    db.fail = true;
    const failed = await CultivarSlugRouteRules.decide("db-only-cut");
    expect(failed.status).toBe("unavailable");
    db.fail = false;
    const retried = await CultivarSlugRouteRules.decide("db-only-cut");
    expect(retried).toMatchObject({ status: "found", slug: "db-only-cut" });
  });

  it("keeps the route loader that reports unavailable as a 503 redirect", async () => {
    seedDbOnly();
    flags.cultivarDatabaseReadsEnabled = true;
    db.fail = true;
    const rootRoute = createRootRouteWithContext<RootRouteContext>()({ component: () => null });
    const slugRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/cultivars/$slug",
      loader: CultivarSlugRoute.options.loader,
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([slugRoute]),
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/cultivars/db-only-cut"] }),
      isServer: true,
    });
    await router.load();
    const result = (router as { _serverResult?: { type: string; redirect: Response } })
      ._serverResult;
    expect(result?.type).toBe("redirect");
    expect(result?.redirect.status).toBe(503);
    expect(result?.redirect.headers.get("cache-control")).toBe("no-store");
  });
});
