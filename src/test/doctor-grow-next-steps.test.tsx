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
  tents: [] as Array<Record<string, unknown>>,
  tentsPending: false,
  tentsError: false,
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
    data: state.tentsPending ? undefined : state.tents,
    isLoading: state.tentsPending,
    isPending: state.tentsPending,
    isError: state.tentsError,
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
  default: (props: { "data-testid"?: string; returnTo?: string | null }) => (
    <div data-testid={props["data-testid"]} data-return-to={props.returnTo ?? ""}>
      credit limit
    </div>
  ),
}));

import AiDoctorStart from "@/pages/AiDoctorStart";
import {
  classifyDoctorNextStepsResponse,
  resolveDoctorGrowNextStepsTarget,
} from "@/lib/doctorGrowNextStepsRules";
import { DOCTOR_GROW_NEXT_STEPS_COPY as COPY } from "@/constants/doctorGrowNextStepsCopy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(entry = "/doctor") {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/doctor" element={<AiDoctorStart />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage(entry = "/doctor") {
  return render(page(entry));
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
  state.tents = [{ id: "tent-b", name: "Tent B", grow_id: "grow-2" }];
  state.tentsPending = false;
  state.tentsError = false;
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

  it("waits for a carried grow scope instead of falling back to the active grow", () => {
    const carried = "/doctor?growId=grow-2&tentId=tent-b";
    state.tentsPending = true;
    renderPage(carried);
    expect(screen.queryByTestId("doctor-grow-next-steps")).toBeNull();
    cleanup();
    state.tentsPending = false;
    state.tentsError = true;
    renderPage(carried);
    expect(screen.queryByTestId("doctor-grow-next-steps")).toBeNull();
    cleanup();
    state.tentsError = false;
    renderPage(carried);
    expect(screen.getByText("Next steps for Spring Run")).toBeTruthy();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it("drops a finished result when the target grow changes", async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, result: { analysis: ANALYSIS } } });
    const view = renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-result");
    state.activeGrowId = "grow-2";
    view.rerender(page());
    expect(screen.getByText("Next steps for Spring Run")).toBeTruthy();
    expect(screen.queryByTestId("doctor-grow-next-steps-result")).toBeNull();
  });

  it("never shows an in-flight answer under a different grow", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    state.invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    state.activeGrowId = "grow-2";
    view.rerender(page());
    resolve({ data: { ok: true, result: { analysis: ANALYSIS } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("Next steps for Spring Run")).toBeTruthy();
    expect(screen.queryByTestId("doctor-grow-next-steps-result")).toBeNull();
  });

  it("reports a transport failure as unconfirmed and retries with the same key (Codex P1 at 8eb6da06)", async () => {
    state.invoke.mockResolvedValue({ data: null, error: new Error("network") });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-uncertain");
    expect(screen.queryByTestId("doctor-grow-next-steps-failed")).toBeNull();
    expect(screen.queryByText(/Nothing was changed/)).toBeNull();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    const keys = state.invoke.mock.calls.map((c) => c[1].body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("caps confidence at low for a sparse grow (Codex P1 at 8eb6da06)", async () => {
    state.invoke.mockResolvedValue({
      data: { ok: true, result: { sparse: true, analysis: { ...ANALYSIS, confidence: "high" } } },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-result");
    expect(screen.getByTestId("doctor-grow-next-steps-confidence").textContent).toBe(
      "Confidence: low",
    );
    expect(screen.getByTestId("doctor-grow-next-steps-sparse")).toBeTruthy();
  });

  it("shows evidence, risk, missing information and the 3-day plan (Codex P1 at 8eb6da06)", async () => {
    state.invoke.mockResolvedValue({
      data: {
        ok: true,
        result: {
          analysis: {
            ...ANALYSIS,
            likely_issue: "Mild underwatering",
            risk_level: "medium",
            evidence: ["Last watering was 4 days ago."],
            possible_causes: ["Larger pot drying slower than expected."],
            follow_up_3_day: "Keep the schedule and log runoff daily.",
          },
          diagnosis: { missingInformation: ["Pot size"] },
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-result");
    for (const text of [
      "Likely issue: Mild underwatering",
      "Risk: medium",
      "Last watering was 4 days ago.",
      "Pot size",
      "Larger pot drying slower than expected.",
      "Keep the schedule and log runoff daily.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("returns from checkout to the grow whose request was denied (Codex P2 at 8eb6da06)", async () => {
    state.invoke.mockResolvedValue({
      data: { ok: false, reason: "credit_denied", credit: { plan_id: "free", remaining: 0 } },
    });
    renderPage("/doctor?growId=grow-2&tentId=tent-b");
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    const notice = await screen.findByTestId("doctor-grow-next-steps-credit-limit");
    expect(notice.getAttribute("data-return-to")).toBe("/doctor?growId=grow-2");
  });

  it("announces results and credit notices inside the live region (Codex P2 at 8eb6da06)", async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, result: { analysis: ANALYSIS } } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    const result = await screen.findByTestId("doctor-grow-next-steps-result");
    expect(screen.getByTestId("doctor-grow-next-steps-status").contains(result)).toBe(true);
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

  it("shows the generic failure copy when the coach response is not usable", async () => {
    state.invoke.mockResolvedValue({ data: { ok: false, reason: "http_502" } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    const failed = await screen.findByTestId("doctor-grow-next-steps-failed");
    expect(failed.textContent).toBe(COPY.failed);
    expect(screen.queryByTestId("doctor-grow-next-steps-uncertain")).toBeNull();
  });

  it("shows the generic failure copy when credit is denied without a credit payload", async () => {
    state.invoke.mockResolvedValue({ data: { ok: false, reason: "credit_denied" } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    const failed = await screen.findByTestId("doctor-grow-next-steps-failed");
    expect(failed.textContent).toBe(COPY.failed);
    expect(screen.queryByTestId("doctor-grow-next-steps-credit-limit")).toBeNull();
  });

  it("reuses the same request key for credit_rpc pending retries", async () => {
    state.invoke.mockResolvedValue({ data: { ok: false, reason: "credit_rpc" } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-pending");
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    const keys = state.invoke.mock.calls.map((c) => c[1].body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("issues a fresh idempotency key after a completed result", async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, result: { analysis: ANALYSIS } } });
    renderPage();
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await screen.findByTestId("doctor-grow-next-steps-result");
    state.invoke.mockResolvedValue({ data: { ok: true, result: { analysis: ANALYSIS } } });
    fireEvent.click(screen.getByTestId("doctor-grow-next-steps-run"));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    const keys = state.invoke.mock.calls.map((c) => c[1].body.idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
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

  it("returns null while carried scope is unresolved even when an active grow exists", () => {
    expect(
      resolveDoctorGrowNextStepsTarget({
        grows: [
          { id: "a", name: "Active" },
          { id: "b", name: "Carried" },
        ],
        growsLoading: false,
        growsError: null,
        carriedScopeUnresolved: true,
        carriedGrowId: "b",
        activeGrowId: "a",
      }),
    ).toBeNull();
  });

  it("classifies empty, credit, upstream and pending coach outcomes", () => {
    const creditDenial = {
      ok: false as const,
      status: "denied" as const,
      reason: "limit_reached",
      scope: "per_grow",
      plan_id: "free",
      remaining: 0,
    };
    expect(classifyDoctorNextStepsResponse({ ok: true, result: { empty: true } })).toEqual({
      kind: "empty",
    });
    expect(
      classifyDoctorNextStepsResponse({
        ok: false,
        reason: "credit_denied",
        credit: creditDenial,
      }),
    ).toEqual({
      kind: "credit_denied",
      credit: creditDenial,
    });
    expect(classifyDoctorNextStepsResponse({ ok: false, reason: "credit_denied" })).toEqual({
      kind: "credit_denied",
      credit: null,
    });
    expect(
      classifyDoctorNextStepsResponse({ ok: false, reason: "upstream_credit_exhausted" }),
    ).toEqual({ kind: "upstream_exhausted" });
    expect(classifyDoctorNextStepsResponse({ ok: false, reason: "credit_rpc" })).toEqual({
      kind: "pending",
    });
  });

  it("normalizes a full analysis payload and preserves unknown risk", () => {
    expect(
      classifyDoctorNextStepsResponse({
        ok: true,
        result: {
          sparse: true,
          analysis: {
            summary: " Steady. ",
            likely_issue: "  ",
            confidence: "HIGH",
            risk_level: "unknown",
            evidence: [" good ", "", 3],
            possible_causes: ["cause"],
            recommended_actions: ["act"],
            do_not_do: ["stop"],
            follow_up_24h: "tomorrow",
            follow_up_3_day: " three days ",
          },
          diagnosis: { missingInformation: ["pot size", ""] },
        },
      }),
    ).toEqual({
      kind: "result",
      analysis: {
        summary: "Steady.",
        likelyIssue: null,
        confidence: "low",
        sparse: true,
        riskLevel: "unknown",
        evidence: ["good"],
        missingInformation: ["pot size"],
        possibleCauses: ["cause"],
        recommendedActions: ["act"],
        doNotDo: ["stop"],
        followUp24h: "tomorrow",
        followUp3Day: "three days",
      },
    });
  });
});
