/**
 * Action Queue — client-side ?alert=<id> row filter.
 *
 * Narrows visible rows to those carrying the exact `[alert:<id>]`
 * back-pointer token in `reason`. Pure presenter narrowing; no DB writes,
 * no automation, no token leakage in copy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";
import {
  parseAlertContextParam,
  filterActionsByAlertContext,
} from "@/lib/actionQueueAlertContextFilter";

function LocationProbe() {
  const [sp] = useSearchParams();
  return <div data-testid="loc-search">{sp.toString()}</div>;
}

const ROWS = [
  {
    id: "aq-alert-1",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "environment_alert",
    action_type: "raise_light",
    target_metric: "general",
    target_device: null,
    suggested_change: "Raise the light by 10 cm",
    reason: "Hot canopy. [alert:alert-xyz]",
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
    id: "aq-alert-2",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_doctor",
    action_type: "lower_humidity",
    target_metric: "humidity_pct",
    target_device: null,
    suggested_change: "Lower humidity to 55%",
    reason: "AI advice. [alert:alert-xyz] [session:sess-1]",
    risk_level: "low",
    status: "approved",
    approved_at: "2026-05-27T11:00:00Z",
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: "2026-05-27T11:00:00Z",
    updated_at: "2026-05-27T11:00:00Z",
  },
  {
    id: "aq-other-alert",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "environment_alert",
    action_type: "raise_temp",
    target_metric: "temperature_c",
    target_device: null,
    suggested_change: "Warm tent",
    reason: "Cold. [alert:alert-other]",
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: "2026-05-27T12:00:00Z",
    updated_at: "2026-05-27T12:00:00Z",
  },
  {
    id: "aq-no-alert",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_coach",
    action_type: "feed",
    target_metric: "feeding",
    target_device: null,
    suggested_change: "Feed lightly",
    reason: "No alert token here.",
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: "2026-05-27T13:00:00Z",
    updated_at: "2026-05-27T13:00:00Z",
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

beforeEach(() => {
  insertSpy.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

function visibleRowIds(): string[] {
  return Array.from(
    document.querySelectorAll('[data-testid="action-queue-row"]'),
  ).map((el) => el.getAttribute("data-action-id") ?? "");
}

// --- Pure helpers -----------------------------------------------------------

describe("parseAlertContextParam", () => {
  it("returns null for missing/empty values", () => {
    expect(parseAlertContextParam(null)).toBeNull();
    expect(parseAlertContextParam(undefined)).toBeNull();
    expect(parseAlertContextParam("")).toBeNull();
    expect(parseAlertContextParam("   ")).toBeNull();
  });
  it("returns null for unsafe characters", () => {
    expect(parseAlertContextParam("[alert:foo]")).toBeNull();
    expect(parseAlertContextParam("a b")).toBeNull();
    expect(parseAlertContextParam("a/b")).toBeNull();
    expect(parseAlertContextParam("a;b")).toBeNull();
  });
  it("accepts safe alert ids", () => {
    expect(parseAlertContextParam("alert-xyz")).toBe("alert-xyz");
    expect(parseAlertContextParam("  alert-xyz  ")).toBe("alert-xyz");
    expect(parseAlertContextParam("abc_123")).toBe("abc_123");
  });
});

describe("filterActionsByAlertContext", () => {
  const rows = [
    { id: "1", reason: "x [alert:a]" },
    { id: "2", reason: "y [alert:b]" },
    { id: "3", reason: "no token" },
    { id: "4", reason: "partial [alert:abc] still exact" },
  ];
  it("returns full list when alertId is empty/null", () => {
    expect(filterActionsByAlertContext(rows, null)).toHaveLength(4);
    expect(filterActionsByAlertContext(rows, "")).toHaveLength(4);
  });
  it("returns only exact token matches", () => {
    expect(filterActionsByAlertContext(rows, "a").map((r) => r.id)).toEqual(["1"]);
    expect(filterActionsByAlertContext(rows, "abc").map((r) => r.id)).toEqual(["4"]);
  });
  it("does not partial-match a prefix of an id", () => {
    expect(filterActionsByAlertContext(rows, "ab")).toHaveLength(0);
  });
});

// --- Page integration -------------------------------------------------------

describe("ActionQueue — client-side ?alert filter", () => {
  it("renders all rows when ?alert is absent", async () => {
    renderAt("/actions");
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
  });

  it("filters to only rows with exact [alert:<id>] token when ?alert=<id>", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => {
      const ids = visibleRowIds();
      expect(ids.sort()).toEqual(["aq-alert-1", "aq-alert-2"].sort());
    });
  });

  it("hides rows whose reason has no alert token or a different alert id", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(visibleRowIds().length).toBe(2));
    const ids = visibleRowIds();
    expect(ids).not.toContain("aq-other-alert");
    expect(ids).not.toContain("aq-no-alert");
  });

  it("does not partial-match a prefix of the alert id", async () => {
    renderAt("/actions?alert=alert-xy");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-alert-context-empty")).toBeTruthy(),
    );
    expect(visibleRowIds()).toEqual([]);
  });

  it("URL-encoded alert ids match correctly (decoded by router)", async () => {
    renderAt(`/actions?alert=${encodeURIComponent("alert-xyz")}`);
    await waitFor(() => expect(visibleRowIds().length).toBe(2));
  });

  it("unsafe alert param does not filter rows and renders no chip", async () => {
    renderAt("/actions?alert=%5Balert%3Afoo%5D");
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull();
  });

  it("renders 'No actions linked to this alert yet.' title when no rows match", async () => {
    renderAt("/actions?alert=unknown-alert");
    const title = await screen.findByTestId(
      "action-queue-alert-context-empty-title",
    );
    expect(title.textContent).toBe("No actions linked to this alert yet.");
    expect(visibleRowIds()).toEqual([]);
  });

  it("renders helper text under the alert-filtered empty state", async () => {
    renderAt("/actions?alert=unknown-alert");
    const help = await screen.findByTestId(
      "action-queue-alert-context-empty-help",
    );
    expect(help.textContent).toBe(
      "Review the alert detail and add a suggested action when appropriate.",
    );
  });

  it("alert-filtered empty state includes a 'Back to alert' link", async () => {
    renderAt("/actions?alert=unknown-alert");
    const back = await screen.findByTestId(
      "action-queue-alert-context-empty-back-link",
    );
    expect(back.getAttribute("href")).toBe("/alerts/unknown-alert");
  });

  it("chip-area 'Back to alert' link also renders when no matching actions exist", async () => {
    renderAt("/actions?alert=unknown-alert");
    const back = await screen.findByTestId(
      "action-queue-alert-context-back-link",
    );
    expect(back.getAttribute("href")).toBe("/alerts/unknown-alert");
    expect(back.textContent).toContain("Back to alert");
    // No raw token leakage in the chip-area back link.
    expect(back.textContent ?? "").not.toContain("[alert:");
    expect(back.getAttribute("aria-label") ?? "").not.toContain("[alert:");
  });

  it("invalid/unsafe alert param does not render the chip-area 'Back to alert' link", async () => {
    renderAt("/actions?alert=%5Balert%3Afoo%5D");
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    expect(
      screen.queryByTestId("action-queue-alert-context-back-link"),
    ).toBeNull();
  });

  it("invalid/unsafe alert param does not show the alert-filtered empty state", async () => {
    renderAt("/actions?alert=%5Balert%3Afoo%5D");
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    expect(screen.queryByTestId("action-queue-alert-context-empty")).toBeNull();
  });


  it("does not render the alert-empty state when ?alert is absent", async () => {
    renderAt("/actions");
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    expect(screen.queryByTestId("action-queue-alert-context-empty")).toBeNull();
  });

  it("Clear alert filter restores all rows and preserves focus/growId/page/q", async () => {
    renderAt(
      "/actions?alert=alert-xyz&focus=aq-alert-1&growId=g1&page=2&q=mold",
    );
    await waitFor(() => expect(visibleRowIds().length).toBe(2));

    fireEvent.click(screen.getByTestId("action-queue-clear-alert-context"));

    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    const url = screen.getByTestId("loc-search").textContent ?? "";
    expect(url).not.toContain("alert=");
    expect(url).toContain("focus=aq-alert-1");
    expect(url).toContain("growId=g1");
    expect(url).toContain("page=2");
    expect(url).toContain("q=mold");
    // Focus chip still rendered after clearing alert.
    expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy();
  });

  it("alert filter composes with focus chip — focus highlight still works", async () => {
    renderAt("/actions?alert=alert-xyz&focus=aq-alert-2");
    await waitFor(() => expect(visibleRowIds().length).toBe(2));
    expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy();
    expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy();
    const focused = document.querySelector('[data-action-id="aq-alert-2"]');
    expect(focused?.getAttribute("data-focused")).toBe("true");
  });

  it("does not leak raw [alert:<id>] / [session:<id>] tokens into visible copy", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(visibleRowIds().length).toBe(2));
    const html = document.body.innerHTML;
    expect(html).not.toContain("[alert:");
    expect(html).not.toContain("[session:");
  });

  it("does not trigger any DB writes during filtering or clearing", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(visibleRowIds().length).toBe(2));
    fireEvent.click(screen.getByTestId("action-queue-clear-alert-context"));
    await waitFor(() => expect(visibleRowIds().length).toBe(4));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("empty-state copy does not imply automation/execution/device control", async () => {
    renderAt("/actions?alert=unknown-alert");
    const empty = await screen.findByTestId("action-queue-alert-context-empty");
    const lower = (empty.textContent ?? "").toLowerCase();
    for (const tok of [
      "auto",
      "execute",
      "actuate",
      "device",
      "relay",
      "mqtt",
      "approve",
      "reject",
      "resolve",
      "dismiss",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});

// --- Static safety scan ------------------------------------------------------
const PAGE = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);
const HELPER = readFileSync(
  resolve(__dirname, "../..", "src/lib/actionQueueAlertContextFilter.ts"),
  "utf8",
);

describe("alert-context filter — safety scan", () => {
  it("page introduces no new write paths or privileged calls", () => {
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

  it("page has no action_queue or alerts insert/update/delete/upsert paths added", () => {
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(
      /from\(["']action_queue["']\)[\s\S]{0,200}?\.(insert|delete|upsert)\(/,
    );
    expect(PAGE).not.toMatch(
      /from\(["']alerts["']\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\(/,
    );
  });

  it("filter helper is pure: no supabase / fetch / network imports", () => {
    expect(HELPER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER.toLowerCase()).not.toContain("service_role");
    expect(HELPER.toLowerCase()).not.toContain("functions.invoke");
  });
});
