/**
 * Tent Detail → AI Doctor Sessions panel tests.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import { AI_DOCTOR_SESSIONS_LIMIT } from "@/hooks/use-ai-doctor-sessions";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const PANEL = read("src/components/TentAiDoctorSessionsPanel.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const PLANT_PANEL = read("src/components/PlantAiDoctorSessionsPanel.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("useTentAiDoctorSessions — hook static contract", () => {
  it("exports useTentAiDoctorSessions", () => {
    expect(HOOK).toMatch(/export function useTentAiDoctorSessions/);
  });
  it("queries ai_doctor_sessions table", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']ai_doctor_sessions["']/);
  });
  it("filters by tent_id", () => {
    expect(HOOK).toMatch(/\.eq\(\s*["']tent_id["']/);
  });
  it("orders newest first", () => {
    expect(HOOK).toMatch(/\.order\(\s*["']created_at["'],\s*\{\s*ascending:\s*false/);
  });
  it("limits results to <= 10", () => {
    expect(HOOK).toMatch(/\.limit\(/);
    expect(AI_DOCTOR_SESSIONS_LIMIT).toBeLessThanOrEqual(10);
  });
  it("is guarded by enabled: !!tentId", () => {
    expect(HOOK).toMatch(/enabled:\s*!!tentId/);
  });
});

describe("TentAiDoctorSessionsPanel — empty state", () => {
  it("renders panel testid", () => {
    renderWithClient(<TentAiDoctorSessionsPanel tentId="t1" />);
    expect(screen.getByTestId("tent-ai-doctor-sessions-panel")).toBeTruthy();
  });
  it("renders no-tent empty state", () => {
    renderWithClient(<TentAiDoctorSessionsPanel tentId={null} />);
    expect(screen.getByTestId("tent-ai-doctor-sessions-empty-no-tent")).toBeTruthy();
  });
  it("shows the read-only label", () => {
    renderWithClient(<TentAiDoctorSessionsPanel tentId={null} />);
    expect(screen.getByTestId("tent-ai-doctor-sessions-readonly-label").textContent).toMatch(
      /read-only ai doctor history/i,
    );
  });
});

describe("TentAiDoctorSessionsPanel — session rendering (static source)", () => {
  it.each([
    "tent-ai-doctor-session-date",
    "tent-ai-doctor-session-risk",
    "tent-ai-doctor-session-confidence",
    "tent-ai-doctor-session-context-ceiling",
    "tent-ai-doctor-session-action-count",
    "tent-ai-doctor-session-likely-issue",
    "tent-ai-doctor-session-summary",
  ])("renders %s", (id) => {
    expect(PANEL).toContain(id);
  });
});

describe("TentAiDoctorSessionsPanel — no Add to Queue", () => {
  it("no action_queue reference", () => {
    expect(PANEL).not.toMatch(/\.from\(["']action_queue["']\)/);
  });
  it("no add-to-queue handler", () => {
    expect(PANEL).not.toMatch(/onAddToQueue|addToQueue|addDoctorSuggestion/i);
    expect(PANEL).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
  });
});

describe("Tent Detail wiring", () => {
  it("imports TentAiDoctorSessionsPanel", () => {
    expect(TENT_DETAIL).toContain("TentAiDoctorSessionsPanel");
  });
  it("mounts panel with current tent id", () => {
    expect(TENT_DETAIL).toMatch(/TentAiDoctorSessionsPanel[\s\S]{0,80}tentId=\{id/);
  });
});

describe("Plant Detail AI Doctor behavior unchanged", () => {
  it("Plant Detail still imports PlantAiDoctorSessionsPanel", () => {
    expect(PLANT_DETAIL).toContain("PlantAiDoctorSessionsPanel");
  });
  it("Plant panel still exists", () => {
    expect(PLANT_PANEL).toContain("plant-ai-doctor-sessions-panel");
  });
});

describe("AI Doctor Sessions safety (tent)", () => {
  const ALL = [PANEL, HOOK].join("\n");
  it("never writes", () => {
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
  it("no service_role in code", () => {
    expect(PANEL).not.toMatch(/service_role/i);
    expect(HOOK).not.toMatch(/service_role/i);
  });
  it("no automation/device-control strings", () => {
    const banned = [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ];
    for (const tok of banned) {
      expect(ALL.toLowerCase()).not.toContain(tok);
    }
  });
});
