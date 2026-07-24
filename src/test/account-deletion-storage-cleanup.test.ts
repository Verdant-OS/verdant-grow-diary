import { describe, expect, it, vi } from "vitest";
import {
  deleteOwnedStorage,
  type AccountStorageApi,
} from "../../supabase/functions/delete-account/ownedStorageCleanup";

interface Entry {
  id: string | null;
  name: string;
}

function storageFixture(
  tree: Record<string, Record<string, Entry[]>>,
  bucketIds = Object.keys(tree),
) {
  const removed: Record<string, string[][]> = {};
  const storage: AccountStorageApi = {
    listBuckets: vi.fn(async () => ({
      data: bucketIds.map((id) => ({ id })),
      error: null,
    })),
    from(bucketName) {
      return {
        list: vi.fn(async (path, options) => ({
          data: (tree[bucketName]?.[path] ?? []).slice(
            options.offset,
            options.offset + options.limit,
          ),
          error: null,
        })),
        remove: vi.fn(async (paths) => {
          (removed[bucketName] ??= []).push(paths);
          return { data: paths, error: null };
        }),
      };
    },
  };
  return { storage, removed };
}

describe("account-owned Storage cleanup", () => {
  it("walks nested owner folders and removes files through the Storage API", async () => {
    const { storage, removed } = storageFixture({
      "diary-photos": {
        "user-1": [
          { id: null, name: "grow-1" },
          { id: "file-root", name: "root.jpg" },
        ],
        "user-1/grow-1": [{ id: null, name: "plant-profiles" }],
        "user-1/grow-1/plant-profiles": [{ id: "file-deep", name: "leaf.jpg" }],
      },
      "diary-videos": {
        "user-1": [{ id: "video-1", name: "clip.mp4" }],
      },
    });

    await expect(deleteOwnedStorage(storage, "user-1")).resolves.toEqual({
      ok: true,
      deleted: 3,
    });
    expect(removed["diary-photos"]).toEqual([
      ["user-1/grow-1/plant-profiles/leaf.jpg", "user-1/root.jpg"],
    ]);
    expect(removed["diary-videos"]).toEqual([["user-1/clip.mp4"]]);
  });

  it("paginates owner folders instead of silently leaving the 101st object", async () => {
    const files = Array.from({ length: 101 }, (_, index) => ({
      id: `file-${index}`,
      name: `${String(index).padStart(3, "0")}.jpg`,
    }));
    const { storage, removed } = storageFixture({
      "diary-photos": { "user-1": files },
    });

    await expect(deleteOwnedStorage(storage, "user-1")).resolves.toEqual({
      ok: true,
      deleted: 101,
    });
    expect(removed["diary-photos"].flat()).toHaveLength(101);
  });

  it("skips known buckets that are not provisioned", async () => {
    const { storage } = storageFixture({}, []);
    await expect(deleteOwnedStorage(storage, "user-1")).resolves.toEqual({
      ok: true,
      deleted: 0,
    });
  });

  it("fails closed on unsafe folder entries", async () => {
    const { storage, removed } = storageFixture({
      "diary-photos": { "user-1": [{ id: null, name: ".." }] },
    });
    await expect(deleteOwnedStorage(storage, "user-1")).resolves.toEqual({ ok: false });
    expect(removed).toEqual({});
  });

  it("fails closed when bucket discovery fails", async () => {
    const { storage } = storageFixture({});
    vi.mocked(storage.listBuckets).mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });
    await expect(deleteOwnedStorage(storage, "user-1")).resolves.toEqual({ ok: false });
  });
});
