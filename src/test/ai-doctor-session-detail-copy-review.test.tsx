/**
 * Tests for the "Copy review summary" button on the AI Doctor session detail page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import {
  buildReviewSummaryViewModel,
  formatDoctorReviewSummaryText,
  EMPTY_FALLBACKS,
} from "@/lib/aiDoctorSessionDetailViewModel";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    summary: "Mild heat stress on canopy.",
    likelyIssue: "Heat stress",
    confidence: 0.7,
    evidence: ["Tip curl visible", "Leaves cupping"],
    missingInformation: ["No leaf-surface temp"],
    possibleCauses: ["Light too close"],
    immediateAction: "Raise light 10cm.",
    whatNotToDo: ["Do not defoliate"],
    followUp24h: { summary: "Recheck temps.", checklist: ["Check leaf temp"] },
    recoveryPlan3d: { summary: "Stabilize VPD.", checklist: [] },
    riskLevel: "high",
    suggestedActions: [
      {
        type: "task",
        title: "Raise light",
        detail: "Raise light by 10cm.",
        priority: "medium",
        reason: "Reduce radiant load.",
        approvalRequired: true,
      },
    ],
    ...overrides,
  };
}

function makeRow(diagnosis: Diagnosis | null): AiDoctorSessionRow {
  return {
    id: "sess-copy",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis,
    raw_confidence: 0.8,
    displayed_confidence: 0.7,
    context_confidence_ceiling: "medium",
    suggested_actions: diagnosis?.suggestedActions ?? [],
  };
}

let currentRow: AiDoctorSessionRow | null = makeRow(makeDiagnosis());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-copy"]}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("formatDoctorReviewSummaryText — pure helper", () => {
  it("formats a full review summary as plain text", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: makeDiagnosis(),
      displayedConfidence: 0.7,
      rawConfidence: 0.8,
      suggestedActions: makeDiagnosis().suggestedActions,
    });
    const txt = formatDoctorReviewSummaryText(vm);
    expect(txt).toMatch(/AI Doctor — Review Summary/);
    expect(txt).toMatch(/Risk: high/);
    expect(txt).toMatch(/Confidence: 70%/);
    expect(txt).toMatch(/Likely issue:[\s\S]*Heat stress/);
    expect(txt).toMatch(/Evidence:[\s\S]*- Tip curl visible/);
    expect(txt).toMatch(/Missing information:[\s\S]*- No leaf-surface temp/);
    expect(txt).toMatch(/Suggested actions:[\s\S]*- Raise light — Raise light by 10cm\./);
    expect(txt).toMatch(/What not to do:[\s\S]*- Do not defoliate/);
    expect(txt).toMatch(/Next 24 hours:[\s\S]*Recheck temps\./);
    expect(txt).toMatch(/3-day recovery:[\s\S]*Stabilize VPD\./);
  });

  it("uses calm fallbacks for missing fields", () => {
    const vm = buildReviewSummaryViewModel({ diagnosis: null });
    const txt = formatDoctorReviewSummaryText(vm);
    expect(txt).toContain(EMPTY_FALLBACKS.likelyIssue);
    expect(txt).toContain(EMPTY_FALLBACKS.summary);
    expect(txt).toContain(EMPTY_FALLBACKS.evidence);
    expect(txt).toContain(EMPTY_FALLBACKS.missingInformation);
    expect(txt).toContain(EMPTY_FALLBACKS.suggestedActions);
    expect(txt).toContain(EMPTY_FALLBACKS.whatNotToDo);
    expect(txt).toContain(EMPTY_FALLBACKS.followUp);
  });

  it("does not include IDs, tokens, raw payloads, or service keys", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: makeDiagnosis(),
      displayedConfidence: 0.7,
      suggestedActions: makeDiagnosis().suggestedActions,
    });
    const txt = formatDoctorReviewSummaryText(vm);
    expect(txt).not.toMatch(/sess-copy/);
    expect(txt).not.toMatch(/p1|t1|g1/);
    expect(txt).not.toMatch(/service_role|token|api[_-]?key|secret/i);
    expect(txt).not.toMatch(/raw_payload|raw_confidence/);
  });
});

describe("AiDoctorSessionDetail — Copy review summary button", () => {
  beforeEach(() => {
    currentRow = makeRow(makeDiagnosis());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the copy button", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-review-button"),
    ).toBeTruthy();
  });

  it("uses Clipboard API when available and shows Copied success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-review-button");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toMatch(/Review Summary/);
    expect(writeText.mock.calls[0][0]).toMatch(/Tip curl visible/);
    expect(writeText.mock.calls[0][0]).toMatch(/No leaf-surface temp/);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-review-success"),
    ).toBeTruthy();
  });

  it("falls back to execCommand when clipboard is unavailable", async () => {
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execSpy = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = execSpy;
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-review-button");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(execSpy).toHaveBeenCalledWith("copy");
    });
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-review-success"),
    ).toBeTruthy();
  });

  it("shows error state when copy fails", async () => {
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(false);
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-review-button");
    fireEvent.click(btn);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-review-error"),
    ).toBeTruthy();
  });
});

describe("Copy review summary — safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const PAGE = read("src/pages/AiDoctorSessionDetail.tsx");
  const VM = read("src/lib/aiDoctorSessionDetailViewModel.ts");

  it("no DB writes, AI invocations, or action_queue/alerts writes", () => {
    for (const src of [PAGE, VM]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/ai-coach/);
    }
    const ALL = [PAGE, VM].join("\n").toLowerCase();
    expect(ALL).not.toContain("service_role");
    expect(ALL).not.toContain("action_queue");
    expect(ALL).not.toContain("alert_events");
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
    for (const tok of banned) expect(ALL).not.toContain(tok);
  });
});
