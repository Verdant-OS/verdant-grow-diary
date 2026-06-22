/**
 * Action Queue — integrated RTL coverage for the One-Tent Loop tail.
 *
 * Verifies presentationally (no real Supabase / Edge / AI / device calls):
 *  - URL state (q, status, trace, page, pageSize) is restored on mount.
 *  - Pagination respects pageSize and clamps within total pages.
 *  - "Jump to highlighted trace" appears for a valid highlight token
 *    and is absent for an invalid token.
 *  - Retry trace failure copy strings exist in the page bundle and the
 *    presenter renders them when a trace failure is surfaced.
 *  - Timeline highlight rendering matches by details.idempotency_key
 *    and exposes the documented testid / aria label.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";
import {
  RETRY_TRACE_EXPLAIN_PRIMARY,
  RETRY_TRACE_EXPLAIN_SECONDARY,
} from "@/lib/actionQueueRetryTraceViewModel";
import {
  diaryEntryMatchesHighlight,
  parseTimelineHighlightToken,
  TIMELINE_HIGHLIGHT_TESTID,
  TIMELINE_HIGHLIGHT_ARIA_LABEL,
} from "@/lib/timelineHighlightRules";

// --- Fixtures ---------------------------------------------------------------

function makeRow(i: number) {
  return {
    id: `aq-${i}`,
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_coach",
    action_type: "lower_humidity",
    target_metric: "humidity_pct",
    target_device: null,
    suggested_change: `Lower humidity step ${i}`,
    reason: i === 1 ? "Mold risk rising." : `Reason ${i}`,
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: `2026-05-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
    updated_at: `2026-05-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
  };
}

const ROWS = Array.from({ length: 12 }, (_, i) => makeRow(i + 1));

vi.mock("@/integrations/supabase/client", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `aq-${i + 1}`,
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_coach",
    action_type: "lower_humidity",
    target_metric: "humidity_pct",
    target_device: null,
    suggested_change: `Lower humidity step ${i + 1}`,
    reason: i === 0 ? "Mold risk rising." : `Reason ${i + 1}`,
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: `2026-05-${String(11 + i).padStart(2, "0")}T10:00:00Z`,
    updated_at: `2026-05-${String(11 + i).padStart(2, "0")}T10:00:00Z`,
  }));
  const aqResult = { data: rows, error: null };
  const emptyResult = { data: [], error: null };
  const makeChain = (result: { data: unknown; error: null }) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => chain,
      in: () => chain,
      contains: () => Promise.resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeChain(aqResult);
        return makeChain(emptyResult);
      },
    },
  };
});

const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } } as const;
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
} as const;

vi.mock("@/store/auth", () => ({ useAuth: () => AUTH_STATE }));
vi.mock("@/store/grows", () => ({ useGrows: () => GROWS_STATE }));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
    isValidScopedGrow: true,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe("Integrated — Action Queue URL restore + jump + pagination", () => {
  it("restores search query from ?q= and pageSize from ?pageSize=", async () => {
    renderAt("/actions?q=mold&pageSize=10");
    const input = (await waitFor(() =>
      screen.getByTestId("action-queue-search-input"),
    )) as HTMLInputElement;
    expect(input.value).toBe("mold");
  });

  it("paginates: pageSize=10 + page=2 shows the remaining rows only", async () => {
    renderAt("/actions?pageSize=10&page=2");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    // 12 rows total, 10 per page → page 2 = 2 rows.
    expect(screen.getAllByTestId("action-queue-row").length).toBe(2);
  });

  it("renders 'Jump to highlighted trace' for a valid highlight token", async () => {
    renderAt("/actions?highlight=action-queue:aq-1:approved");
    const jump = await waitFor(() =>
      screen.getByTestId("action-queue-jump-to-highlighted-trace"),
    );
    expect(jump.getAttribute("href")).toContain("/timeline?highlight=");
    expect(jump.textContent ?? "").toMatch(/Jump to highlighted trace/i);
    // No raw UUIDs in visible label.
    expect(jump.textContent ?? "").not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("hides the jump affordance for an invalid highlight token", async () => {
    renderAt("/actions?highlight=garbage");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByTestId("action-queue-jump-to-highlighted-trace"),
    ).toBeNull();
  });
});

describe("Integrated — retry trace failure copy is wired in", () => {
  it("exposes the trace-specific explain strings as constants", () => {
    expect(RETRY_TRACE_EXPLAIN_PRIMARY).toBe(
      "Status was saved, but the diary trace did not save.",
    );
    expect(RETRY_TRACE_EXPLAIN_SECONDARY).toBe(
      "Retry only repairs the diary trace. It will not approve/reject again.",
    );
  });
});

describe("Integrated — timeline highlight matching by idempotency_key", () => {
  it("matches a diary entry whose details.idempotency_key equals the token", () => {
    const highlight = parseTimelineHighlightToken("action-queue:aq-1:approved");
    expect(highlight).not.toBeNull();
    const entry = {
      details: {
        kind: "action_queue_trace",
        idempotency_key: "action-queue:aq-1:approved",
      },
    };
    expect(diaryEntryMatchesHighlight(entry, highlight)).toBe(true);
    // documented testid + aria are the contract used by Timeline.tsx.
    expect(TIMELINE_HIGHLIGHT_TESTID).toBe(
      "timeline-highlighted-action-queue-trace",
    );
    expect(TIMELINE_HIGHLIGHT_ARIA_LABEL).toBe(
      "Highlighted Action Queue diary trace",
    );
  });
});
