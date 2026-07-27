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
const actionQueueEqSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const result = { data: ROWS, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (column: string, value: string) => {
        actionQueueEqSpy(column, value);
        return Promise.resolve(result);
      },
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

// Stable singletons — returning a fresh object from these hooks on every
// render makes `user` / store values reference-unstable, which retriggers
// `useCallback([user, ...])` → `useEffect([load])` and locks the page in
// an infinite render loop under test.
const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } } as const;
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
} as const;

vi.mock("@/store/auth", () => ({
  useAuth: () => AUTH_STATE,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => GROWS_STATE,
}));

const SCOPED_GROW_STATE = {
  urlGrowId: null,
  scopedGrowName: null,
  backHref: "/actions",
} as const;

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => SCOPED_GROW_STATE,
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
  actionQueueEqSpy.mockClear();
  scrollIntoViewSpy = vi.fn();
  // jsdom does not implement scrollIntoView — install per test run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = scrollIntoViewSpy;
});

describe("ActionQueue — ?focus deep-link", () => {
  it("loads the focused row by id instead of filtering it out behind the active grow", async () => {
    renderAt("/actions?focus=aq-2");

    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );

    expect(actionQueueEqSpy).toHaveBeenCalledWith("id", "aq-2");
    expect(actionQueueEqSpy).not.toHaveBeenCalledWith("grow_id", "g1");
  });

  it("highlights the matching row with data-focused + accessible label", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const focused = document.querySelector('[data-action-id="aq-1"]') as HTMLElement;
    expect(focused).toBeTruthy();
    expect(focused.getAttribute("data-focused")).toBe("true");
    // Accessible name comes from the title via aria-labelledby (NOT
    // a generic "Focused action" override). Focused state is conveyed
    // via aria-describedby instead so the action title is preserved.
    expect(focused.getAttribute("aria-label")).toBeNull();
    expect(focused.getAttribute("aria-labelledby")).toMatch(/aq-pending-title-/);
    expect(focused.getAttribute("aria-describedby") ?? "").toMatch(/-focused$/);
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
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
    const focused = document.querySelectorAll('[data-focused="true"]');
    expect(focused.length).toBe(0);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("unknown focus id renders normally and does not crash", async () => {
    renderAt("/actions?focus=does-not-exist");
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
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
    await waitFor(() => expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy());
    expect(screen.getByTestId("action-queue-focus-chip").textContent).toContain("Focused action");
    expect(screen.getByTestId("action-queue-focus-chip").textContent).toContain(
      "Showing linked Action Queue item.",
    );
  });

  it("does NOT render the chip when no focus param is present", async () => {
    renderAt("/actions");
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
    expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull();
  });

  it("Clear focus removes the focus param and the row highlight", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() => expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy());
    expect(document.querySelector('[data-action-id="aq-1"]')?.getAttribute("data-focused")).toBe(
      "true",
    );

    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));

    await waitFor(() => expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull());
    expect(
      document.querySelector('[data-action-id="aq-1"]')?.getAttribute("data-focused"),
    ).toBeNull();
    expect(
      document.querySelector('[data-action-id="aq-1"]')?.getAttribute("aria-label"),
    ).toBeNull();
  });

  it("Clear focus preserves other query params (filters, growId, page)", async () => {
    renderAt("/actions?focus=aq-1&growId=g1&page=2&view=card");
    await waitFor(() => expect(screen.getByTestId("action-queue-clear-focus")).toBeTruthy());

    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));

    await waitFor(() => expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull());
    const url = screen.getByTestId("loc-search").textContent ?? "";
    expect(url).not.toContain("focus=");
    expect(url).toContain("growId=g1");
    expect(url).toContain("page=2");
    expect(url).toContain("view=card");
  });

  it("Clear focus works safely for an unknown focus id", async () => {
    renderAt("/actions?focus=does-not-exist");
    await waitFor(() => expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy());
    expect(() => fireEvent.click(screen.getByTestId("action-queue-clear-focus"))).not.toThrow();
    await waitFor(() => expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull());
  });

  it("chip never leaks an AI Doctor session token", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() => expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy());
    expect(screen.getByTestId("action-queue-focus-chip").textContent ?? "").not.toContain(
      "session:",
    );
  });

  it("Clear focus does not trigger any DB writes", async () => {
    renderAt("/actions?focus=aq-1");
    await waitFor(() => expect(screen.getByTestId("action-queue-clear-focus")).toBeTruthy());
    insertSpy.mockClear();
    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));
    await waitFor(() => expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull());
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// --- Static safety scan ------------------------------------------------------
const PAGE = readFileSync(resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"), "utf8");

// Only two RPC-invocation shapes are legitimate in this codebase:
//   1. Direct call:       supabase.rpc("name", args)
//   2. Cast-wrapped call: (supabase.rpc as unknown as (fn: string, args:
//      unknown) => Promise<...>)("name", args) — used before the RPC's
//      generated typing lands (see actionQueueRpcAvailability).
// In both shapes the RPC name is the literal FIRST token of the call's own
// argument list (only whitespace may precede it). Anchoring to that,
// instead of "any quote within N characters of supabase.rpc", closes two
// Codex-flagged gaps:
//   - Round 1: a dynamic-name call placed BEFORE the canonical call could
//     "borrow" the canonical call's own string literal via a lazy gap that
//     crossed into the second call.
//   - Round 2: a canonical-looking string sitting inside a dynamic call's
//     OWN payload (e.g. supabase.rpc(name, { note: "action_queue_transition" }))
//     could be mistaken for that call's invoked name, since it was merely
//     "the nearest quote", not the actual first argument.
const DIRECT_RPC_PATTERN = /supabase\.rpc\s*\(\s*["']([^"']+)["']/g;
const CAST_RPC_PATTERN =
  /supabase\.rpc\s+as\s+unknown\s+as\s*\([\s\S]{0,150}?\)\s*=>\s*[\s\S]{0,150}?\)\s*\(\s*["']([^"']+)["']/g;

function extractRpcNames(src: string): string[] {
  const direct = [...src.matchAll(DIRECT_RPC_PATTERN)].map((match) => match[1]);
  const cast = [...src.matchAll(CAST_RPC_PATTERN)].map((match) => match[1]);
  return [...direct, ...cast];
}

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

  it("focus logic does not add upsert / delete / rpc on the supabase client", () => {
    // Tightened: `.delete(` matches benign DOM calls like
    // `URLSearchParams.delete("focus")` used by the Clear-focus affordance.
    // The safety intent is "no DB writes" — assert against the supabase
    // chain specifically.
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/from\(["'][^"']+["']\)[\s\S]{0,200}?\.delete\(/);
    const rpcCallSiteCount = (PAGE.match(/supabase\.rpc\b/g) ?? []).length;
    const rpcNames = extractRpcNames(PAGE);
    // Every call site must independently resolve a literal first-argument
    // name — a dynamic/unnamed call site (or a canonical-looking string
    // buried elsewhere in its arguments) would leave this short rather than
    // silently merging into the canonical name.
    expect(rpcNames.length).toBe(rpcCallSiteCount);
    expect(rpcNames).toEqual(["action_queue_transition"]);
  });

  it("does not let a preceding dynamic RPC call absorb the canonical call's name (Codex P2 regression guard, round 1)", () => {
    // An unreviewed dynamic-name RPC call ahead of the canonical
    // cast-wrapped call must not resolve to (or merge into) the canonical
    // name — it must simply fail to resolve, which the count check above
    // turns into a hard failure on the real source.
    const adversarial = `
      supabase.rpc(someDynamicName, payload);
      // unrelated code in between
      const { data, error } = await (
        supabase.rpc as unknown as (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>
      )("action_queue_transition", rpcArgs);
    `;
    const callSiteCount = (adversarial.match(/supabase\.rpc\b/g) ?? []).length;
    const names = extractRpcNames(adversarial);
    expect(callSiteCount).toBe(2);
    expect(names).toEqual(["action_queue_transition"]);
    expect(names.length).not.toBe(callSiteCount);
  });

  it("does not mistake a canonical-looking string in a dynamic call's own payload for its invoked name (Codex P2 regression guard, round 2)", () => {
    // A dynamic-name call whose OWN payload happens to contain the
    // canonical string must not be credited with that name — the literal
    // first argument is the dynamic name, not a quote.
    const adversarial = `
      supabase.rpc(someDynamicName, { note: "action_queue_transition" });
    `;
    const callSiteCount = (adversarial.match(/supabase\.rpc\b/g) ?? []).length;
    const names = extractRpcNames(adversarial);
    expect(callSiteCount).toBe(1);
    expect(names).toEqual([]);
    expect(names.length).not.toBe(callSiteCount);
  });

  it("scrubs session back-pointer tokens before rendering reason", () => {
    // The page must not render `row.reason` directly without the scrubber,
    // otherwise [session:<id>] tokens would leak into grower-visible copy.
    expect(PAGE).toMatch(/stripBackPointerTokens\(\s*row\.reason\s*\)/);
    expect(PAGE).not.toMatch(/>\s*\{\s*row\.reason\s*\}\s*</);
  });
});
