/**
 * Grower bug report 2026-11-03, item 19: the Plant/Tent name fields warn about
 * near-duplicates using the already-loaded lists, never blocking the save.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PLANTS_QUERY_KEY } from "@/hooks/use-plants";
import { TENTS_QUERY_KEY } from "@/hooks/use-tents";
import {
  SIMILAR_NAME_CACHE_KEYS,
  SimilarNameWarningNote,
} from "@/components/SimilarNameWarningNote";

afterEach(() => cleanup());

function renderNote(
  props: Parameters<typeof SimilarNameWarningNote>[0],
  cache: { plants?: unknown[]; tents?: unknown[] },
) {
  const client = new QueryClient();
  if (cache.plants) client.setQueryData(PLANTS_QUERY_KEY, cache.plants);
  if (cache.tents) client.setQueryData(TENTS_QUERY_KEY, cache.tents);
  return render(
    <QueryClientProvider client={client}>
      <SimilarNameWarningNote {...props} />
    </QueryClientProvider>,
  );
}

const plants = [
  { id: "p1", name: "Dolce di Pledge #1", grow_id: "g1" },
  { id: "p2", name: "Ducle De Pledge", grow_id: "g2" },
];

describe("SimilarNameWarningNote", () => {
  it("uses the same cache keys as the plant and tent hooks", () => {
    expect([...SIMILAR_NAME_CACHE_KEYS.plant]).toEqual([...PLANTS_QUERY_KEY]);
    expect([...SIMILAR_NAME_CACHE_KEYS.tent]).toEqual([...TENTS_QUERY_KEY]);
  });

  it("warns about a near-duplicate plant in the same grow", () => {
    renderNote(
      { entity: "plant", candidate: "Ducle De Pledge", growId: "g1", testId: "w" },
      { plants },
    );
    expect(screen.getByTestId("w")).toHaveTextContent(
      "This looks close to “Dolce di Pledge #1” in this grow.",
    );
  });

  it("ignores the same name in another grow, and plants with no grow chosen", () => {
    renderNote(
      { entity: "plant", candidate: "Ducle De Pledge", growId: "g3", testId: "w" },
      { plants },
    );
    expect(screen.queryByTestId("w")).toBeNull();
    cleanup();
    renderNote(
      { entity: "plant", candidate: "Ducle De Pledge", growId: null, testId: "w" },
      { plants },
    );
    expect(screen.queryByTestId("w")).toBeNull();
  });

  it("warns about a second tent with the same name, but not when renaming the tent itself", () => {
    const tents = [{ id: "t1", name: "Vegetation Bravo" }];
    renderNote({ entity: "tent", candidate: "Vegetation Bravo", testId: "w" }, { tents });
    expect(screen.getByTestId("w")).toHaveTextContent(
      "A tent named “Vegetation Bravo” already exists.",
    );
    cleanup();
    renderNote(
      { entity: "tent", candidate: "Vegetation Bravo", excludeId: "t1", testId: "w" },
      { tents },
    );
    expect(screen.queryByTestId("w")).toBeNull();
  });

  it("shows nothing when the list was never loaded", () => {
    renderNote({ entity: "tent", candidate: "Vegetation Bravo", testId: "w" }, {});
    expect(screen.queryByTestId("w")).toBeNull();
  });
});
