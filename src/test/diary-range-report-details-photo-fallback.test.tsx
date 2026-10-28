/**
 * Codex P2 r4394299112 (#2032): a harvest photo the canonical Quick Log save
 * kept only in details.photo_url (a recovered retry, or a failed column
 * normalization) must still reach the date-range report, and a stale details
 * path on an old row must not take down a report that rendered before.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiaryRangeReportData } from "@/hooks/useDiaryRangeReportData";
import { diaryRowDetailsPhotoPath } from "@/lib/diaryRangeReportRules";

const io = vi.hoisted(() => ({
  diary: [] as unknown[],
  signed: {} as Record<string, string>,
  requested: [] as string[][],
}));

vi.mock("@/store/auth", () => {
  const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  return { useAuth: () => ({ user }) };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          io.requested.push(paths);
          return {
            data: paths.map((path) => ({ path, signedUrl: io.signed[path] ?? "" })),
            error: null,
          };
        },
      }),
    },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        is: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          const data =
            table === "grows"
              ? { id: "grow-a", name: "Grow A", stage: "veg" }
              : table === "tents"
                ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
                : table === "diary_entries"
                  ? io.diary
                  : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  },
}));

const at = "2026-01-01T12:00:00.000Z";

beforeEach(() => {
  io.diary = [];
  io.signed = {};
  io.requested = [];
});

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderHook(() => useDiaryRangeReportData("grow-a", "2026-01-01", "2026-01-02"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("diaryRowDetailsPhotoPath", () => {
  it("returns a bare details path when the column is empty", () => {
    expect(
      diaryRowDetailsPhotoPath({ id: "e", photo_url: null, details: { photo_url: " o/g/1.jpg " } }),
    ).toBe("o/g/1.jpg");
  });

  it("defers to the column photo when one exists", () => {
    expect(
      diaryRowDetailsPhotoPath({
        id: "e",
        photo_url: "o/g/col.jpg",
        details: { photo_url: "o/g/details.jpg" },
      }),
    ).toBeNull();
  });

  it.each([
    ["missing details", null],
    ["non-string", { photo_url: 42 }],
    ["blank", { photo_url: "   " }],
    ["http URL", { photo_url: "https://evil.example/x.jpg" }],
    ["scheme", { photo_url: "storage://diary-photos/o/x.jpg" }],
    ["absolute path", { photo_url: "/etc/x.jpg" }],
  ])("ignores %s", (_label, details) => {
    expect(
      diaryRowDetailsPhotoPath({ id: "e", photo_url: null, details: details as never }),
    ).toBeNull();
  });
});

describe("date-range report photos kept only in details.photo_url", () => {
  it("signs and shows a recovered harvest photo with no column photo", async () => {
    io.diary = [
      {
        id: "harvest-companion",
        photo_url: null,
        entry_at: at,
        details: { photo_url: "owner/grow-a/harvest.jpg", linked_grow_event_id: "ev-1" },
      },
    ];
    io.signed = { "owner/grow-a/harvest.jpg": "https://signed.example/harvest.jpg" };
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.diaryEntries[0].photo_url).toBe(
      "https://signed.example/harvest.jpg",
    );
  });

  it("drops an unsignable details path instead of failing the report", async () => {
    io.diary = [
      { id: "col", photo_url: "owner/grow-a/col.jpg", entry_at: at, details: null },
      {
        id: "stale",
        photo_url: null,
        entry_at: at,
        details: { photo_url: "owner/grow-a/gone.jpg" },
      },
    ];
    io.signed = { "owner/grow-a/col.jpg": "https://signed.example/col.jpg" };
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const byId = Object.fromEntries(
      (result.current.data?.diaryEntries ?? []).map((e) => [e.id, e.photo_url]),
    );
    expect(byId.col).toBe("https://signed.example/col.jpg");
    expect(byId.stale ?? null).toBeNull();
  });

  it("never sends a details URL to storage signing", async () => {
    io.diary = [
      {
        id: "url",
        photo_url: null,
        entry_at: at,
        details: { photo_url: "https://evil.example/x.jpg" },
      },
    ];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(io.requested).toEqual([]);
    expect(result.current.data?.diaryEntries[0].photo_url ?? null).toBeNull();
  });
});
