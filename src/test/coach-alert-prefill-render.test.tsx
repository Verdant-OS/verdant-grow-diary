/**
 * Coach page — alert prefill behavior under real async timing (RTL).
 *
 * Exercises the race paths the static pins can't: a deferred getAlertById
 * lookup with the grower typing mid-flight, cross-grow rejection, and the
 * Ask-button gate while the lookup is pending. Complements the source-level
 * pins in coach-alert-prefill.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AlertRow } from "@/lib/alerts";

const mocks = vi.hoisted(() => ({
  getAlertById: vi.fn<(id: string) => Promise<AlertRow | null>>(),
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow 1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow 1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({ data: [] }),
  useGrowTents: () => ({ data: [] }),
  useGrowSensorReadings: () => ({ data: [] }),
  getGrowDataMeta: () => ({ dataSource: "supabase", isDemoData: false }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/alerts", () => ({
  getAlertById: (id: string) => mocks.getAlertById(id),
}));
vi.mock("@/lib/aiDoctorSessionPersistence", () => ({
  persistAiDoctorSession: vi.fn().mockResolvedValue({ ok: true, id: "sess-1" }),
}));
vi.mock("@/components/CoachContextSufficiencyPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorContextPanel", () => ({ default: () => null }));
vi.mock("@/components/StructuredDiagnosisCard", () => ({ default: () => null }));
vi.mock("@/components/AiCreditLimitNotice", () => ({ default: () => null }));
vi.mock("@/components/AiCreditRemainingBadge", () => ({ default: () => null }));
vi.mock("@/components/AiCreditServiceDegradedNotice", () => ({ default: () => null }));

import Coach from "@/pages/Coach";

function alertRow(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "alert-1",
    user_id: "u1",
    grow_id: "g1",
    tent_id: "tent-1",
    plant_id: null,
    source: "environment_alerts",
    severity: "warning",
    metric: "temp",
    title: "Temperature above target",
    reason: "Temperature is above the configured maximum.",
    status: "open",
    first_seen_at: "2026-08-05T10:00:00Z",
    last_seen_at: "2026-08-05T10:00:00Z",
    acknowledged_at: null,
    resolved_at: null,
    created_at: "2026-08-05T10:00:00Z",
    updated_at: "2026-08-05T10:00:00Z",
    ...overrides,
  } as AlertRow;
}

function renderCoach(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/doctor" element={<Coach />} />
      </Routes>
    </MemoryRouter>,
  );
}

const askButton = () =>
  screen.getByRole("button", { name: /What should I do next\?/ }) as HTMLButtonElement;
const questionBox = () =>
  screen.getByPlaceholderText(/Optional: ask a question/) as HTMLTextAreaElement;

beforeEach(() => {
  cleanup();
  mocks.getAlertById.mockReset();
});

describe("Coach · alert prefill async behavior", () => {
  it("gates Ask while the lookup is pending, then prefills an empty form and re-enables", async () => {
    let resolveLookup!: (row: AlertRow | null) => void;
    mocks.getAlertById.mockReturnValue(
      new Promise<AlertRow | null>((r) => {
        resolveLookup = r;
      }),
    );
    renderCoach("/doctor?alertId=alert-1");
    // Pending: no credit can be spent on a blank/stale question.
    expect(askButton().disabled).toBe(true);
    resolveLookup(alertRow());
    await waitFor(() => expect(askButton().disabled).toBe(false));
    expect(questionBox().value).toBe(
      "Open alert: Temperature above target. Temperature is above the configured maximum. What should I check first?",
    );
  });

  it("typed input wins over a late-resolving prefill", async () => {
    let resolveLookup!: (row: AlertRow | null) => void;
    mocks.getAlertById.mockReturnValue(
      new Promise<AlertRow | null>((r) => {
        resolveLookup = r;
      }),
    );
    renderCoach("/doctor?alertId=alert-1");
    fireEvent.change(questionBox(), { target: { value: "why are leaves curling?" } });
    resolveLookup(alertRow());
    await waitFor(() => expect(askButton().disabled).toBe(false));
    expect(questionBox().value).toBe("why are leaves curling?");
  });

  it("cross-grow alerts leave the form untouched and re-enable Ask", async () => {
    mocks.getAlertById.mockResolvedValue(alertRow({ grow_id: "other-grow" }));
    renderCoach("/doctor?alertId=alert-1");
    await waitFor(() => expect(askButton().disabled).toBe(false));
    expect(questionBox().value).toBe("");
  });

  it("without an alertId param there is no lookup and no gate", () => {
    renderCoach("/doctor");
    expect(mocks.getAlertById).not.toHaveBeenCalled();
    expect(askButton().disabled).toBe(false);
  });

  it("invalid alertId params never reach the DB lookup", () => {
    renderCoach("/doctor?alertId=has%20space");
    expect(mocks.getAlertById).not.toHaveBeenCalled();
    expect(askButton().disabled).toBe(false);
  });
});
