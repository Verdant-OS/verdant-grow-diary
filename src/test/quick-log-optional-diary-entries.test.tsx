// The repeat-note check reads recent diary rows through a ref. A diary
// query (or a mock) that returns a fresh array on every call must not make
// Quick Log re-render in a loop: that loop hung Daily Check's test shard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOptionalDiaryEntries } from "@/hooks/useOptionalDiaryEntries";

const diary = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => {
    diary.calls += 1;
    if (diary.calls > 50) throw new Error("diary source re-rendered more than 50 times");
    // A fresh array and a fresh row on every call, as a mock or a refetch can return.
    return { data: [{ id: "d1", entry_at: "2026-11-28T10:00:00.000Z" }] };
  },
}));

let latestRows: { readonly current: unknown } | null = null;

function Probe() {
  const diaryEntries = useOptionalDiaryEntries();
  latestRows = diaryEntries.rowsRef;
  return <>{diaryEntries.source}</>;
}

beforeEach(() => {
  diary.calls = 0;
  latestRows = null;
});

describe("useOptionalDiaryEntries", () => {
  it("hands the rows over without re-rendering in a loop when the query returns a fresh array", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(diary.calls).toBeLessThanOrEqual(2);
    expect(latestRows?.current).toEqual([{ id: "d1", entry_at: "2026-11-28T10:00:00.000Z" }]);
  });

  it("reads no diary rows when no QueryClient is mounted", () => {
    render(<Probe />);
    expect(diary.calls).toBe(0);
    expect(latestRows?.current).toBeUndefined();
  });
});
