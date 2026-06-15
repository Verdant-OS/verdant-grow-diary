/**
 * Diary Timeline — empty / error / fallback state audit tests.
 *
 * Adds coverage for:
 *  - Friendly no-history empty hint that points at Quick Log.
 *  - Retry button on fetch error.
 *  - Safe fallback for malformed/unknown timeline items.
 *  - Source classification — manual/csv/demo/stale/invalid/import never
 *    render as Live.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";
import { classifyDiaryTimelineSource } from "@/lib/diaryTimelineViewModel";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

function setRows(
  rowsByTable: Record<string, { data: unknown[] | null; error: Error | null }>,
) {
  fromMock.mockImplementation((table: string) => {
    const result = rowsByTable[table] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => Promise.resolve(result),
    };
    return builder;
  });
}

function renderSection(props: Parameters<typeof TimelineMemorySection>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TimelineMemorySection {...props} />
    </QueryClientProvider>,
  );
}

describe("TimelineMemorySection — empty state polish", () => {
  it("shows friendly no-history copy guiding the grower to Quick Log", async () => {
    setRows({});
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-empty")).toBeInTheDocument(),
    );
    const txt = screen.getByTestId("timeline-memory-empty").textContent ?? "";
    expect(txt.toLowerCase()).toContain("no plant history yet");
    expect(txt.toLowerCase()).toMatch(/quick log/);
    // Must not promote anything as Live.
    expect(txt.toLowerCase()).not.toMatch(/\blive\b/);
  });
});

describe("TimelineMemorySection — error state has retry", () => {
  it("renders Retry button that triggers a refetch", async () => {
    setRows({ diary_entries: { data: null, error: new Error("boom") } });
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-error")).toBeInTheDocument(),
    );
    const retry = screen.getByTestId("timeline-memory-retry");
    expect(retry).toBeTruthy();
    expect(retry.getAttribute("type")).toBe("button");
    // Click it — should not throw and should re-invoke supabase.from.
    const callsBefore = fromMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(fromMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("error notice has role=alert and contains no Live wording", async () => {
    setRows({ diary_entries: { data: null, error: new Error("boom") } });
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-error")).toBeInTheDocument(),
    );
    const node = screen.getByTestId("timeline-memory-error");
    expect(node.getAttribute("role")).toBe("alert");
    expect((node.textContent ?? "").toLowerCase()).not.toMatch(/\blive\b/);
  });
});

describe("TimelineMemorySection — loading does not show fake entries", () => {
  it("renders only the skeleton during initial load", async () => {
    // Never-resolving fetch keeps query in loading state.
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => new Promise(() => {}) }),
        }),
      }),
    }));
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-loading")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("timeline-memory-list")).toBeNull();
    expect(screen.queryByTestId("timeline-memory-diary-item")).toBeNull();
    expect(
      screen.queryByTestId("manual-snapshot-timeline-card"),
    ).toBeNull();
  });
});

describe("Diary timeline — source classification safety", () => {
  it.each(["manual", "csv", "demo", "stale", "invalid", "import"])(
    "%s source never resolves to live",
    (src) => {
      expect(classifyDiaryTimelineSource(src)).not.toBe("live");
    },
  );
  it("only the literal 'live' resolves to live", () => {
    expect(classifyDiaryTimelineSource("live")).toBe("live");
    expect(classifyDiaryTimelineSource("mystery")).not.toBe("live");
    expect(classifyDiaryTimelineSource(null)).not.toBe("live");
  });
});
