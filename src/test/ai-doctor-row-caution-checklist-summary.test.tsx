/**
 * Compact "Review checklist: N check(s)" cue on AI Doctor session rows.
 *
 * Read-only UI improvement only. No writes, no AI, no automation.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  buildSessionRowCautionIndicator,
  formatCautionChecklistSummary,
  formatCautionChecklistDescription,
} from "@/lib/aiDoctorSessionDetailViewModel";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const result = () => Promise.resolve({ data: currentRows, error: null });
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => result().then(resolve);
  return {
    supabase: { from: () => chain },
  };
});

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

function makeRow(
  id: string,
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
    id,
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

describe("formatCautionChecklistSummary", () => {
  it("returns null for zero / invalid counts", () => {
    expect(formatCautionChecklistSummary(0)).toBeNull();
    expect(formatCautionChecklistSummary(-1)).toBeNull();
    expect(formatCautionChecklistSummary(Number.NaN)).toBeNull();
    expect(formatCautionChecklistSummary(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("singular for one", () => {
    expect(formatCautionChecklistSummary(1)).toBe("Review checklist: 1 check");
  });
  it("plural for many", () => {
    expect(formatCautionChecklistSummary(2)).toBe("Review checklist: 2 checks");
    expect(formatCautionChecklistSummary(3)).toBe("Review checklist: 3 checks");
  });
});

describe("formatCautionChecklistDescription", () => {
  it("null for empty", () => {
    expect(formatCautionChecklistDescription([])).toBeNull();
  });
  it("joins items after prefix", () => {
    expect(formatCautionChecklistDescription(["A.", "B."])).toBe(
      "Review checklist: A. B.",
    );
  });
});

describe("buildSessionRowCautionIndicator: checklist fields", () => {
  it("no caution → no checklist fields", () => {
    const ind = buildSessionRowCautionIndicator(makeRow("a"));
    expect(ind.show).toBe(false);
    expect(ind.checklistItems).toEqual([]);
    expect(ind.checklistSummary).toBeNull();
    expect(ind.checklistDescription).toBeNull();
  });
  it("low confidence → 1 check", () => {
    const ind = buildSessionRowCautionIndicator(
      makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    );
    expect(ind.show).toBe(true);
    expect(ind.checklistItems.length).toBe(1);
    expect(ind.checklistSummary).toBe("Review checklist: 1 check");
    expect(ind.checklistDescription).toMatch(/^Review checklist: /);
  });
  it("combined caution → multiple checks", () => {
    const ind = buildSessionRowCautionIndicator(
      makeRow(
        "a",
        { riskLevel: "high", missingInformation: ["x"] },
        { displayed_confidence: 0.3, raw_confidence: 0.3 },
      ),
    );
    expect(ind.checklistItems.length).toBe(3);
    expect(ind.checklistSummary).toBe("Review checklist: 3 checks");
  });
});

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import CoachAiDoctorHistoryPanel from "@/components/CoachAiDoctorHistoryPanel";

describe("Compact checklist cue rendering", () => {
  it("Sessions index: shows compact cue + Review because text when caution applies", async () => {
    currentRows = [
      makeRow("low-conf", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<AiDoctorSessionsIndex />);
    const cue = await screen.findByTestId(
      "ai-doctor-sessions-index-caution-checklist-summary",
    );
    expect(cue.textContent).toBe("Review checklist: 1 check");
    expect(cue.getAttribute("title")).toMatch(/^Review checklist: /);
    expect(cue.getAttribute("aria-label")).toMatch(/^Review checklist: /);
    // "Review because:" still rendered unchanged.
    const reason = screen.getByTestId("ai-doctor-sessions-index-caution-reason");
    expect(reason.textContent).toMatch(/^Review because: /);
  });

  it("Sessions index: no cue when no caution", async () => {
    currentRows = [makeRow("healthy")];
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-row");
    expect(
      screen.queryByTestId("ai-doctor-sessions-index-caution-checklist-summary"),
    ).toBeNull();
  });

  it("Plant panel: shows compact cue", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    const cue = await screen.findByTestId(
      "plant-ai-doctor-session-caution-checklist-summary",
    );
    expect(cue.textContent).toMatch(/^Review checklist: \d+ check/);
    expect(cue.getAttribute("aria-label")).toMatch(/^Review checklist: /);
  });

  it("Tent panel: shows compact cue", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    const cue = await screen.findByTestId(
      "tent-ai-doctor-session-caution-checklist-summary",
    );
    expect(cue.textContent).toMatch(/^Review checklist: \d+ check/);
  });

  it("Coach panel: shows compact cue", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    const cue = await screen.findByTestId(
      "coach-ai-doctor-history-caution-checklist-summary",
    );
    expect(cue.textContent).toMatch(/^Review checklist: \d+ check/);
  });

  it("Plant panel: no cue when healthy", async () => {
    currentRows = [makeRow("a")];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    await screen.findByTestId("ai-doctor-session-row");
    expect(
      screen.queryByTestId("plant-ai-doctor-session-caution-checklist-summary"),
    ).toBeNull();
  });
});

describe("Static safety scan — row checklist cue slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/components/PlantAiDoctorSessionsPanel.tsx",
    "src/components/TentAiDoctorSessionsPanel.tsx",
    "src/components/CoachAiDoctorHistoryPanel.tsx",
    "src/lib/aiDoctorSessionDetailViewModel.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = FILES.slice(0, 4).join("\n");
  const ALL = FILES.join("\n");

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
  it("no action_queue / alerts / task writes", () => {
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
