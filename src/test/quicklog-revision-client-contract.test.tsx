import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  diaryResult: {
    data: [] as unknown[],
    error: null as { code?: string } | null,
    count: 0 as number | null,
  },
  revisionResult: {
    data: [] as unknown[] | null,
    error: null as { code?: string } | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseMock.from,
    rpc: supabaseMock.rpc,
  },
}));

import { useQuickLogRevisionBadges } from "@/hooks/useQuickLogRevisionBadges";
import { useRetractedQuickLogEntries } from "@/hooks/useRetractedQuickLogEntries";
import {
  adaptQuickLogRevisionDatabaseRow,
  correctQuickLogEntry,
  retractQuickLogEntry,
} from "@/lib/quickLogRevisionService";

function makeRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    actor_id: "actor-1",
    created_at: "2026-08-15T12:00:00.000Z",
    diary_entry_id: "diary-1",
    grow_event_id: null,
    id: "revision-1",
    kind: "retraction",
    new_state: null,
    previous_state: { note: "Before" },
    reason_code: "accidental",
    reason_note: null,
    revision_no: 1,
    root_id: "diary-1",
    user_id: "user-1",
    ...overrides,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function installQueryBuilders() {
  const diaryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  diaryBuilder.select.mockReturnValue(diaryBuilder);
  diaryBuilder.eq.mockReturnValue(diaryBuilder);
  diaryBuilder.not.mockReturnValue(diaryBuilder);
  diaryBuilder.order.mockReturnValue(diaryBuilder);
  diaryBuilder.limit.mockImplementation(async () => supabaseMock.diaryResult);

  const revisionBuilder = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
  };
  revisionBuilder.select.mockReturnValue(revisionBuilder);
  revisionBuilder.in.mockReturnValue(revisionBuilder);
  revisionBuilder.eq.mockReturnValue(revisionBuilder);
  revisionBuilder.order.mockImplementation(async () => supabaseMock.revisionResult);
  revisionBuilder.or.mockImplementation(async () => supabaseMock.revisionResult);

  supabaseMock.from.mockImplementation((table: string) =>
    table === "diary_entries" ? diaryBuilder : revisionBuilder,
  );
}

describe("Quick Log revision client contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.diaryResult = { data: [], error: null, count: 0 };
    supabaseMock.revisionResult = { data: [], error: null };
    installQueryBuilders();
  });

  it("contains no unchecked Supabase payload casts in the client seam", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/quickLogRevisionService.ts"),
      "utf8",
    );
    const badgeHook = readFileSync(
      resolve(process.cwd(), "src/hooks/useQuickLogRevisionBadges.ts"),
      "utf8",
    );
    const retractedHook = readFileSync(
      resolve(process.cwd(), "src/hooks/useRetractedQuickLogEntries.ts"),
      "utf8",
    );

    expect(service).not.toMatch(/\bas\s+never\b/);
    expect(badgeHook).not.toMatch(/\bas\s+QuickLogRevisionRow\[\]/);
    expect(retractedHook).not.toMatch(/\bas\s+QuickLogRevisionRow\[\]/);
  });

  it("fails closed when an RPC claims success without its required result fields", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(retractQuickLogEntry({ diaryEntryId: "diary-1" }, "accidental")).resolves.toEqual({
      ok: false,
      reason: "rpc_error",
    });
  });

  it("calls the exact generated correction and retraction RPC names", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        ok: true,
        revision_id: "revision-1",
        revision_no: 1,
        grow_event_id: null,
        diary_entry_ids: ["diary-1"],
      },
      error: null,
    });

    await retractQuickLogEntry({ diaryEntryId: "diary-1" }, "accidental");
    await correctQuickLogEntry({ diaryEntryId: "diary-1" }, "typo", {
      note: "Corrected note",
    });

    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, "quicklog_retract_entry", {
      p_reason_code: "accidental",
      p_grow_event_id: undefined,
      p_diary_entry_id: "diary-1",
      p_reason_note: undefined,
    });
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, "quicklog_correct_entry", {
      p_reason_code: "typo",
      p_changes: { note: "Corrected note" },
      p_grow_event_id: undefined,
      p_diary_entry_id: "diary-1",
      p_reason_note: undefined,
    });
  });

  it("rejects malformed physical revision rows before building badges", async () => {
    supabaseMock.revisionResult = {
      data: [makeRevisionRow({ actor_id: 42 })],
      error: null,
    };

    const { result } = renderHook(() => useQuickLogRevisionBadges(["diary-1"]), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseMock.from).toHaveBeenCalledWith("quicklog_entry_revisions");
    expect(result.current.badges.size).toBe(0);
  });

  it.each([
    ["undefined array entries", { new_state: [undefined] }],
    ["non-plain JSON objects", { previous_state: new Date("2026-08-15T12:00:00.000Z") }],
  ])("rejects %s in physical JSON fields", (_label, overrides) => {
    expect(adaptQuickLogRevisionDatabaseRow(makeRevisionRow(overrides))).toBeNull();
  });

  it("rejects malformed physical revision rows before retraction disclosure", async () => {
    supabaseMock.diaryResult = {
      data: [
        {
          id: "diary-1",
          note: "Retracted note",
          entry_at: "2026-08-15T11:00:00.000Z",
          retracted_at: "2026-08-15T12:00:00.000Z",
          plant_id: null,
          tent_id: "tent-1",
        },
      ],
      error: null,
      count: 1,
    };
    supabaseMock.revisionResult = {
      data: [makeRevisionRow({ diary_entry_id: 42 })],
      error: null,
    };

    const { result } = renderHook(() => useRetractedQuickLogEntries("grow-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, "diary_entries");
    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, "quicklog_entry_revisions");
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.retraction).toBeNull();
  });

  it("keeps revision badges empty when the revision table is unavailable", async () => {
    supabaseMock.revisionResult = {
      data: null,
      error: { code: "42P01" },
    };

    const { result } = renderHook(() => useQuickLogRevisionBadges(["diary-1"]), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.badges.size).toBe(0);
  });

  it("keeps retained entries visible without revision metadata when that lookup fails", async () => {
    supabaseMock.diaryResult = {
      data: [
        {
          id: "diary-1",
          note: "Retracted note",
          entry_at: null,
          retracted_at: "2026-08-15T12:00:00.000Z",
          plant_id: null,
          tent_id: null,
        },
      ],
      error: null,
      count: 1,
    };
    supabaseMock.revisionResult = {
      data: null,
      error: { code: "42P01" },
    };

    const { result } = renderHook(() => useRetractedQuickLogEntries("grow-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.retraction).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});
