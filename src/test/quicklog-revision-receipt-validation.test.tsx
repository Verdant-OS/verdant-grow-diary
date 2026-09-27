import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import { useQuickLogRevisionMutation } from "@/hooks/useQuickLogRevisionMutation";
import {
  correctQuickLogEntry,
  retractQuickLogEntry,
  type QuickLogEntryHandle,
} from "@/lib/quickLogRevisionService";

const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DIARY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECOND_DIARY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REVISION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const IDEMPOTENCY_KEY = "quicklog-revision-receipt-test";
const CHANGES = { note: "Corrected observation" };

type Kind = "correction" | "retraction";

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    revision_id: REVISION_ID,
    revision_no: 2,
    grow_event_id: EVENT_ID,
    diary_entry_ids: [DIARY_ID],
    ...overrides,
  };
}

function submit(kind: Kind, handle: QuickLogEntryHandle = { growEventId: EVENT_ID }) {
  return kind === "correction"
    ? correctQuickLogEntry(handle, "typo", CHANGES, undefined, IDEMPOTENCY_KEY)
    : retractQuickLogEntry(handle, "accidental", undefined, IDEMPOTENCY_KEY);
}

beforeEach(() => {
  rpc.mockReset();
});

describe.each<Kind>(["correction", "retraction"])("%s receipt validation", (kind) => {
  it.each([
    ["missing revision ID", { revision_id: undefined }],
    ["null revision ID", { revision_id: null }],
    ["whitespace revision ID", { revision_id: "   " }],
    ["malformed revision ID", { revision_id: "revision-1" }],
    ["padded revision UUID", { revision_id: ` ${REVISION_ID} ` }],
    ["non-string revision ID", { revision_id: 42 }],
    ["empty event ID", { grow_event_id: "" }],
    ["malformed event ID", { grow_event_id: "event-1" }],
    ["malformed diary ID", { diary_entry_ids: ["diary-1"] }],
    ["whitespace diary ID", { diary_entry_ids: [" "] }],
    ["mixed valid and malformed diary IDs", { diary_entry_ids: [DIARY_ID, "diary-2"] }],
    ["no affected entry", { grow_event_id: null, diary_entry_ids: [] }],
    ["non-boolean success", { ok: "true" }],
  ] satisfies [string, Record<string, unknown>][])(
    "does not confirm a save with %s",
    async (_label, overrides) => {
      rpc.mockResolvedValue({ data: receipt(overrides), error: null });

      await expect(submit(kind)).resolves.toEqual({ ok: false, reason: "rpc_error" });
    },
  );

  it("confirms a valid revision with all linked diary IDs", async () => {
    rpc.mockResolvedValue({
      data: receipt({ diary_entry_ids: [DIARY_ID, SECOND_DIARY_ID] }),
      error: null,
    });

    await expect(submit(kind)).resolves.toEqual({
      ok: true,
      revisionId: REVISION_ID,
      revisionNo: 2,
      growEventId: EVENT_ID,
      diaryEntryIds: [DIARY_ID, SECOND_DIARY_ID],
    });
  });

  it("accepts a grow-event revision without a diary companion", async () => {
    rpc.mockResolvedValue({ data: receipt({ diary_entry_ids: [] }), error: null });

    await expect(submit(kind)).resolves.toEqual({
      ok: true,
      revisionId: REVISION_ID,
      revisionNo: 2,
      growEventId: EVENT_ID,
      diaryEntryIds: [],
    });
  });

  it("accepts a standalone diary revision with no grow event", async () => {
    rpc.mockResolvedValue({ data: receipt({ grow_event_id: null }), error: null });

    await expect(submit(kind, { diaryEntryId: DIARY_ID })).resolves.toEqual({
      ok: true,
      revisionId: REVISION_ID,
      revisionNo: 2,
      growEventId: null,
      diaryEntryIds: [DIARY_ID],
    });
  });

  it("preserves a definitive server rejection", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "invalid_note" }, error: null });

    await expect(submit(kind)).resolves.toEqual({ ok: false, reason: "invalid_note" });
  });
});

describe.each<Kind>(["correction", "retraction"])("unconfirmed %s recovery", (kind) => {
  it("keeps the original request and key until a valid replay receipt confirms it", async () => {
    rpc
      .mockResolvedValueOnce({ data: receipt({ revision_id: "revision-1" }), error: null })
      .mockResolvedValueOnce({ data: receipt({ reused: true }), error: null });
    const { result } = renderHook(() =>
      useQuickLogRevisionMutation(OWNER_ID, { growEventId: EVENT_ID }),
    );
    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;

    await act(async () => {
      outcome = await result.current.submit(kind, "typo", CHANGES, "Original reason");
    });

    expect(outcome).toEqual({ ok: false, reason: "rpc_error" });
    expect(result.current.unconfirmed).toBe(true);
    expect(result.current.pendingKind).toBe(kind);
    const originalArgs = rpc.mock.calls[0][1];
    expect(originalArgs).toMatchObject({
      p_grow_event_id: EVENT_ID,
      p_reason_code: "typo",
      p_reason_note: "Original reason",
      p_idempotency_key: expect.any(String),
    });

    await act(async () => {
      outcome = await result.current.submit(
        kind,
        "accidental",
        { note: "Unrelated later edit" },
        "Changed reason",
      );
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    expect(outcome).toEqual({
      ok: true,
      revisionId: REVISION_ID,
      revisionNo: 2,
      growEventId: EVENT_ID,
      diaryEntryIds: [DIARY_ID],
    });
    expect(result.current.unconfirmed).toBe(false);
    expect(result.current.pendingKind).toBeNull();
    expect(result.current.busy).toBe(false);
  });
});
