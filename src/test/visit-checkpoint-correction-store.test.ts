import { describe, expect, it } from "vitest";

import { createCheckpointCorrectionJournal } from "@/lib/visitCheckpointCorrectionStore";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOwnerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const diaryEntryId = "11111111-1111-4111-8111-111111111111";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("checkpoint correction journal", () => {
  it("reuses one key for the same intent and refuses a conflicting status", () => {
    const storage = memoryStorage();
    let created = 0;
    const journal = createCheckpointCorrectionJournal(
      () => storage,
      () => `checkpoint-key-${++created}`,
    );
    const first = journal.claim(ownerId, diaryEntryId, "checkpoint:done:original note");
    expect(first).toEqual({ status: "claimed", idempotencyKey: "checkpoint-key-1" });
    const afterReload = createCheckpointCorrectionJournal(
      () => storage,
      () => `checkpoint-key-${++created}`,
    );
    expect(afterReload.claim(ownerId, diaryEntryId, "checkpoint:done:original note")).toEqual(
      first,
    );
    expect(afterReload.claim(ownerId, diaryEntryId, "checkpoint:dismissed:original note")).toEqual({
      status: "conflict",
    });
    expect(created).toBe(1);
    expect(journal.clear(ownerId, diaryEntryId, "checkpoint:done:original note", "wrong-key")).toBe(
      false,
    );
    expect(
      journal.clear(ownerId, diaryEntryId, "checkpoint:done:original note", "checkpoint-key-1"),
    ).toBe(true);
    expect(journal.claim(ownerId, diaryEntryId, "checkpoint:dismissed:original note")).toEqual({
      status: "claimed",
      idempotencyKey: "checkpoint-key-2",
    });
  });

  it("keeps pending operations separated by authenticated owner", () => {
    const storage = memoryStorage();
    let created = 0;
    const journal = createCheckpointCorrectionJournal(
      () => storage,
      () => `checkpoint-key-${++created}`,
    );
    expect(journal.claim(ownerId, diaryEntryId, "done")).toEqual({
      status: "claimed",
      idempotencyKey: "checkpoint-key-1",
    });
    expect(journal.claim(otherOwnerId, diaryEntryId, "dismissed")).toEqual({
      status: "claimed",
      idempotencyKey: "checkpoint-key-2",
    });
    expect(storage.values.size).toBe(2);
  });

  it("fails closed on malformed or unavailable storage and invalid identity", () => {
    const storage = memoryStorage();
    const journal = createCheckpointCorrectionJournal(
      () => storage,
      () => "checkpoint-key-1",
    );
    expect(journal.claim("not-an-owner", diaryEntryId, "done")).toEqual({ status: "blocked" });
    expect(journal.claim(null as unknown as string, diaryEntryId, "done")).toEqual({
      status: "blocked",
    });
    expect(journal.claim(ownerId, "not-an-entry", "done")).toEqual({ status: "blocked" });
    expect(journal.claim(ownerId, diaryEntryId, "")).toEqual({ status: "blocked" });
    expect(journal.claim(ownerId, diaryEntryId, "done")).toEqual({
      status: "claimed",
      idempotencyKey: "checkpoint-key-1",
    });
    const storedKey = [...storage.values.keys()][0];
    storage.values.set(storedKey, "{not-json");
    expect(journal.claim(ownerId, diaryEntryId, "done")).toEqual({ status: "blocked" });

    const unavailable = createCheckpointCorrectionJournal(
      () => ({
        ...storage,
        setItem: () => {
          throw new Error("storage unavailable");
        },
      }),
      () => "checkpoint-key-2",
    );
    storage.values.clear();
    expect(unavailable.claim(ownerId, diaryEntryId, "done")).toEqual({ status: "blocked" });
  });
});
