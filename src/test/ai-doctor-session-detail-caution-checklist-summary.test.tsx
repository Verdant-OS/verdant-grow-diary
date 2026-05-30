/**
 * AI Doctor session detail — compact "Review checklist: N check(s)" cue in caution banner header.
 *
 * Read-only UI parity. No writes, no AI, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

let currentFixture: AiDoctorSessionRow | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentFixture, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(row: AiDoctorSessionRow | null) {
  currentFixture = row;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-x"]}>
        <Routes>
          <Route
            path="/doctor/sessions/:sessionId"
            element={<AiDoctorSessionDetail />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeRow(
  diagnosisOverrides: Partial<Diagnosis> = {},
  rowOverrides: Partial<AiDoctorSessionRow> = {},
): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "ok",
    likelyIssue: "ok",
    confidence: 0.9,
    evidence: ["e1"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "",
    whatNotToDo: [],
    followUp24h: null,
    recoveryPlan3d: null,
    riskLevel: "low",
    suggestedActions: [],
    ...diagnosisOverrides,
  };
  return {
    id: "sess-x",
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.9,
    displayed_confidence: 0.9,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...rowOverrides,
  };
}

beforeEach(() => {
  currentFixture = null;
});

describe("Session detail caution banner: compact checklist cue", () => {
  it("renders singular 'Review checklist: 1 check' for one item", async () => {
    renderRoute(
      makeRow({}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    );
    const cue = await screen.findByTestId(
      "ai-doctor-session-detail-caution-checklist-summary",
    );
    expect(cue.textContent).toBe("Review checklist: 1 check");
    expect(cue.getAttribute("aria-label")).toMatch(/^Review checklist: /);
    expect(cue.getAttribute("title")).toMatch(/^Review checklist: /);
  });

  it("renders plural copy for multiple checklist items", async () => {
    renderRoute(
      makeRow(
        { riskLevel: "high", missingInformation: ["x"] },
        { displayed_confidence: 0.3, raw_confidence: 0.3 },
      ),
    );
    const cue = await screen.findByTestId(
      "ai-doctor-session-detail-caution-checklist-summary",
    );
    expect(cue.textContent).toBe("Review checklist: 3 checks");
  });

  it("does not render compact cue when no caution applies", async () => {
    renderRoute(makeRow());
    await screen.findByTestId("ai-doctor-session-detail-risk-badge").catch(() => null);
    // wait for content to settle
    await screen.findByText(/Likely issue|Summary/i).catch(() => null);
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-checklist-summary"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-note"),
    ).toBeNull();
  });

  it("keeps existing full checklist + 'Review because:' description rendering", async () => {
    renderRoute(
      makeRow({}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    );
    const fullChecklist = await screen.findByTestId(
      "ai-doctor-session-detail-caution-checklist",
    );
    expect(fullChecklist).toBeTruthy();
    const reason = screen.getByTestId(
      "ai-doctor-session-detail-caution-reason",
    );
    expect(reason.textContent).toMatch(/^Review because: /);
  });
});

describe("Static safety scan — detail checklist summary slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = ["src/pages/AiDoctorSessionDetail.tsx"].map((p) =>
    readFileSync(resolve(ROOT, p), "utf8"),
  );
  const ALL = FILES.join("\n");
  const TSX = ALL;

  it("no writes", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / service_role", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts / tasks writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']tasks["']\)/);
  });
  it("no automation / device-control markers", () => {
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
  it("no duplicated checklist mapping in TSX", () => {
    expect(TSX).not.toContain("Verify the diagnosis against");
    expect(TSX).not.toContain("Review the risk level before");
    expect(TSX).not.toContain("Confirm plant, tent, sensor");
  });
});
