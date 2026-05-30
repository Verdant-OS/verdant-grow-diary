/**
 * Coach → Recent AI Doctor History panel tests.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import CoachAiDoctorHistoryPanel from "@/components/CoachAiDoctorHistoryPanel";
import { AI_DOCTOR_SESSIONS_COACH_LIMIT } from "@/hooks/use-ai-doctor-sessions";

const eqSpy = vi.fn();
const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ limit: limitSpy }));
const selectSpy = vi.fn(() => ({
  eq: (col: string, val: string) => {
    eqSpy(col, val);
    return { order: orderSpy };
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: selectSpy }),
  },
}));

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PANEL = read("src/components/CoachAiDoctorHistoryPanel.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const COACH = read("src/pages/Coach.tsx");

describe("useGrowAiDoctorSessions — static contract", () => {
  it("exports useGrowAiDoctorSessions", () => {
    expect(HOOK).toMatch(/export function useGrowAiDoctorSessions/);
  });
  it("queries ai_doctor_sessions table", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']ai_doctor_sessions["']/);
  });
  it("filters by grow_id", () => {
    expect(HOOK).toMatch(/\.eq\(\s*["']grow_id["']/);
  });
  it("orders newest first", () => {
    expect(HOOK).toMatch(/\.order\(\s*["']created_at["'],\s*\{\s*ascending:\s*false/);
  });
  it("Coach limit is 5", () => {
    expect(AI_DOCTOR_SESSIONS_COACH_LIMIT).toBe(5);
    expect(HOOK).toMatch(/\.limit\(AI_DOCTOR_SESSIONS_COACH_LIMIT\)/);
  });
  it("is guarded by enabled: !!growId", () => {
    expect(HOOK).toMatch(/enabled:\s*!!growId/);
  });
});

describe("CoachAiDoctorHistoryPanel — render", () => {
  it("renders title and subtitle/helper copy", () => {
    renderWithProviders(<CoachAiDoctorHistoryPanel growId={null} />);
    const panel = screen.getByTestId("coach-ai-doctor-history-panel");
    expect(panel.textContent).toMatch(/Recent AI Doctor History/i);
    expect(screen.getByTestId("coach-ai-doctor-history-subtitle").textContent).toMatch(
      /saved ai doctor snapshots/i,
    );
    expect(screen.getByTestId("coach-ai-doctor-history-helper").textContent).toMatch(
      /does not re-run ai or create actions/i,
    );
  });

  it("renders no-grow empty state when growId is null and does NOT call supabase", () => {
    selectSpy.mockClear();
    renderWithProviders(<CoachAiDoctorHistoryPanel growId={null} />);
    expect(screen.getByTestId("coach-ai-doctor-history-empty-no-grow")).toBeTruthy();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("renders empty state when grow has no sessions", async () => {
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    expect(await screen.findByTestId("coach-ai-doctor-history-empty")).toBeTruthy();
    expect(eqSpy).toHaveBeenCalledWith("grow_id", "g1");
  });
});

describe("CoachAiDoctorHistoryPanel — row rendering (static source)", () => {
  it.each([
    "coach-ai-doctor-history-date",
    "coach-ai-doctor-history-likely-issue",
    "coach-ai-doctor-history-risk",
    "coach-ai-doctor-history-confidence",
    "coach-ai-doctor-history-action-count",
    "coach-ai-doctor-history-plant-context",
    "coach-ai-doctor-history-tent-context",
    "coach-ai-doctor-history-view-link",
  ])("renders %s", (id) => {
    expect(PANEL).toContain(id);
  });

  it("links row to /doctor/sessions/:id", () => {
    expect(PANEL).toMatch(/\/doctor\/sessions\/\$\{row\.id\}/);
  });
});

describe("Coach page wiring", () => {
  it("Coach imports CoachAiDoctorHistoryPanel", () => {
    expect(COACH).toContain("CoachAiDoctorHistoryPanel");
  });
  it("Coach mounts panel with activeGrowId", () => {
    expect(COACH).toMatch(/CoachAiDoctorHistoryPanel[\s\S]{0,80}growId=\{activeGrowId/);
  });
});

describe("CoachAiDoctorHistoryPanel — safety", () => {
  const ALL = [PANEL, HOOK].join("\n");
  it("no Add to Action Queue button or handler", () => {
    expect(PANEL).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
    expect(PANEL).not.toMatch(/onAddToQueue|addToQueue|addDoctorSuggestion/i);
  });
  it("no Run Doctor / re-run AI inside history list", () => {
    expect(PANEL).not.toMatch(/run[_ ]doctor/i);
    expect(PANEL).not.toMatch(/functions\.invoke/);
    expect(PANEL).not.toMatch(/ai-coach/);
    expect(PANEL).not.toMatch(/runDoctor|runAi|generateDiagnosis/i);
  });
  it("no writes from panel or hook", () => {
    for (const src of [PANEL, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']alert_events["']\)/);
  });
  it("no service_role or automation/device-control strings", () => {
    const lower = ALL.toLowerCase();
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
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
