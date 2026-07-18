/**
 * PR B1 — Onboarding page renders the guided starter setup action and
 * wires it through the injected service adapter without ever calling
 * sensor / AI / alert / action-queue / edge-function paths.
 *
 * The Supabase adapter is stubbed so no real network is hit. The
 * PLANT_QUICKLOG_PREFILL_EVENT is asserted so we know the current AppShell
 * can open Quick Log preselected without being replaced by a redirect.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

const refreshGrows = vi.hoisted(() => vi.fn());
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ refresh: refreshGrows }),
}));

const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

const runStarterSetupMock = vi.fn();
vi.mock("@/lib/starterSetupService", async (importActual) => {
  const actual = (await importActual()) as typeof import("@/lib/starterSetupService");
  return {
    ...actual,
    runStarterSetup: async (
      userId: string,
      db: unknown,
      callbacks?: import("@/lib/starterSetupService").StarterSetupCallbacks,
    ) => {
      const result = await runStarterSetupMock(userId, db, callbacks);
      if (!result.reused.grow) callbacks?.onCreated?.("grow");
      if (!result.reused.tent) callbacks?.onCreated?.("tent");
      if (!result.reused.plant) callbacks?.onCreated?.("plant");
      return result;
    },
  };
});

import Onboarding from "@/pages/Onboarding";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  STARTER_GROW_NAME,
  STARTER_PLANT_NAME,
  STARTER_SETUP_BUTTON_LABEL,
  STARTER_TENT_NAME,
} from "@/lib/starterSetupRules";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<div data-testid="dashboard-landing" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding · guided starter setup", () => {
  beforeEach(() => {
    runStarterSetupMock.mockReset();
    trackFunnelEvent.mockReset();
    refreshGrows.mockReset().mockResolvedValue(undefined);
    invalidateQueries.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the starter setup block with pinned label + helper copy", () => {
    renderPage();
    const block = screen.getByTestId("starter-setup-block");
    expect(block.textContent).toContain(STARTER_SETUP_BUTTON_LABEL);
    expect(block.textContent!.toLowerCase()).toContain("no fake logs");
    expect(block.textContent!.toLowerCase()).toContain("sensor reading");
  });

  it("on success runs the service and dispatches the Quick Log prefill event", async () => {
    runStarterSetupMock.mockResolvedValue({
      growId: "g1",
      tentId: "t1",
      plantId: "p1",
      reused: { grow: false, tent: false, plant: false },
    });
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);

    renderPage();
    await userEvent.click(screen.getByTestId("starter-setup-button"));

    await waitFor(() => expect(runStarterSetupMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("starter-setup-block")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-landing")).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      plantId: "p1",
      tentId: "t1",
      growId: "g1",
      plantName: STARTER_PLANT_NAME,
      tentName: STARTER_TENT_NAME,
      eventType: "observation",
      suggestSnapshot: true,
    });
    expect(trackFunnelEvent.mock.calls).toEqual([
      ["grow_created"],
      ["tent_created"],
      ["plant_created"],
    ]);
    expect(refreshGrows).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tents"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["plants"] });
    // Sanity: canonical grow name never leaks as sensor/demo/live label.
    expect(STARTER_GROW_NAME.toLowerCase()).not.toContain("demo");
    expect(STARTER_GROW_NAME.toLowerCase()).not.toContain("live");
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
  });

  it("waits for the starter caches before opening Quick Log", async () => {
    runStarterSetupMock.mockResolvedValue({
      growId: "g1",
      tentId: "t1",
      plantId: "p1",
      reused: { grow: false, tent: false, plant: false },
    });
    let finishGrowRefresh: () => void = () => {};
    refreshGrows.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishGrowRefresh = resolve;
        }),
    );
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);

    renderPage();
    await userEvent.click(screen.getByTestId("starter-setup-button"));
    await waitFor(() => expect(refreshGrows).toHaveBeenCalledTimes(1));
    expect(events).toHaveLength(0);
    expect(trackFunnelEvent.mock.calls).toEqual([
      ["grow_created"],
      ["tent_created"],
      ["plant_created"],
    ]);

    await act(async () => finishGrowRefresh());
    await waitFor(() => expect(events).toHaveLength(1));
    expect(trackFunnelEvent).toHaveBeenCalledTimes(3);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
  });

  it("re-click is safe: awaits the in-flight promise and only runs one setup", async () => {
    let resolveIt: (v: unknown) => void = () => {};
    runStarterSetupMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolveIt = r;
        }),
    );
    renderPage();
    const btn = screen.getByTestId("starter-setup-button");
    await userEvent.click(btn);
    // Second click while busy is ignored (button disabled).
    await userEvent.click(btn);
    expect(runStarterSetupMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveIt({
        growId: "g",
        tentId: "t",
        plantId: "p",
        reused: { grow: true, tent: true, plant: true },
      });
    });
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(screen.getByTestId("starter-setup-block")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-landing")).toBeNull();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("shows a safe error message and does not redirect on failure", async () => {
    runStarterSetupMock.mockRejectedValue(new Error("boom"));
    renderPage();
    await userEvent.click(screen.getByTestId("starter-setup-button"));
    const err = await screen.findByTestId("starter-setup-error");
    expect(err.textContent!.toLowerCase()).toContain("couldn't");
    // Must NOT expose internal identifiers.
    expect(err.textContent).not.toContain("user-1");
    expect(err.textContent).not.toMatch(/uuid|user_id|grow_id|tent_id|plant_id/i);
    // Onboarding block still present (no redirect).
    expect(screen.getByTestId("starter-setup-block")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-landing")).toBeNull();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });
});
