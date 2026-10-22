/**
 * AI Doctor brief task 3 (owner decision 2026-10-22): grow-level "Next steps"
 * on /doctor, without a photo, for the grower's named current grow. Rendering
 * never calls the AI and never selects a plant; only an explicit click runs.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>>,
  grows: [] as Array<Record<string, unknown>>,
  activeGrowId: null as string | null,
  growsLoading: false,
  growsError: null as string | null,
  invoke: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: state.plants,
    isLoading: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGrowTents: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: state.grows,
    activeGrowId: state.activeGrowId,
    loading: state.growsLoading,
    error: state.growsError,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: state.invoke } },
}));

vi.mock("@/components/AiCreditLimitNotice", () => ({
  default: (props: { "data-testid"?: string }) => (
    <div data-testid={props["data-testid"]}>credit limit</div>
  ),
}));

import AiDoctorStart from "@/pages/AiDoctorStart";
import {
  classifyDoctorNextStepsResponse,
  resolveDoctorGrowNextStepsTarget,
} from "@/lib/doctorGrowNextStepsRules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/doctor"]}>
      <Routes>
        <Route path="/doctor" element={<AiDoctorStart />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ANALYSIS = {
  summary: "Conditions look steady.",
  confidence: "low",
  recommended_actions: ["Keep watering on the current schedule."],
  do_not_do: ["Don't raise feed strength yet."],
  follow_up_24h: "Check runoff tomorrow.",
};

beforeEach(() => {
  state.plants = [
    { id: "plant-1", name: "Blue Dream", status: "active", tent_id: null, grow_id: "grow-1" },
  ];
  state.grows = [
    { id: "grow-1", name: "Autumn Run" },
    { id: "grow-2", name: "Spring Run" },
  ];
  state.activeGrowId = "grow-1";
  state.growsLoading = false;
  state.growsError = null;
  state.invoke.mockReset();
});

afterEach(() => cleanup());

describe("/doctor grow-level next steps", () => {
  it("names the current grow and makes no AI call and no plant choice on render", () => {
    renderPage();
    expect(screen.getByText("Next steps for Autumn Run")).toBeTruthy();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId("plant-detail")).toBeNull();
    // The plant list still requires an explicit choice.
    expect(screen.getByTestId("ai-doctor-start-options")).toBeTruthy();
  });

  it("calls ai-coach once with next_steps, the grow and a UUID key on click", async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, result: { analysis: ANALYSIS } } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-result");
    expect(state.invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = state.invoke.mock.calls[0];
    expect(fn).toBe("ai-coach");
    expect(opts.body.mode).toBe("next_steps");
    expect(opts.body.growId).toBe("grow-1");
    expect(opts.body.idempotencyKey).toMatch(UUID);
    expect(Object.keys(opts.body).sort()).toEqual(["growId", "idempotencyKey", "mode"]);
    expect(screen.getByText("Keep watering on the current schedule.")).toBeTruthy();
    expect(screen.getByText("Don't raise feed strength yet.")).toBeTruthy();
  });

  it("explains an empty grow calmly instead of failing", async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, result: { empty: true, analysis: {} } } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-empty");
  });

  it("shows the credit-limit notice on a credit denial", async () => {
    state.invoke.mockResolvedValue({
      data: { ok: false, reason: "credit_denied", credit: { plan_id: "free", remaining: 0 } },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-credit-limit");
  });

  it("shows the service notice when upstream credit is exhausted", async () => {
    state.invoke.mockResolvedValue({ data: { ok: false, reason: "upstream_credit_exhausted" } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-upstream-exhausted");
  });

  it("reuses the same request key when a pending result is retried", async () => {
    state.invoke.mockResolvedValue({ data: { ok: false, reason: "result_pending" } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-pending");
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    const keys = state.invoke.mock.calls.map((c) => c[1].body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("offers nothing while the grows read is pending or failed", () => {
    state.growsLoading = true;
    renderPage();
    expect(screen.queryByTestId("doctor-grow-next-steps")).toBeNull();
    cleanup();
    state.growsLoading = false;
    state.growsError = "boom";
    renderPage();
    expect(screen.queryByTestId("doctor-grow-next-steps")).toBeNull();
  });
});

describe("doctorGrowNextStepsRules", () => {
  it("prefers a validated carried grow over the stored active grow", () => {
    expect(
      resolveDoctorGrowNextStepsTarget({
        grows: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        growsLoading: false,
        growsError: null,
        carriedGrowId: "b",
        activeGrowId: "a",
      }),
    ).toEqual({ growId: "b", growName: "B" });
  });

  it("returns null for an unknown grow id or an empty list", () => {
    const base = { growsLoading: false, growsError: null };
    expect(resolveDoctorGrowNextStepsTarget({ ...base, grows: [], activeGrowId: "a" })).toBeNull();
    expect(
      resolveDoctorGrowNextStepsTarget({ ...base, grows: [{ id: "a" }], activeGrowId: "z" }),
    ).toBeNull();
  });

  it("names a grow without a name generically", () => {
    expect(
      resolveDoctorGrowNextStepsTarget({
        grows: [{ id: "a", name: "  " }],
        growsLoading: false,
        growsError: null,
        activeGrowId: "a",
      }),
    ).toEqual({ growId: "a", growName: "your grow" });
  });

  it("fails closed on unknown shapes and error payloads", () => {
    expect(classifyDoctorNextStepsResponse({ ok: true, result: null })).toEqual({
      kind: "failed",
    });
    expect(classifyDoctorNextStepsResponse({ ok: true, result: { error: "x" } })).toEqual({
      kind: "failed",
    });
    expect(classifyDoctorNextStepsResponse({ ok: true, result: { analysis: {} } })).toEqual({
      kind: "failed",
    });
    expect(classifyDoctorNextStepsResponse({ ok: false, reason: "http" })).toEqual({
      kind: "failed",
    });
  });
});
