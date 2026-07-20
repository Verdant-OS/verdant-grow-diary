/**
 * AI Doctor Sessions index page tests.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// --- supabase mock ---
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const selectSpy = vi.fn(() => ({ order: orderSpy }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: selectSpy }),
  },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import {
  AI_DOCTOR_SESSIONS_INDEX_PAGE_SIZE,
} from "@/hooks/use-ai-doctor-sessions";

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

/** Exposes the current router location for URL-behavior assertions. */
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
    </div>
  );
}

/** Same providers as renderWithProviders, but at an explicit initial URL. */
function renderWithProvidersAt(ui: ReactElement, initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const APP = read("src/App.tsx");
const COACH_PANEL = read("src/components/CoachAiDoctorHistoryPanel.tsx");

describe("useAiDoctorSessionsIndex — static contract", () => {
  it("exports the hook and page size constant of 25", () => {
    expect(HOOK).toMatch(/export function useAiDoctorSessionsIndex/);
    expect(AI_DOCTOR_SESSIONS_INDEX_PAGE_SIZE).toBe(25);
  });
  it("queries ai_doctor_sessions table through the normal client", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']ai_doctor_sessions["']/);
  });
  it("orders newest first", () => {
    expect(HOOK).toMatch(
      /useAiDoctorSessionsIndex[\s\S]*?\.order\(\s*["']created_at["'],\s*\{\s*ascending:\s*false/,
    );
  });
  it("uses range-based pagination", () => {
    expect(HOOK).toMatch(/useAiDoctorSessionsIndex[\s\S]*?\.range\(/);
  });
});

describe("useAiDoctorSessionsIndex — runtime behavior", () => {
  it("calls supabase with newest-first order and page-bounded range", async () => {
    selectSpy.mockClear();
    orderSpy.mockClear();
    rangeSpy.mockClear();
    renderWithProviders(<AiDoctorSessionsIndex />);
    // Wait for query effect
    await screen.findByTestId("ai-doctor-sessions-index-page");
    await new Promise((r) => setTimeout(r, 0));
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
    // pageSize=25, page 0 → range(0, 25) to detect hasMore
    expect(rangeSpy).toHaveBeenCalledWith(0, 25);
  });
});

describe("AiDoctorSessionsIndex — render", () => {
  it("renders title and helper copy", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(
      (await screen.findByTestId("ai-doctor-sessions-index-title")).textContent,
    ).toMatch(/AI Doctor Sessions/i);
    expect(screen.getByTestId("ai-doctor-sessions-index-helper").textContent).toMatch(
      /saved diagnosis snapshots/i,
    );
    expect(screen.getByTestId("ai-doctor-sessions-index-helper").textContent).toMatch(
      /does not re-run ai or create actions/i,
    );
  });

  it("renders empty state when there are no sessions", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(await screen.findByTestId("ai-doctor-sessions-index-empty")).toBeTruthy();
  });
});

describe("AiDoctorSessionsIndex — ?view=ledger backward-compatible URL behavior", () => {
  it("default (no view param) renders the existing history view, not the ledger", async () => {
    renderWithProvidersAt(<AiDoctorSessionsIndex />, "/doctor/sessions");
    expect(await screen.findByTestId("ai-doctor-sessions-index-page")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-sessions-index-filters")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-session-integrity-ledger")).toBeNull();
  });

  it("?view=ledger renders the ledger and hides the history filters/list", async () => {
    renderWithProvidersAt(<AiDoctorSessionsIndex />, "/doctor/sessions?view=ledger");
    expect(await screen.findByTestId("ai-doctor-session-integrity-ledger")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-sessions-index-filters")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-sessions-index-list")).toBeNull();
  });

  it("an unrecognized ?view value falls back to the default history view", async () => {
    renderWithProvidersAt(<AiDoctorSessionsIndex />, "/doctor/sessions?view=bogus");
    expect(await screen.findByTestId("ai-doctor-sessions-index-filters")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-session-integrity-ledger")).toBeNull();
  });

  it("preserves all existing filters, saved-view params, and page when entering ledger mode", async () => {
    renderWithProvidersAt(
      <AiDoctorSessionsIndex />,
      "/doctor/sessions?risk=high&hasActions=yes&page=2",
    );
    await screen.findByTestId("ai-doctor-sessions-index-page");
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-view-switch-ledger"));
    await screen.findByTestId("ai-doctor-session-integrity-ledger");
    const probe = screen.getByTestId("location-probe");
    expect(probe.textContent).toContain("view=ledger");
    expect(probe.textContent).toContain("risk=high");
    expect(probe.textContent).toContain("hasActions=yes");
    expect(probe.textContent).toContain("page=2");
  });

  it("switching back to history removes ONLY the view param, keeping unrelated params intact", async () => {
    renderWithProvidersAt(
      <AiDoctorSessionsIndex />,
      "/doctor/sessions?view=ledger&risk=high&customUnknownParam=keep-me",
    );
    await screen.findByTestId("ai-doctor-session-integrity-ledger");
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-view-switch-history"));
    await screen.findByTestId("ai-doctor-sessions-index-filters");
    const probe = screen.getByTestId("location-probe");
    expect(probe.textContent).not.toContain("view=");
    expect(probe.textContent).toContain("risk=high");
    expect(probe.textContent).toContain("customUnknownParam=keep-me");
  });

  it("the view-switch controls reflect the current mode via aria-pressed", async () => {
    renderWithProvidersAt(<AiDoctorSessionsIndex />, "/doctor/sessions?view=ledger");
    await screen.findByTestId("ai-doctor-session-integrity-ledger");
    expect(
      screen.getByTestId("ai-doctor-sessions-index-view-switch-ledger").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("ai-doctor-sessions-index-view-switch-history").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("AiDoctorSessionsIndex — row rendering (static source)", () => {
  it.each([
    "ai-doctor-sessions-index-date",
    "ai-doctor-sessions-index-likely-issue",
    "ai-doctor-sessions-index-summary",
    "ai-doctor-sessions-index-risk",
    "ai-doctor-sessions-index-confidence",
    "ai-doctor-sessions-index-action-count",
    "ai-doctor-sessions-index-grow-context",
    "ai-doctor-sessions-index-plant-context",
    "ai-doctor-sessions-index-tent-context",
    "ai-doctor-sessions-index-view-link",
  ])("renders %s", (id) => {
    expect(PAGE).toContain(id);
  });

  it("links row to /doctor/sessions/:id", () => {
    expect(PAGE).toMatch(/\/doctor\/sessions\/\$\{row\.id\}/);
  });

  it("does NOT render an Add to Action Queue button", () => {
    expect(PAGE).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
    expect(PAGE).not.toMatch(/addToQueue|onAddToQueue/);
  });

  it("does NOT render a Run Doctor / re-run AI button", () => {
    expect(PAGE).not.toMatch(/run[_ ]doctor/i);
    expect(PAGE).not.toMatch(/runDoctor|runAi|generateDiagnosis/);
  });
});

describe("App routing", () => {
  it("registers /doctor/sessions index route", () => {
    expect(APP).toMatch(
      /<Route\s+path="\/doctor\/sessions"\s+element=\{<AiDoctorSessionsIndex/,
    );
  });
  it("still registers /doctor/sessions/:sessionId detail route", () => {
    expect(APP).toMatch(
      /<Route\s+path="\/doctor\/sessions\/:sessionId"\s+element=\{<AiDoctorSessionDetail/,
    );
  });
});

describe("Coach mini-list — View all sessions link", () => {
  it("links to /doctor/sessions with the expected testid", () => {
    expect(COACH_PANEL).toContain("coach-ai-doctor-history-view-all-link");
    expect(COACH_PANEL).toMatch(/to="\/doctor\/sessions"/);
  });
});

describe("AiDoctorSessionsIndex — safety", () => {
  const ALL = [PAGE, HOOK].join("\n");
  it("no insert/update/delete/upsert in page or hook", () => {
    for (const src of [PAGE, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke or AI invocation", () => {
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/ai-coach/);
  });
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']alert_events["']\)/);
  });
  it("no service_role, automation, or device-control strings", () => {
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
