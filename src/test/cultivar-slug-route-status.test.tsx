import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
} from "@/constants/strainReferenceLibrary";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";
import { mapCultivarDatabaseSnapshot } from "@/lib/cultivarDatabaseReadModel";
import { cultivarVerificationIsSearchIndexable } from "@/lib/cultivarDetailSeo";
import { CultivarSlugRouteRules } from "@/lib/cultivarSlugRouteRules";
import { CultivarSlugRouteService } from "@/lib/cultivarSlugRouteService";
import CultivarPage from "@/pages/CultivarPage";
import { Route as CultivarSlugRoute } from "@/routes/cultivars.$slug";
import type { RootRouteContext } from "@/routes/__root";

const flags = vi.hoisted(() => ({ cultivarDatabaseReadsEnabled: false }));
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  reads: 0,
  fail: false,
}));

vi.mock("@/lib/featureFlags", () => ({ featureFlags: flags }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      db.reads += 1;
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

type ServerResult = { type: "render"; status: number } | { type: "redirect"; redirect: Response };

async function loadRouter(path: string) {
  const rootRoute = createRootRouteWithContext<RootRouteContext>()({ component: () => null });
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cultivars/$slug",
    loader: CultivarSlugRoute.options.loader,
    notFoundComponent: CultivarSlugRoute.options.notFoundComponent,
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute]),
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
  await router.load();
  return router as typeof router & { _serverResult?: ServerResult };
}

async function loadStatus(path: string): Promise<number> {
  const router = await loadRouter(path);
  return (await import("@tanstack/react-router/ssr/server")).getSsrStatus(router);
}

function seedDbOnlyVerified() {
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
  const cultivars = (db.tables.cultivars ?? []).map((row) =>
    (row as { slug?: string }).slug === "db-only-cut"
      ? {
          ...(row as Record<string, unknown>),
          verification_status: "verified",
          data_origin: "editorial",
        }
      : row,
  );
  db.tables = { ...db.tables, cultivars };
}

describe("cultivar slug route HTTP status", () => {
  beforeEach(() => {
    flags.cultivarDatabaseReadsEnabled = false;
    db.tables = {};
    db.reads = 0;
    db.fail = false;
    CultivarSlugRouteService.resetRequestCache();
  });

  it("returns 404 for an unknown slug and 200 for a known slug", async () => {
    const missing = await loadRouter("/cultivars/not-a-real-cultivar");
    expect(missing._serverResult).toMatchObject({ type: "render", status: 404 });
    expect((await import("@tanstack/react-router/ssr/server")).getSsrStatus(missing)).toBe(404);
    expect(await loadStatus("/cultivars/sour-stomper")).toBe(200);
    expect(CultivarSlugRoute.options.notFoundComponent).toBeTypeOf("function");
    expect(CultivarSlugRoute.options.loader).toBeTypeOf("function");
  });

  it("redirects a mixed-case slug with 308 and a Location header", async () => {
    const decision = await CultivarSlugRouteService.decide("Sour-Stomper");
    expect(decision).toEqual({ status: "redirect", slug: "sour-stomper" });
    const router = await loadRouter("/cultivars/Sour-Stomper");
    expect(router._serverResult?.type).toBe("redirect");
    if (router._serverResult?.type !== "redirect") throw new Error("expected redirect");
    expect(router._serverResult.redirect.status).toBe(308);
    expect(router._serverResult.redirect.headers.get("location")).toBe("/cultivars/sour-stomper");
  });

  it("keeps a published database-only cultivar found, sample, and noindex", async () => {
    seedDbOnlyVerified();
    flags.cultivarDatabaseReadsEnabled = true;
    const decision = await CultivarSlugRouteService.decide("db-only-cut");
    expect(decision.status).toBe("found");
    if (decision.status !== "found") throw new Error("expected found");
    expect(decision.profile?.verificationStatus).toBe("sample");
    expect(decision.profile?.dataOrigin).toBe("sample");
    const head = CultivarSlugRouteRules.headFor(decision);
    expect(head.meta.find((item) => item.name === "robots")?.content).toBe("noindex, follow");
    expect(head.links ?? []).toEqual([]);
    expect(JSON.stringify(head)).not.toContain("canonical");
    expect(JSON.stringify(head)).not.toContain("og:url");
    expect(await loadStatus("/cultivars/db-only-cut")).toBe(200);
    render(
      <MemoryRouter initialEntries={["/cultivars/db-only-cut"]}>
        <Routes>
          <Route
            path="/cultivars/:slug"
            element={<CultivarPage routeProfile={decision.profile} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Start your DB Only Cut diary")).toBeNull();
    expect(screen.queryByText(/The public record has no finished home harvest/)).toBeNull();
  });

  it("fetches the published snapshot once for the loader and the head", async () => {
    seedDbOnlyVerified();
    flags.cultivarDatabaseReadsEnabled = true;
    db.reads = 0;
    const loader = CultivarSlugRoute.options.loader;
    const head = CultivarSlugRoute.options.head;
    if (typeof loader !== "function" || typeof head !== "function") {
      throw new Error("cultivar route loader and head must be functions");
    }
    await Promise.all([
      loader({ params: { slug: "db-only-cut" } } as never),
      head({ params: { slug: "db-only-cut" } } as never),
    ]);
    const once = db.reads;
    expect(once).toBeGreaterThan(0);
    CultivarSlugRouteService.resetRequestCache();
    db.reads = 0;
    await CultivarSlugRouteService.decide("db-only-cut");
    expect(db.reads).toBe(once);
  });

  it("returns 503 instead of a cacheable 404 when the database read fails", async () => {
    flags.cultivarDatabaseReadsEnabled = true;
    db.fail = true;
    const router = await loadRouter("/cultivars/db-only-cut");
    expect(router._serverResult?.type).toBe("redirect");
    if (router._serverResult?.type !== "redirect") throw new Error("expected unavailable");
    expect(router._serverResult.redirect.status).toBe(503);
    expect(router._serverResult.redirect.headers.get("cache-control")).toBe("no-store");
    expect(router._serverResult.redirect.status).not.toBe(404);
    CultivarSlugRouteService.resetRequestCache();
    expect(await loadStatus("/cultivars/sour-stomper")).toBe(200);
  });

  it("SSR head for an unknown slug is noindex and has no canonical, og:url, or JSON-LD", async () => {
    const head = await CultivarSlugRoute.options.head?.({
      params: { slug: "not-a-real-cultivar" },
    } as never);
    const meta = head?.meta ?? [];
    expect(meta).toEqual([
      { title: "Cultivar not found | Verdant" },
      { name: "robots", content: "noindex, follow" },
    ]);
    expect(head?.links ?? []).toEqual([]);
    expect(head?.scripts ?? []).toEqual([]);
    expect(JSON.stringify(head)).not.toContain("og:url");
    expect(JSON.stringify(head)).not.toContain("canonical");
    expect(JSON.stringify(head)).not.toContain("ld+json");
  });

  it("SSR head for a known sample slug is the static document, not the not-found head", async () => {
    const head = await CultivarSlugRoute.options.head?.({
      params: { slug: "sour-stomper" },
    } as never);
    const meta = head?.meta ?? [];
    const links = head?.links ?? [];
    expect(meta.find((item) => item?.title?.includes("Cultivar not found"))).toBeUndefined();
    expect(meta.find((item) => item?.name === "robots")?.content).toBe("noindex, follow");
    expect(links.some((link) => link?.rel === "canonical")).toBe(true);
  });

  it("records a null difficulty and keeps the row sample and noindex", () => {
    const payload = buildCultivarDatabaseSeedPayload({
      profiles: VERDANT_CULTIVARS,
      sources: CULTIVAR_SOURCES,
      sectionsFor: getCultivarGuideSections,
    });
    const snapshot = cultivarSeedPayloadToSnapshot(payload);
    const cultivars = snapshot.cultivars.map((item) =>
      item.slug === "gg4" ? { ...item, difficulty: null, data_origin: "editorial" } : item,
    );
    const mapped = mapCultivarDatabaseSnapshot({ ...snapshot, cultivars });
    const profile = mapped.catalog.profiles.find((item) => item.slug === "gg4");
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "gg4",
          path: "cultivars.difficulty",
          message: "null difficulty is unverified; the profile stays sample and noindex",
        }),
      ]),
    );
    expect(profile?.difficulty).toBeNull();
    expect(profile?.verificationStatus).toBe("sample");
    expect(profile?.dataOrigin).toBe("sample");
    expect(profile ? cultivarVerificationIsSearchIndexable(profile.verificationStatus) : true).toBe(
      false,
    );
  });
});
