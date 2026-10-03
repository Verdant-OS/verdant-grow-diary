import { describe, expect, it } from "vitest";

import { createCheckpointCorrectionJournal } from "@/lib/visitCheckpointCorrectionStore";
import {
  appendCheckpointClearMarker,
  buildCheckpointCorrectionIntent,
} from "@/lib/visitCheckpointRules";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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

describe("checkpoint correction intent", () => {
  const walk = "Walked the tent; canopy even, runoff checked. ".repeat(400);
  const longNote = `${walk}\nNext checkpoint: recheck runoff EC`;

  it("stays bounded for a checkpoint inside a long note, so the journal can claim it", () => {
    const nextNote = appendCheckpointClearMarker(longNote, "done");
    expect(nextNote.length).toBeGreaterThan(8192);
    const intent = buildCheckpointCorrectionIntent(diaryEntryId, "done", nextNote);
    expect(intent.length).toBeLessThan(120);

    const storage = memoryStorage();
    const journal = createCheckpointCorrectionJournal(
      () => storage,
      () => "checkpoint-key-0001",
    );
    // The previous intent (the full next note) exceeded the journal's caps and
    // returned "blocked", so this checkpoint could never be cleared.
    expect(journal.claim(ownerId, diaryEntryId, `${diaryEntryId}:done:${nextNote}`)).toEqual({
      status: "blocked",
    });
    expect(journal.claim(ownerId, diaryEntryId, intent)).toEqual({
      status: "claimed",
      idempotencyKey: "checkpoint-key-0001",
    });
  });

  it("is deterministic for a retry and distinguishes status, entry and resulting note", () => {
    const done = appendCheckpointClearMarker(longNote, "done");
    const dismissed = appendCheckpointClearMarker(longNote, "dismissed");
    const a = buildCheckpointCorrectionIntent(diaryEntryId, "done", done);
    expect(buildCheckpointCorrectionIntent(diaryEntryId, "done", done)).toBe(a);
    expect(buildCheckpointCorrectionIntent(diaryEntryId, "dismissed", dismissed)).not.toBe(a);
    expect(
      buildCheckpointCorrectionIntent("22222222-2222-4222-8222-222222222222", "done", done),
    ).not.toBe(a);
    expect(buildCheckpointCorrectionIntent(diaryEntryId, "done", `${done} `)).not.toBe(a);
    // Non-ASCII content is fingerprinted by full code units, not low bytes only.
    expect(buildCheckpointCorrectionIntent(diaryEntryId, "done", "\u0141")).not.toBe(
      buildCheckpointCorrectionIntent(diaryEntryId, "done", "A"),
    );
  });
});
