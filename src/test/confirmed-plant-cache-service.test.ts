import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  confirmCreatedPlantRow,
  primeConfirmedPlantCaches,
} from "@/lib/confirmedPlantCacheService";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
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

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!);

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

    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!);
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
    await primeConfirmedPlantCaches(client, OWNER_ID, confirmed!);
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
});
