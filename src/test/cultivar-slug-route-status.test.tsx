import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

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
import { Route as CultivarSlugRoute } from "@/routes/cultivars.$slug";
import type { RootRouteContext } from "@/routes/__root";

const flags = vi.hoisted(() => ({ cultivarDatabaseReadsEnabled: false }));
const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));

vi.mock("@/lib/featureFlags", () => ({ featureFlags: flags }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const rows = db.tables[table] ?? [];
      return {
        select() {
          const result = { data: rows, error: null };
          return Object.assign(Promise.resolve(result), {
            eq(column: string, value: string) {
              return Promise.resolve({
                data: rows.filter((row) => (row as Record<string, unknown>)[column] === value),
                error: null,
              });
            },
          });
        },
      };
    },
  },
}));

async function loadStatus(path: string): Promise<number> {
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
  return (await import("@tanstack/react-router/ssr/server")).getSsrStatus(router);
}

describe("cultivar slug route HTTP status", () => {
  it("returns 404 for an unknown slug and 200 for a known slug", async () => {
    flags.cultivarDatabaseReadsEnabled = false;
    expect(await loadStatus("/cultivars/not-a-real-cultivar")).toBe(404);
    expect(await loadStatus("/cultivars/sour-stomper")).toBe(200);
    expect(CultivarSlugRoute.options.notFoundComponent).toBeTypeOf("function");
    expect(CultivarSlugRoute.options.loader).toBeTypeOf("function");
  });

  it("redirects a mixed-case slug to the lowercase slug", async () => {
    flags.cultivarDatabaseReadsEnabled = false;
    const decision = await CultivarSlugRouteRules.decide("Sour-Stomper");
    expect(decision).toEqual({ status: "redirect", slug: "sour-stomper" });
    await expect(loadStatus("/cultivars/Sour-Stomper")).resolves.toBeTypeOf("number");
  });

  it("does not mark a published database-only cultivar not-found or noindex", async () => {
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
    flags.cultivarDatabaseReadsEnabled = true;
    const decision = await CultivarSlugRouteRules.decide("db-only-cut");
    expect(decision.status).toBe("found");
    const head = CultivarSlugRouteRules.headFor(decision);
    expect(head.meta.find((item) => item.name === "robots")?.content).toBe("index, follow");
    expect(head.meta.some((item) => item.title === "Cultivar not found | Verdant")).toBe(false);
    expect(await loadStatus("/cultivars/db-only-cut")).toBe(200);
  });

  it("SSR head for an unknown slug is noindex and has no canonical, og:url, or JSON-LD", async () => {
    flags.cultivarDatabaseReadsEnabled = false;
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
    flags.cultivarDatabaseReadsEnabled = false;
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
