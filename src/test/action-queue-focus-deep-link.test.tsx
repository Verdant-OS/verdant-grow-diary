/**
 * Action Queue — deep-link focus (?focus=<action_id>).
 *
 * Presenter-only behaviour:
 *   - Matching row gets data-focused="true" + accessible label.
 *   - Matching row scrollIntoView is invoked.
 *   - Missing / unknown focus param renders normally and does not crash.
 *   - Existing rows still render.
 *   - No DB writes triggered by focus.
 *   - No AI Doctor session token leaks into the page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";

function LocationProbe() {
  const [sp] = useSearchParams();
  return <div data-testid="loc-search">{sp.toString()}</div>;
}


// --- Fixtures ---------------------------------------------------------------

const ROWS = [
  {
    id: "aq-1",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_doctor",
    action_type: "raise_light",
    target_metric: "general",
    target_device: null,
    suggested_change: "Raise the light by 10 cm",
    reason: "Reduce radiant load. [session:abc-123]",
    risk_level: "medium",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: "2026-05-27T10:00:00Z",
    updated_at: "2026-05-27T10:00:00Z",
  },
  {
    id: "aq-2",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_coach",
    action_type: "lower_humidity",
    target_metric: "humidity_pct",
    target_device: null,
    suggested_change: "Lower humidity to 55%",
    reason: "Mold risk rising.",
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: "2026-05-27T11:00:00Z",
    updated_at: "2026-05-27T11:00:00Z",
  },
];

const insertSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const result = { data: ROWS, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => Promise.resolve(result),
      in: () => chain,
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  const makeEventsChain = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      order: () => Promise.resolve(result),
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeActionQueueChain();
        if (table === "action_queue_events") return makeEventsChain();
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        };
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
      <LocationProbe />
    </MemoryRouter>,
  );
}


let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  insertSpy.mockClear();
  scrollIntoViewSpy = vi.fn();
  // jsdom does not implement scrollIntoView — install per test run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = scrollIntoViewSpy;
});

describe("ActionQueue — ?focus deep-link", () => {
  it("highlights the matching row with data-focused + accessible label", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const focused = document.querySelector('[data-action-id="aq-1"]') as HTMLElement;
    expect(focused).toBeTruthy();
    expect(focused.getAttribute("data-focused")).toBe("true");
    expect(focused.getAttribute("aria-label")).toBe("Focused action");
    // Visible (non-color) affordance: ring utility class.
    expect(focused.className).toMatch(/ring-/);
  });

  it("calls scrollIntoView on the matching row", async () => {
    renderAt("/actions?focus=aq-2");
    await waitFor(() => expect(scrollIntoViewSpy).toHaveBeenCalled());
  });

  it("non-focused rows do not get the focus marker", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const other = document.querySelector('[data-action-id="aq-2"]') as HTMLElement;
    expect(other.getAttribute("data-focused")).toBeNull();
    expect(other.getAttribute("aria-label")).toBeNull();
  });

  it("renders normally with no focus param", async () => {
    renderAt("/actions");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(2),
    );
    const focused = document.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("unknown focus id renders normally and does not crash", async () => {
    renderAt("/actions?focus=does-not-exist");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(2),
    );
    const focused = document.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("focus deep-link does not trigger any DB writes", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("never renders the raw [session:<id>] back-pointer token", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const html = document.body.innerHTML;
    expect(html).not.toContain("[session:");
  });
});

describe("ActionQueue — focus chip + Clear focus", () => {
  it("renders 'Focused action' chip when ?focus=<id> is present", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy(),
    );
    expect(screen.getByTestId("action-queue-focus-chip").textContent).toContain(
      "Focused action",
    );
    expect(screen.getByTestId("action-queue-focus-chip").textContent).toContain(
      "Showing linked Action Queue item.",
    );
  });

  it("does NOT render the chip when no focus param is present", async () => {
    renderAt("/actions");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(2),
    );
    expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull();
  });

  it("Clear focus removes the focus param and the row highlight", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy(),
    );
    expect(
      document.querySelector('[data-action-id="aq-1"]')?.getAttribute("data-focused"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));

    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull(),
    );
    expect(
      document.querySelector('[data-action-id="aq-1"]')?.getAttribute("data-focused"),
    ).toBeNull();
    expect(
      document.querySelector('[data-action-id="aq-1"]')?.getAttribute("aria-label"),
    ).toBeNull();
  });

  it("Clear focus preserves other query params (filters, growId, page)", async () => {
    renderAt("/actions?focus=aq-1&growId=g1&page=2&q=mold");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-clear-focus")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));

    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull(),
    );
    const url = screen.getByTestId("loc-search").textContent ?? "";
    expect(url).not.toContain("focus=");
    expect(url).toContain("growId=g1");
    expect(url).toContain("page=2");
    expect(url).toContain("q=mold");

  });

  it("Clear focus works safely for an unknown focus id", async () => {
    renderAt("/actions?focus=does-not-exist");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy(),
    );
    expect(() =>
      fireEvent.click(screen.getByTestId("action-queue-clear-focus")),
    ).not.toThrow();
    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull(),
    );
  });

  it("chip never leaks an AI Doctor session token", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("action-queue-focus-chip").textContent ?? "",
    ).not.toContain("session:");
  });

  it("Clear focus does not trigger any DB writes", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-clear-focus")).toBeTruthy(),
    );
    insertSpy.mockClear();
    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));
    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull(),
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });
});


// --- Static safety scan ------------------------------------------------------
const PAGE = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("ActionQueue focus deep-link — safety scan", () => {
  it("introduces no functions.invoke / service_role / device-control verbs", () => {
    const lower = PAGE.toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("focus logic does not add upsert / delete / rpc", () => {
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("scrubs session back-pointer tokens before rendering reason", () => {
    // The page must not render `row.reason` directly without the scrubber,
    // otherwise [session:<id>] tokens would leak into grower-visible copy.
    expect(PAGE).toMatch(/stripBackPointerTokens\(\s*row\.reason\s*\)/);
    expect(PAGE).not.toMatch(/>\s*\{\s*row\.reason\s*\}\s*</);
  });
});
