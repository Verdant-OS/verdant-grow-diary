import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";
import {
  QUICK_LOG_OBSERVATION_DRAFT_FORM_ID,
  QUICK_LOG_OBSERVATION_SAVE_ERROR,
} from "@/lib/quickLogObservationDraftRules";

const STORED_SAVE_KEY = "quicklog-v2-same-observation-save";
const NOTE = "First leaves look pale";

const testState = vi.hoisted(() => ({
  userId: "user-1",
}));

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: testState.userId },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test", is_archived: false }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function draftKey(userId: string) {
  return `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${userId}.${QUICK_LOG_OBSERVATION_DRAFT_FORM_ID}`;
}

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function fillObservation() {
  fireEvent.change(screen.getByTestId("qlv2-note"), { target: { value: NOTE } });
  fireEvent.change(screen.getByLabelText(/Temp/), { target: { value: "72" } });
  fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "55" } });
  fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "1.2" } });
}

function expectObservationFields() {
  expect(screen.getByTestId("qlv2-note")).toHaveValue(NOTE);
  expect(screen.getByLabelText(/Temp/)).toHaveValue("72");
  expect(screen.getByLabelText("RH (%)")).toHaveValue("55");
  expect(screen.getByLabelText("VPD (kPa)")).toHaveValue("1.2");
}

describe("Quick Log observation draft keeps every field", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.userId = "user-1";
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "invalid_details" },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps the note and sensor snapshot, then retries that same save", async () => {
    renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toBeInTheDocument();
    fillObservation();
    fireEvent.click(screen.getByTestId("qlv2-save"));

    const retry = await screen.findByTestId("qlv2-save-retry");
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
      "The server rejected the extra details attached to this entry.",
    );
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expectObservationFields();

    const stored = window.sessionStorage.getItem(draftKey("user-1")) ?? "";
    expect(stored).toContain(NOTE);
    expect(stored).toContain("72");
    expect(stored).toContain("55");
    expect(stored).toContain("1.2");
    expect(window.sessionStorage.getItem(draftKey("user-2"))).toBeNull();

    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(rpcMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const keys = rpcMock.mock.calls.map((call) => call[1]?.p_idempotency_key);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
    const temperatures = rpcMock.mock.calls.map((call) => call[1]?.p_temperature_c);
    const humidities = rpcMock.mock.calls.map((call) => call[1]?.p_humidity_pct);
    const vpds = rpcMock.mock.calls.map((call) => call[1]?.p_vpd_kpa);
    expect(new Set(temperatures).size).toBe(1);
    expect(new Set(humidities)).toEqual(new Set([55]));
    expect(new Set(vpds)).toEqual(new Set([1.2]));
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();

    cleanup();
    renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toHaveValue(NOTE);
    expectObservationFields();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(QUICK_LOG_OBSERVATION_SAVE_ERROR);
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();

    const before = rpcMock.mock.calls.length;
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        grow_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        environment_event_id: null,
        reused: false,
      },
      error: null,
    });
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(rpcMock.mock.calls.length).toBe(before + 1));
    const confirmedKeys = rpcMock.mock.calls.map((call) => call[1]?.p_idempotency_key);
    expect(new Set(confirmedKeys).size).toBe(1);
    expect(await screen.findByTestId("qlv2-post-save")).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-save-retry")).not.toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey("user-1"))).toBeNull());
  });

  it("restores a stored failed observation for the same user and retries its save key", async () => {
    writeBrowserSessionFormDraft("user-1", QUICK_LOG_OBSERVATION_DRAFT_FORM_ID, {
      form: {
        selectedKey: "plant:plant-1",
        action: "note",
        volumeMl: "",
        note: NOTE,
        temperatureC: "72",
        humidityPct: "55",
        vpdKpa: "1.2",
      },
      saveFailed: true,
      idempotencyKey: STORED_SAVE_KEY,
      tempEntryUnit: "fahrenheit",
      chipStatus: null,
    });

    renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toHaveValue(NOTE);
    expectObservationFields();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(QUICK_LOG_OBSERVATION_SAVE_ERROR);
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0]?.[1]?.p_idempotency_key).toBe(STORED_SAVE_KEY);
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain(STORED_SAVE_KEY);
  });

  it("clears the sheet when the owner changes and does not copy the draft", async () => {
    const view = renderSheet();
    expect(await screen.findByTestId("qlv2-note")).toBeInTheDocument();
    fillObservation();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await screen.findByTestId("qlv2-save-retry");
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain(NOTE);

    testState.userId = "user-2";
    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(screen.getByLabelText(/Temp/)).toHaveValue("");
    expect(screen.getByLabelText("RH (%)")).toHaveValue("");
    expect(screen.getByLabelText("VPD (kPa)")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-post-save")).not.toBeInTheDocument();

    const previous = window.sessionStorage.getItem(draftKey("user-1")) ?? "";
    const next = window.sessionStorage.getItem(draftKey("user-2")) ?? "";
    expect(previous).toContain(NOTE);
    expect(previous).toContain("72");
    expect(next).not.toContain(NOTE);
  });
});
