import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { parseManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationParser";
import { isUuid } from "@/lib/isUuid";
export type CorrectionJournalRead =
  | { status: "empty" }
  | { status: "blocked" }
  | { status: "pending"; operation: ManualCorrectionOperation };
export type CorrectionJournalClaim =
  | Exclude<CorrectionJournalRead, { status: "empty" }>
  | { status: "claimed"; operation: ManualCorrectionOperation };
export type CorrectionJournalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const validOwner = (owner: string) => isUuid(owner) && owner === owner.toLowerCase();
const key = (owner: string) => `verdant:sensors:pending-correction:v1:${owner}`;
const same = (a: ManualCorrectionOperation, b: ManualCorrectionOperation) =>
  JSON.stringify(a) === JSON.stringify(b);

function read(storage: CorrectionJournalStorage, owner: string): CorrectionJournalRead {
  const raw = storage.getItem(key(owner));
  if (raw === null) return { status: "empty" };
  if (raw.length > 16384) return { status: "blocked" };
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !("version" in value) ||
    value.version !== 1 ||
    !("ownerId" in value) ||
    value.ownerId !== owner ||
    !("operation" in value)
  )
    return { status: "blocked" };
  const operation = parseManualCorrectionOperation(value.operation);
  return operation ? { status: "pending", operation } : { status: "blocked" };
}

/** Session-scoped persistence only; authorization remains enforced by the RPC. */
export function createManualCorrectionJournal(
  getStorage: () => CorrectionJournalStorage = () => window.sessionStorage,
) {
  return {
    read(ownerId: string): CorrectionJournalRead {
      try {
        return validOwner(ownerId) ? read(getStorage(), ownerId) : { status: "blocked" };
      } catch {
        return { status: "blocked" };
      }
    },
    claim(ownerId: string, value: unknown): CorrectionJournalClaim {
      try {
        if (!validOwner(ownerId)) return { status: "blocked" };
        const operation = parseManualCorrectionOperation(value);
        if (!operation) return { status: "blocked" };
        const storage = getStorage();
        const current = read(storage, ownerId);
        if (current.status === "blocked") return current;
        if (current.status === "pending")
          return same(current.operation, operation)
            ? { status: "claimed", operation: current.operation }
            : current;
        const raw = JSON.stringify({ version: 1, ownerId, operation });
        storage.setItem(key(ownerId), raw);
        if (storage.getItem(key(ownerId)) !== raw) return { status: "blocked" };
        return { status: "claimed", operation };
      } catch {
        return { status: "blocked" };
      }
    },
    // Call only after confirmed save; failure here must not turn saved into unsaved.
    clear(ownerId: string, value: unknown): boolean {
      try {
        if (!validOwner(ownerId)) return false;
        const operation = parseManualCorrectionOperation(value);
        if (!operation) return false;
        const storage = getStorage();
        const current = read(storage, ownerId);
        if (current.status !== "pending" || !same(current.operation, operation)) return false;
        storage.removeItem(key(ownerId));
        return storage.getItem(key(ownerId)) === null;
      } catch {
        return false;
      }
    },
  };
}
