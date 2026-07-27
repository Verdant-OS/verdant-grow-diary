/**
 * Action Queue — alert context chip (?alert=<alert_id>).
 *
 * Presenter-only behaviour:
 *   - Renders "Filtered by alert" chip with "Back to alert" link.
 *   - Missing/invalid alert id renders no chip.
 *   - Coexists with ?focus chip.
 *   - Clear alert filter removes ONLY ?alert.
 *   - Never leaks raw [alert:<id>] or [session:<id>] tokens.
 *   - No DB writes, no automation copy.
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

const ROWS = [
  {
    id: "aq-1",
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "alert",
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

const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } } as const;
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
} as const;

vi.mock("@/store/auth", () => ({ useAuth: () => AUTH_STATE }));
vi.mock("@/store/grows", () => ({ useGrows: () => GROWS_STATE }));

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

beforeEach(() => {
  insertSpy.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe("ActionQueue — ?alert context chip", () => {
  it("renders 'Filtered by alert' chip when ?alert=<id> is present", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy());
    expect(screen.getByTestId("action-queue-alert-context-chip").textContent).toContain(
      "Filtered by alert",
    );
  });

  it("'Back to alert' href uses alertDetailPath(alertId)", async () => {
    renderAt("/actions?alert=alert-xyz");
    const link = await screen.findByTestId("action-queue-alert-context-back-link");
    expect(link.getAttribute("href")).toBe("/alerts/alert-xyz");
    expect(link.textContent).toContain("Back to alert");
  });

  it("renders no chip when ?alert is absent", async () => {
    renderAt("/actions");
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
    expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull();
  });

  it("renders no chip when ?alert is empty", async () => {
    renderAt("/actions?alert=");
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
    expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull();
  });

  it("renders no chip when ?alert has unsafe characters", async () => {
    renderAt("/actions?alert=%5Balert%3Afoo%5D");
    await waitFor(() => expect(screen.getAllByTestId("action-queue-row").length).toBe(2));
    expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull();
  });

  it("renders both focus chip and alert chip when both params exist", async () => {
    renderAt("/actions?focus=aq-1&alert=alert-xyz");
    await waitFor(() => expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy());
    expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy();
  });

  it("Clear alert filter removes only ?alert and preserves ?focus + others", async () => {
    renderAt("/actions?focus=aq-1&alert=alert-xyz&growId=g1&page=2&view=card");
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-clear-alert-context")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("action-queue-clear-alert-context"));

    await waitFor(() => expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull());
    const url = screen.getByTestId("loc-search").textContent ?? "";
    expect(url).not.toContain("alert=");
    expect(url).toContain("focus=aq-1");
    expect(url).toContain("growId=g1");
    expect(url).toContain("page=2");
    expect(url).toContain("view=card");
    // Focus chip still present.
    expect(screen.getByTestId("action-queue-focus-chip")).toBeTruthy();
  });

  it("Clear focus still works independently and preserves ?alert", async () => {
    renderAt("/actions?focus=aq-1&alert=alert-xyz");
    await waitFor(() => expect(screen.getByTestId("action-queue-clear-focus")).toBeTruthy());

    fireEvent.click(screen.getByTestId("action-queue-clear-focus"));

    await waitFor(() => expect(screen.queryByTestId("action-queue-focus-chip")).toBeNull());
    const url = screen.getByTestId("loc-search").textContent ?? "";
    expect(url).toContain("alert=alert-xyz");
    expect(url).not.toContain("focus=");
    expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy();
  });

  it("row linked-alert chip still renders alongside the context chip", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    // Row chip exists from prior slice — back-link + row chip both target
    // the alert detail path.
    const anchors = Array.from(document.querySelectorAll('a[href="/alerts/alert-xyz"]'));
    expect(anchors.length).toBeGreaterThanOrEqual(2);
  });

  it("chip never leaks raw [alert:<id>] token", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy());
    expect(screen.getByTestId("action-queue-alert-context-chip").textContent ?? "").not.toContain(
      "[alert:",
    );
  });

  it("page never renders raw [session:<id>] or [alert:<id>] tokens in visible textContent", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const visible = document.body.textContent ?? "";
    expect(visible).not.toContain("[session:");
    expect(visible).not.toContain("[alert:");
    // Defense in depth: also check raw HTML attribute surface.
    expect(document.body.innerHTML).not.toContain("[session:");
  });

  it("alert context chip does not trigger any DB writes", async () => {
    renderAt("/actions?alert=alert-xyz");
    await waitFor(() => expect(screen.getByTestId("action-queue-alert-context-chip")).toBeTruthy());
    fireEvent.click(screen.getByTestId("action-queue-clear-alert-context"));
    await waitFor(() => expect(screen.queryByTestId("action-queue-alert-context-chip")).toBeNull());
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("chip copy does not imply automation, execution, or device control", async () => {
    renderAt("/actions?alert=alert-xyz");
    const chip = await screen.findByTestId("action-queue-alert-context-chip");
    const text = (chip.textContent ?? "").toLowerCase();
    for (const tok of ["automate", "auto-", "execute", "actuate", "device", "relay", "mqtt"]) {
      expect(text).not.toContain(tok);
    }
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

describe("ActionQueue alert context chip — safety scan", () => {
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

  it("does not add upsert / table-delete / non-transition RPCs on the supabase client", () => {
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

  it("does not introduce any alerts or action_queue write paths", () => {
    expect(PAGE).not.toMatch(
      /from\(["']alerts["']\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\(/,
    );
    expect(PAGE).not.toMatch(
      /from\(["']action_queue["']\)[\s\S]{0,200}?\.(insert|delete|upsert)\(/,
    );
  });
});
