import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  confirmCreatedPlantRow,
  primeConfirmedPlantCaches,
} from "@/lib/confirmedPlantCacheService";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLANT_ID = "99999999-9999-4999-8999-999999999999";

const ROW = {
  candidate_label: null,
  candidate_number: null,
  created_at: "2026-08-21T17:45:00.000Z",
  grow_id: GROW_ID,
  health: "healthy",
  id: PLANT_ID,
  is_archived: false,
  last_note: null,
  medium: null,
  name: "Visible Plant",
  pheno_hunt_id: null,
  photo_url: null,
  plant_type: "unknown",
  pot_size: null,
  schema_version: 1,
  stage: "seedling",
  started_at: "2026-08-21T17:45:00.000Z",
  strain: null,
  tent_id: TENT_ID,
  updated_at: "2026-08-21T17:45:00.000Z",
  user_id: OWNER_ID,
} as const;

describe("confirmedPlantCacheService", () => {
  it("rejects malformed or hierarchy-mismatched insert responses before cache writes", () => {
    expect(
      confirmCreatedPlantRow(null, { ownerId: OWNER_ID, growId: GROW_ID, tentId: TENT_ID }),
    ).toBeNull();
    expect(
      confirmCreatedPlantRow(
        { ...ROW, user_id: "22222222-2222-4222-8222-222222222222" },
        {
          ownerId: OWNER_ID,
          growId: GROW_ID,
          tentId: TENT_ID,
        },
      ),
    ).toBeNull();
    expect(
      confirmCreatedPlantRow(
        { ...ROW, grow_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        {
          ownerId: OWNER_ID,
          growId: GROW_ID,
          tentId: TENT_ID,
        },
      ),
    ).toBeNull();
    expect(
      confirmCreatedPlantRow(
        { ...ROW, tent_id: null },
        {
          ownerId: OWNER_ID,
          growId: GROW_ID,
          tentId: TENT_ID,
        },
      ),
    ).toBeNull();
    expect(
      confirmCreatedPlantRow(
        { ...ROW, is_archived: true },
        {
          ownerId: OWNER_ID,
          growId: GROW_ID,
          tentId: TENT_ID,
        },
      ),
    ).toBeNull();
  });

  it("appends raw legacy rows, prepends mapped grow rows, and leaves unrelated caches intact", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyKey = ["plants"] as const;
    const growKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    const unrelatedKey = [
      "grow",
      "plants",
      "all",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "owner",
      OWNER_ID,
    ] as const;
    const absentMatchingKey = ["grow", "plants", TENT_ID, GROW_ID, "owner", OWNER_ID] as const;
    const olderId = "88888888-8888-4888-8888-888888888888";
    const olderRaw = {
      ...ROW,
      id: olderId,
      name: "Older Plant",
      created_at: "2026-08-20T12:00:00.000Z",
      started_at: "2026-08-20T12:00:00.000Z",
    };
    const olderMapped = {
      id: olderId,
      name: "Older Plant",
      strain: "",
      tentId: TENT_ID,
      stage: "seedling",
      startedAt: "2026-08-20T12:00:00.000Z",
      health: "healthy",
      photo: "",
      lastNote: "",
      growId: GROW_ID,
      isArchived: false,
      medium: null,
      potSize: null,
      plantType: "unknown",
    };
    const confirmedRow = {
      ...ROW,
      // Grow lists are ordered by created_at, not the plant's biological start.
      started_at: "2026-01-01T12:00:00.000Z",
    };
    client.setQueryData(legacyKey, [olderRaw]);
    client.setQueryData(growKey, [olderMapped]);
    client.setQueryData(unrelatedKey, [olderMapped]);
    const unrelatedBefore = client.getQueryData(unrelatedKey);
    const confirmed = confirmCreatedPlantRow(confirmedRow, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => true,
    });

    expect(client.getQueryData<Array<{ id: string }>>(legacyKey)?.map((row) => row.id)).toEqual([
      olderId,
      PLANT_ID,
    ]);
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
      olderId,
    ]);
    expect(client.getQueryData(unrelatedKey)).toBe(unrelatedBefore);
    expect(client.getQueryData(absentMatchingKey)).toBeUndefined();

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => true,
    });
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
      olderId,
    ]);
  });

  it("cancels an in-flight stale grow-list read before retaining the confirmed row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    let resolveStaleRead!: (rows: unknown[]) => void;
    const staleRead = new Promise<unknown[]>((resolve) => {
      resolveStaleRead = resolve;
    });
    const queryFn = vi.fn(() => staleRead);
    client.setQueryData(queryKey, []);
    const observer = new QueryObserver(client, { queryKey, queryFn, retry: false, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    const confirmed = confirmCreatedPlantRow(ROW, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();
    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => true,
    });
    expect(client.getQueryData<Array<{ id: string }>>(queryKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);

    resolveStaleRead([]);
    await vi.waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle"));
    expect(client.getQueryData<Array<{ id: string }>>(queryKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);

    unsubscribe();
  });

  it("seeds already-running legacy and owner-scoped queries whose data is still undefined", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyKey = ["plants"] as const;
    const growKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    let resolveLegacy!: (rows: unknown[]) => void;
    let resolveGrow!: (rows: unknown[]) => void;
    const legacyRead = new Promise<unknown[]>((resolve) => {
      resolveLegacy = resolve;
    });
    const growRead = new Promise<unknown[]>((resolve) => {
      resolveGrow = resolve;
    });
    const legacyObserver = new QueryObserver(client, {
      queryKey: legacyKey,
      queryFn: () => legacyRead,
      retry: false,
    });
    const growObserver = new QueryObserver(client, {
      queryKey: growKey,
      queryFn: () => growRead,
      retry: false,
    });
    const unsubscribeLegacy = legacyObserver.subscribe(() => {});
    const unsubscribeGrow = growObserver.subscribe(() => {});
    await vi.waitFor(() => {
      expect(client.getQueryState(legacyKey)?.fetchStatus).toBe("fetching");
      expect(client.getQueryState(growKey)?.fetchStatus).toBe("fetching");
    });
    expect(client.getQueryData(legacyKey)).toBeUndefined();
    expect(client.getQueryData(growKey)).toBeUndefined();

    const confirmed = confirmCreatedPlantRow(ROW, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();
    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => true,
    });

    expect(client.getQueryData<Array<{ id: string }>>(legacyKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);

    resolveLegacy([]);
    resolveGrow([]);
    await vi.waitFor(() => {
      expect(client.getQueryState(legacyKey)?.fetchStatus).toBe("idle");
      expect(client.getQueryState(growKey)?.fetchStatus).toBe("idle");
    });
    expect(client.getQueryData<Array<{ id: string }>>(legacyKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);

    unsubscribeLegacy();
    unsubscribeGrow();
  });

  it("retains the confirmed row when already-erroring undefined caches fail reconciliation again", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyKey = ["plants"] as const;
    const growKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    const legacyQueryFn = vi.fn().mockRejectedValue(new Error("legacy refresh failed"));
    const growQueryFn = vi.fn().mockRejectedValue(new Error("grow refresh failed"));
    const legacyObserver = new QueryObserver(client, {
      queryKey: legacyKey,
      queryFn: legacyQueryFn,
      retry: false,
    });
    const growObserver = new QueryObserver(client, {
      queryKey: growKey,
      queryFn: growQueryFn,
      retry: false,
    });
    const unsubscribeLegacy = legacyObserver.subscribe(() => {});
    const unsubscribeGrow = growObserver.subscribe(() => {});

    await vi.waitFor(() => {
      expect(client.getQueryState(legacyKey)?.status).toBe("error");
      expect(client.getQueryState(growKey)?.status).toBe("error");
    });
    expect(client.getQueryData(legacyKey)).toBeUndefined();
    expect(client.getQueryData(growKey)).toBeUndefined();

    const confirmed = confirmCreatedPlantRow(ROW, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();
    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => true,
    });

    expect(client.getQueryData<Array<{ id: string }>>(legacyKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);

    await Promise.allSettled([
      client.invalidateQueries({ queryKey: legacyKey, exact: true }),
      client.invalidateQueries({ queryKey: growKey, exact: true }),
    ]);
    await vi.waitFor(() => {
      expect(client.getQueryState(legacyKey)?.status).toBe("error");
      expect(client.getQueryState(growKey)?.status).toBe("error");
    });
    expect(client.getQueryData<Array<{ id: string }>>(legacyKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);
    expect(client.getQueryData<Array<{ id: string }>>(growKey)?.map((row) => row.id)).toEqual([
      PLANT_ID,
    ]);
    expect(legacyQueryFn).toHaveBeenCalledTimes(2);
    expect(growQueryFn).toHaveBeenCalledTimes(2);

    unsubscribeLegacy();
    unsubscribeGrow();
  });

  it("does not publish a late confirmed row after the authenticated owner changes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyKey = ["plants"] as const;
    const growKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    const otherOwnerRow = {
      ...ROW,
      id: "77777777-7777-4777-8777-777777777777",
      user_id: OTHER_OWNER_ID,
    };
    client.setQueryData(legacyKey, [otherOwnerRow]);
    client.setQueryData(growKey, []);
    let currentOwnerId = OWNER_ID;
    const originalCancelQueries = client.cancelQueries.bind(client);
    vi.spyOn(client, "cancelQueries").mockImplementation(async (filters, options) => {
      const result = await originalCancelQueries(filters, options);
      currentOwnerId = OTHER_OWNER_ID;
      return result;
    });
    const confirmed = confirmCreatedPlantRow(ROW, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      isOwnerCurrent: () => currentOwnerId === OWNER_ID,
    });

    expect(client.getQueryData(legacyKey)).toEqual([otherOwnerRow]);
    expect(client.getQueryData(growKey)).toEqual([]);
  });

  it("does not recreate cleared owner caches or append into a replacement legacy query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyKey = ["plants"] as const;
    const growKey = ["grow", "plants", "all", GROW_ID, "owner", OWNER_ID] as const;
    const replacementRow = {
      ...ROW,
      id: "66666666-6666-4666-8666-666666666666",
      user_id: OTHER_OWNER_ID,
    };
    client.setQueryData(legacyKey, []);
    client.setQueryData(growKey, []);
    const originalCancelQueries = client.cancelQueries.bind(client);
    let identityCacheCleared = false;
    vi.spyOn(client, "cancelQueries").mockImplementation(async (filters, options) => {
      const result = await originalCancelQueries(filters, options);
      if (!identityCacheCleared) {
        identityCacheCleared = true;
        client.clear();
        client.setQueryData(legacyKey, [replacementRow]);
      }
      return result;
    });
    const confirmed = confirmCreatedPlantRow(ROW, {
      ownerId: OWNER_ID,
      growId: GROW_ID,
      tentId: TENT_ID,
    });
    expect(confirmed).not.toBeNull();

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!, {
      // Query identity must independently protect the cache-clear boundary.
      isOwnerCurrent: () => true,
    });

    expect(client.getQueryData(legacyKey)).toEqual([replacementRow]);
    expect(client.getQueryData(growKey)).toBeUndefined();
  });
});
