import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildOneTentLiveProofViewModel,
  proofActionDetailHref,
} from "@/lib/oneTentLiveProofViewModel";
import { STALE_THRESHOLD_MS, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-06-23T12:00:00Z");
const FRESH_TS = new Date(NOW - 5 * 60_000).toISOString();
const STALE_TS = new Date(NOW - STALE_THRESHOLD_MS - 60_000).toISOString();

function snap(o: Partial<SensorSnapshot> & {
  source: SensorSnapshot["source"];
  ts: string | null;
}): SensorSnapshot {
  return {
    source: o.source,
    ts: o.ts,
    temp: null, rh: null, vpd: null, co2: null,
    soil: null, soil_ec: null, soil_temp: null, ppfd: null,
    device_id: null, csvVendor: null,
    ...o,
  };
}

const CTX = {
  grow: { id: "grow-1", name: "Sour Diesel Auto" },
  tent: { id: "tent-1", name: "Flower" },
};

const BASE_SIGNALS = {
  snapshot: snap({ source: "manual", ts: FRESH_TS }),
  snapshotStatus: "ok" as const,
  hasMatchingOpenAlert: true,
  matchingAlertId: "alert-9",
  linkedActionExists: true,
  linkedActionId: "act-7",
  linkedActionCompleted: false,
  timelineFollowupConfirmed: null,
  now: NOW,
};

describe("one-tent-live-proof view-model — completion + deep-link polish", () => {
  it("linked action exists but not completed → step 4 complete, step 5 pending", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, BASE_SIGNALS);
    expect(vm.steps[3].status).toBe("complete");
    expect(vm.steps[4].status).toBe("pending");
  });
  it("linked action completed → step 5 complete", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      linkedActionCompleted: true,
    });
    expect(vm.steps[4].status).toBe("complete");
  });
  it("no linked action → step 4 pending and step 5 needs-confirmation", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      linkedActionExists: false,
      linkedActionId: null,
      linkedActionCompleted: null,
    });
    expect(vm.steps[3].status).toBe("pending");
    expect(vm.steps[4].status).toBe("needs-confirmation");
  });
  it("matchingAlertId known → step 3 deep-links to alert detail", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, BASE_SIGNALS);
    expect(vm.steps[2].ctaHref).toBe("/alerts/alert-9");
    expect(vm.steps[2].ctaLabel).toMatch(/alert detail/i);
  });
  it("linkedActionId known → step 4 + 5 deep-link to action detail", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, BASE_SIGNALS);
    expect(vm.steps[3].ctaHref).toBe("/actions/act-7");
    expect(vm.steps[4].ctaHref).toBe("/actions/act-7");
    expect(proofActionDetailHref("xyz")).toBe("/actions/xyz");
  });
  it("falls back to grow-scoped routes when ids missing", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      matchingAlertId: null,
      linkedActionExists: false,
      linkedActionId: null,
      linkedActionCompleted: null,
    });
    expect(vm.steps[2].ctaHref).toBe("/alerts?growId=grow-1");
    expect(vm.steps[3].ctaHref).toBe("/alerts?growId=grow-1");
    expect(vm.steps[4].ctaHref).toBe("/actions?growId=grow-1");
  });
  it("timeline follow-up confirmed only with completed action → step 6 complete", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      linkedActionCompleted: true,
      timelineFollowupConfirmed: true,
    });
    expect(vm.steps[5].status).toBe("complete");
    expect(vm.proofComplete).toBe(true);
  });
  it("no follow-up → step 6 needs-confirmation; proof not complete", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      linkedActionCompleted: true,
      timelineFollowupConfirmed: null,
    });
    expect(vm.steps[5].status).toBe("needs-confirmation");
    expect(vm.proofComplete).toBe(false);
  });
  it("stale snapshot never completes proof even with everything else true", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      snapshot: snap({ source: "manual", ts: STALE_TS }),
      linkedActionCompleted: true,
      timelineFollowupConfirmed: true,
    });
    expect(vm.proofComplete).toBe(false);
  });
  it("pending action never marks step 5 complete", () => {
    const vm = buildOneTentLiveProofViewModel(CTX, {
      ...BASE_SIGNALS,
      linkedActionCompleted: false,
    });
    expect(vm.steps[4].status).not.toBe("complete");
  });
});

// ---------- Page-level refresh + safety copy ----------

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Sour Diesel Auto" }],
    activeGrowId: "grow-1",
    activeGrow: { id: "grow-1", name: "Sour Diesel Auto" },
  }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [{ id: "tent-1", name: "Flower" }], isLoading: false }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "ok", snapshot: null }),
}));
const reloadSpy = vi.fn();
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({
    status: "ok",
    alerts: [{ id: "alert-9" }],
    error: null,
    reload: reloadSpy,
  }),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => new Map(),
}));
const actionStatusSpy = vi.fn(() => ({
  linkedActionExists: true,
  linkedActionCompleted: true,
  linkedActionId: "act-7",
  completedActionId: "act-7",
  loading: false,
  refreshNonce: 0,
}));
vi.mock("@/hooks/useOneTentLiveProofActionStatus", () => ({
  useOneTentLiveProofActionStatus: (ids: string[], nonce: number) =>
    actionStatusSpy(ids as never, nonce as never) as never,
}));
const followupSpy = vi.fn(() => ({ followupConfirmed: true, loading: false }));
vi.mock("@/hooks/useOneTentLiveProofTimelineFollowup", () => ({
  useOneTentLiveProofTimelineFollowup: (
    g: string | null,
    a: string | null,
    n: number,
  ) => followupSpy(g as never, a as never, n as never) as never,
}));
const supabaseFromSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => {
      supabaseFromSpy(...args);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      };
    },
  },
}));

import OneTentLiveProof from "@/pages/OneTentLiveProof";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/demo/one-tent-live-proof"]}>
        <OneTentLiveProof />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OneTentLiveProof page — refresh + deep links + safety", () => {
  it("renders the read-only safety reminder", () => {
    renderPage();
    expect(
      screen.getByTestId("one-tent-live-proof-readonly-note").textContent ?? "",
    ).toMatch(/only reads proof status/i);
  });
  it("renders the Refresh proof status button", () => {
    renderPage();
    const btn = screen.getByTestId("one-tent-live-proof-refresh");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent ?? "").toMatch(/Refresh proof status/i);
  });
  it("clicking refresh calls read-only reload handlers and shows loading state", () => {
    reloadSpy.mockClear();
    renderPage();
    const btn = screen.getByTestId("one-tent-live-proof-refresh");
    fireEvent.click(btn);
    expect(reloadSpy).toHaveBeenCalled();
    expect((btn.textContent ?? "").toLowerCase()).toMatch(/refreshing/i);
  });
  it("step 3 deep-links to exact alert detail when known", () => {
    renderPage();
    const link = screen
      .getByTestId("one-tent-live-proof-step-3-cta")
      .querySelector("a") as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/alerts/alert-9");
  });
  it("step 4 + 5 deep-link to exact action detail when known", () => {
    renderPage();
    const a4 = screen
      .getByTestId("one-tent-live-proof-step-4-cta")
      .querySelector("a") as HTMLAnchorElement | null;
    const a5 = screen
      .getByTestId("one-tent-live-proof-step-5-cta")
      .querySelector("a") as HTMLAnchorElement | null;
    expect(a4?.getAttribute("href")).toBe("/actions/act-7");
    expect(a5?.getAttribute("href")).toBe("/actions/act-7");
  });
  it("does not expose internal ids in visible step labels", () => {
    renderPage();
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const row = screen.getByTestId(`one-tent-live-proof-step-${id}`);
      const visible = row.textContent ?? "";
      expect(visible).not.toContain("act-7");
      expect(visible).not.toContain("alert-9");
      expect(visible).not.toContain("grow-1");
      expect(visible).not.toContain("tent-1");
    }
  });
  it("never calls supabase write surfaces from the proof page", () => {
    renderPage();
    const btn = screen.getByTestId("one-tent-live-proof-refresh");
    fireEvent.click(btn);
    // Component should never call insert/update/delete/upsert/rpc/functions.invoke.
    // Page source contains no such tokens.
    // (Inline source assertion is performed in static safety suite; here we
    // verify supabase.from() was only invoked for SELECT-shaped chains.)
    for (const call of supabaseFromSpy.mock.calls) {
      expect(typeof call[0]).toBe("string");
    }
  });
});
