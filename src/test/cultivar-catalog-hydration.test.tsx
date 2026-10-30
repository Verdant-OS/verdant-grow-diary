import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
} from "@/constants/strainReferenceLibrary";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";
import {
  resetPublishedCultivarSnapshotCache,
  usePublishedCultivars,
} from "@/hooks/usePublishedCultivars";

const mocks = vi.hoisted(() => ({
  flags: { cultivarDatabaseReadsEnabled: true },
  fetch: vi.fn(),
}));
vi.mock("@/lib/featureFlags", () => ({ featureFlags: mocks.flags }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/cultivarReferenceService", () => ({
  fetchPublishedCultivarSnapshot: mocks.fetch,
}));

const bundledIntro = VERDANT_CULTIVARS.find((item) => item.slug === "sour-diesel")!.intro;
const databaseIntro = "Database-only intro for catalog hydration regression.";
let root: Root | undefined;

beforeEach(() => {
  resetPublishedCultivarSnapshotCache();
  mocks.flags.cultivarDatabaseReadsEnabled = true;
  const snapshot = cultivarSeedPayloadToSnapshot(
    buildCultivarDatabaseSeedPayload({
      profiles: VERDANT_CULTIVARS,
      sources: CULTIVAR_SOURCES,
      sectionsFor: getCultivarGuideSections,
    }),
  );
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    snapshot: {
      ...snapshot,
      cultivars: snapshot.cultivars.map((profile) =>
        profile.slug === "sour-diesel" ? { ...profile, description: databaseIntro } : profile,
      ),
    },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  resetPublishedCultivarSnapshotCache();
});

describe("cultivar catalog hydration hypothesis (VER-306)", () => {
  it.each([false, true])(
    "starts server and client on bundled data with database reads enabled (cache warm: %s)",
    async (warmCache) => {
      if (warmCache) {
        const warm = renderHook(() => usePublishedCultivars());
        await waitFor(() => expect(warm.result.current.state).toBe("database"));
        warm.unmount();
      }
      const renders: Array<{ state: string; intro: string | undefined }> = [];
      function Probe() {
        const source = usePublishedCultivars();
        const intro = source.catalog.findBySlug("sour-diesel")?.intro;
        renders.push({ state: source.state, intro });
        return <p data-state={source.state}>{intro}</p>;
      }

      const beforeServer = mocks.fetch.mock.calls.length;
      const html = renderToString(<Probe />);
      expect(mocks.fetch).toHaveBeenCalledTimes(beforeServer);
      expect(renders[0]).toEqual({ state: "loading", intro: bundledIntro });
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      renders.length = 0;
      const recoverable = vi.fn();

      await act(async () => {
        root = hydrateRoot(container, <Probe />, { onRecoverableError: recoverable });
      });
      await waitFor(() => expect(container.textContent).toBe(databaseIntro));
      expect(renders[0]).toEqual({ state: "loading", intro: bundledIntro });
      expect(container.querySelector("p")).toHaveAttribute("data-state", "database");
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(recoverable).not.toHaveBeenCalled();
    },
  );

  it("keeps the flag-disabled server and client bundled without reading a snapshot", async () => {
    mocks.flags.cultivarDatabaseReadsEnabled = false;
    function Probe() {
      const source = usePublishedCultivars();
      return <p data-state={source.state}>{source.catalog.findBySlug("sour-diesel")?.intro}</p>;
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    document.body.appendChild(container);
    const beforeHydration = container.innerHTML;
    const recoverable = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <Probe />, { onRecoverableError: recoverable });
    });
    expect(container.innerHTML).toBe(beforeHydration);
    expect(container.textContent).toBe(bundledIntro);
    expect(container.querySelector("p")).toHaveAttribute("data-state", "bundled_fallback");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
  });
});
