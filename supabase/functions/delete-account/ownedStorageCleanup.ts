/**
 * Deletes every object under the authenticated user's prefix in Verdant's
 * owner-scoped buckets. Supabase requires Storage API deletion; deleting
 * storage.objects rows directly would orphan the underlying files.
 */

export const ACCOUNT_STORAGE_BUCKETS = ["diary-photos", "diary-videos", "verdant"] as const;

const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 1000;
const MAX_FOLDER_DEPTH = 20;
const MAX_ACCOUNT_OBJECTS = 20_000;

interface StorageError {
  message?: string;
}

interface BucketRecord {
  id?: string | null;
  name?: string | null;
}

interface StorageListEntry {
  id: string | null;
  name: string;
}

interface StorageBucketApi {
  list(
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: "name"; order: "asc" };
    },
  ): Promise<{ data: StorageListEntry[] | null; error: StorageError | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: StorageError | null }>;
}

export interface AccountStorageApi {
  listBuckets(): Promise<{ data: BucketRecord[] | null; error: StorageError | null }>;
  from(bucket: string): StorageBucketApi;
}

export type OwnedStorageCleanupResult = { ok: true; deleted: number } | { ok: false };

function safeChildName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(name)
  );
}

async function collectFiles(
  bucket: StorageBucketApi,
  path: string,
  depth: number,
  files: string[],
): Promise<boolean> {
  if (depth > MAX_FOLDER_DEPTH) return false;

  let offset = 0;
  while (true) {
    const page = await bucket.list(path, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (page.error || !Array.isArray(page.data)) return false;

    for (const entry of page.data) {
      if (!safeChildName(entry.name)) return false;
      const childPath = `${path}/${entry.name}`;
      if (entry.id === null) {
        if (!(await collectFiles(bucket, childPath, depth + 1, files))) {
          return false;
        }
      } else {
        files.push(childPath);
        if (files.length > MAX_ACCOUNT_OBJECTS) return false;
      }
    }

    if (page.data.length < LIST_PAGE_SIZE) return true;
    offset += page.data.length;
  }
}

export async function deleteOwnedStorage(
  storage: AccountStorageApi,
  userId: string,
): Promise<OwnedStorageCleanupResult> {
  if (!safeChildName(userId)) return { ok: false };

  const bucketList = await storage.listBuckets();
  if (bucketList.error || !Array.isArray(bucketList.data)) return { ok: false };

  const existing = new Set(
    bucketList.data
      .map((bucket) => bucket.id ?? bucket.name ?? null)
      .filter((name): name is string => typeof name === "string"),
  );

  let deleted = 0;
  for (const bucketName of ACCOUNT_STORAGE_BUCKETS) {
    if (!existing.has(bucketName)) continue;

    const bucket = storage.from(bucketName);
    const files: string[] = [];
    if (!(await collectFiles(bucket, userId, 0, files))) return { ok: false };

    for (let index = 0; index < files.length; index += REMOVE_BATCH_SIZE) {
      const batch = files.slice(index, index + REMOVE_BATCH_SIZE);
      const result = await bucket.remove(batch);
      if (result.error) return { ok: false };
      deleted += batch.length;
    }
  }

  return { ok: true, deleted };
}
