/**
 * AI Doctor Sessions index — caution + limited-context indicators.
 *
 * Read-only UI / view-model improvement. No writes, no AI, no automation.
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
  isSessionLimitedContext,
  LIMITED_CONTEXT_LABEL,
  ROW_CAUTION_LABEL,
} from "@/lib/aiDoctorSessionDetailViewModel";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: currentRows, error: null }),
        }),
      }),
    }),
  },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

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

describe("Pure helpers — index caution + limited context", () => {
  it("buildSessionRowCautionIndicator: not shown for healthy row", () => {
    const r = makeRow("a");
    const ind = buildSessionRowCautionIndicator(r);
    expect(ind.show).toBe(false);
    expect(ind.label).toBe(ROW_CAUTION_LABEL);
  });
  it("buildSessionRowCautionIndicator: shown for low confidence", () => {
    const r = makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 });
    expect(buildSessionRowCautionIndicator(r).show).toBe(true);
  });
  it("buildSessionRowCautionIndicator: shown for elevated risk", () => {
    const r = makeRow("a", { riskLevel: "high" });
    expect(buildSessionRowCautionIndicator(r).show).toBe(true);
  });
  it("isSessionLimitedContext: false when grow/plant/tent or evidence present", () => {
    expect(isSessionLimitedContext(makeRow("a"))).toBe(false);
  });
  it("isSessionLimitedContext: true when no IDs and no evidence", () => {
    const r = makeRow(
      "a",
      { evidence: [] },
      { plant_id: null, tent_id: null, grow_id: null },
    );
    expect(isSessionLimitedContext(r)).toBe(true);
  });
});

describe("AiDoctorSessionsIndex — caution / limited-context rendering", () => {
  it("shows caution indicator for low-confidence row", async () => {
    currentRows = [
      makeRow("low-conf", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows caution indicator for elevated-risk row", async () => {
    currentRows = [makeRow("high-risk", { riskLevel: "high" })];
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-caution-indicator"),
    ).toBeTruthy();
  });

  it("does not show caution for healthy/high-confidence row", async () => {
    currentRows = [makeRow("healthy")];
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-row");
    expect(
      screen.queryByTestId("ai-doctor-sessions-index-caution-indicator"),
    ).toBeNull();
  });

  it("shows limited-context fallback when evidence/context is missing", async () => {
    currentRows = [
      makeRow(
        "sparse",
        { evidence: [] },
        { plant_id: null, tent_id: null, grow_id: null },
      ),
    ];
    renderWithProviders(<AiDoctorSessionsIndex />);
    const badge = await screen.findByTestId(
      "ai-doctor-sessions-index-limited-context-indicator",
    );
    expect(badge.textContent).toMatch(new RegExp(LIMITED_CONTEXT_LABEL, "i"));
  });

  it("preserves filters, pagination controls, and row navigation", async () => {
    currentRows = [makeRow("a"), makeRow("b", {}, { id: "b" })];
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findAllByTestId("ai-doctor-sessions-index-row");
    expect(screen.getByTestId("ai-doctor-sessions-index-filter-risk")).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-sessions-index-filter-has-actions"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-sessions-index-filter-date-range"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-sessions-index-filter-needs-review"),
    ).toBeTruthy();
    const viewLinks = screen.getAllByTestId("ai-doctor-sessions-index-view-link");
    expect(viewLinks.length).toBeGreaterThan(0);
    expect(viewLinks[0].getAttribute("href")).toMatch(/^\/doctor\/sessions\//);
  });
});

describe("Static safety scan — index caution slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const PAGE = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const VM = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionDetailViewModel.ts"),
    "utf8",
  );
  const ALL = [PAGE, VM].join("\n");

  it("no writes", () => {
    for (const src of [PAGE, VM]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
  });
  it("no service_role", () => {
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
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
});
