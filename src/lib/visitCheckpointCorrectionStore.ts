import { isUuid } from "@/lib/isUuid";
import { newQuickLogSaveKey } from "@/lib/quickLogIdempotencyKey";

type CheckpointStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface PendingCheckpointCorrection {
  version: 1;
  ownerId: string;
  diaryEntryId: string;
  intent: string;
  idempotencyKey: string;
}

export type CheckpointCorrectionClaim =
  { status: "claimed"; idempotencyKey: string } | { status: "conflict" } | { status: "blocked" };

const storageKey = (ownerId: string, diaryEntryId: string) =>
  `verdant:checkpoint:pending-correction:v1:${ownerId}:${diaryEntryId}`;

function validIdentity(ownerId: string, diaryEntryId: string, intent: string): boolean {
  return (
    typeof ownerId === "string" &&
    typeof diaryEntryId === "string" &&
    typeof intent === "string" &&
    isUuid(ownerId) &&
    isUuid(diaryEntryId) &&
    ownerId === ownerId.toLowerCase() &&
    diaryEntryId === diaryEntryId.toLowerCase() &&
    intent.length > 0 &&
    intent.length <= 5000
  );
}

function read(
  storage: CheckpointStorage,
  ownerId: string,
  diaryEntryId: string,
): PendingCheckpointCorrection | null | "blocked" {
  const raw = storage.getItem(storageKey(ownerId, diaryEntryId));
  if (raw === null) return null;
  if (raw.length > 8192) return "blocked";
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 5 ||
    !("version" in value) ||
    value.version !== 1 ||
    !("ownerId" in value) ||
    value.ownerId !== ownerId ||
    !("diaryEntryId" in value) ||
    value.diaryEntryId !== diaryEntryId ||
    !("intent" in value) ||
    typeof value.intent !== "string" ||
    !validIdentity(ownerId, diaryEntryId, value.intent) ||
    !("idempotencyKey" in value) ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 200
  ) {
    return "blocked";
  }
  return value as PendingCheckpointCorrection;
}

/** A lost reply must reuse its original key, even after a route remount or reload. */
export function createCheckpointCorrectionJournal(
  getStorage: () => CheckpointStorage = () => window.sessionStorage,
  createKey: () => string = newQuickLogSaveKey,
) {
  return {
    claim(ownerId: string, diaryEntryId: string, intent: string): CheckpointCorrectionClaim {
      if (!validIdentity(ownerId, diaryEntryId, intent)) return { status: "blocked" };
      try {
        const storage = getStorage();
        const current = read(storage, ownerId, diaryEntryId);
        if (current === "blocked") return { status: "blocked" };
        if (current) {
          return current.intent === intent
            ? { status: "claimed", idempotencyKey: current.idempotencyKey }
            : { status: "conflict" };
        }
        const idempotencyKey = createKey();
        if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return { status: "blocked" };
        const raw = JSON.stringify({ version: 1, ownerId, diaryEntryId, intent, idempotencyKey });
        storage.setItem(storageKey(ownerId, diaryEntryId), raw);
        if (storage.getItem(storageKey(ownerId, diaryEntryId)) !== raw)
          return { status: "blocked" };
        return { status: "claimed", idempotencyKey };
      } catch {
        return { status: "blocked" };
      }
    },
    // A confirmed success is still a success if session storage refuses cleanup.
    clear(ownerId: string, diaryEntryId: string, intent: string, idempotencyKey: string): boolean {
      if (!validIdentity(ownerId, diaryEntryId, intent)) return false;
      try {
        const storage = getStorage();
        const current = read(storage, ownerId, diaryEntryId);
        if (
          !current ||
          current === "blocked" ||
          current.intent !== intent ||
          current.idempotencyKey !== idempotencyKey
        )
          return false;
        storage.removeItem(storageKey(ownerId, diaryEntryId));
        return storage.getItem(storageKey(ownerId, diaryEntryId)) === null;
      } catch {
        return false;
      }
    },
  };
}
