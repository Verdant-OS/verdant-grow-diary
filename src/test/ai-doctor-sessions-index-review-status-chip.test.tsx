/**
 * AI Doctor Sessions index — read-only review-status chip on row.
 *
 * Renders durable review status from `ai_doctor_session_reviews` via
 * `useAiDoctorSessionReviews` + `buildSessionReviewStatusIndicator`.
 *
 * Safety: read-only. No mutations, no AI calls, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

interface ReviewRow {
  id: string;
  user_id: string;
  session_id: string;
  event_type: "marked_reviewed" | "needs_follow_up" | "cleared";
  note: string | null;
  created_at: string;
}

let sessionRows: AiDoctorSessionRow[] = [];
let reviewRows: ReviewRow[] = [];
let reviewInCalls: Array<{ column: string; values: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeChain(initial: unknown[]) {
    let current = initial;
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.in = (column: string, values: unknown) => {
      reviewInCalls.push({ column, values });
      if (Array.isArray(values)) {
        current = (current as ReviewRow[]).filter((r) =>
          (values as string[]).includes(r.session_id),
        );
      }
      return chain;
    };
    chain.then = (resolveFn: (v: unknown) => unknown) =>
      Promise.resolve({ data: current, error: null }).then(resolveFn);
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table === "ai_doctor_session_reviews") return makeChain(reviewRows);
        return makeChain(sessionRows);
      },
    },
  };
});

function makeRow(
  id: string,
  over: Partial<AiDoctorSessionRow> = {},
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
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions"]}>
        <AiDoctorSessionsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CHIP_TID = "ai-doctor-sessions-index-review-status-chip";

beforeEach(() => {
  sessionRows = [makeRow("s1"), makeRow("s2"), makeRow("s3")];
  reviewRows = [];
  reviewInCalls = [];
});

describe("Review-status chip on session rows", () => {
  it("renders no chip when no review events exist", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await waitFor(() => {
      expect(reviewInCalls.length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByTestId(CHIP_TID)).toHaveLength(0);
  });

  it("renders a muted 'Reviewed' chip for reviewed sessions", async () => {
    reviewRows = [
      {
        id: "e1",
        user_id: "u",
        session_id: "s1",
        event_type: "marked_reviewed",
        note: null,
        created_at: "2026-05-28T10:00:00Z",
      },
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.textContent).toContain("Reviewed");
    expect(chip.getAttribute("data-review-status")).toBe("reviewed");
    expect(chip.getAttribute("data-review-tone")).toBe("muted");
    expect(chip.getAttribute("data-latest-event-at")).toBe(
      "2026-05-28T10:00:00Z",
    );
    expect(chip.getAttribute("title")).toContain("Reviewed");
    expect(chip.getAttribute("title")).toContain("2026-05-28T10:00:00Z");
  });

  it("renders an amber 'Needs follow-up' chip with note in title", async () => {
    reviewRows = [
      {
        id: "e1",
        user_id: "u",
        session_id: "s2",
        event_type: "needs_follow_up",
        note: "Recheck pH tomorrow",
        created_at: "2026-05-29T08:00:00Z",
      },
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.textContent).toContain("Needs follow-up");
    expect(chip.getAttribute("data-review-status")).toBe("needs_follow_up");
    expect(chip.getAttribute("data-review-tone")).toBe("amber");
    expect(chip.getAttribute("title")).toContain("Recheck pH tomorrow");
    expect(chip.getAttribute("title")).toContain("2026-05-29T08:00:00Z");
  });

  it("hides the chip again after a 'cleared' event", async () => {
    reviewRows = [
      {
        id: "e1",
        user_id: "u",
        session_id: "s1",
        event_type: "marked_reviewed",
        note: null,
        created_at: "2026-05-28T10:00:00Z",
      },
      {
        id: "e2",
        user_id: "u",
        session_id: "s1",
        event_type: "cleared",
        note: null,
        created_at: "2026-05-29T10:00:00Z",
      },
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await waitFor(() => {
      expect(reviewInCalls.length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByTestId(CHIP_TID)).toHaveLength(0);
  });

  it("scopes the review query to the visible session IDs", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await waitFor(() => {
      expect(reviewInCalls.length).toBeGreaterThan(0);
    });
    const call = reviewInCalls[reviewInCalls.length - 1];
    expect(call.column).toBe("session_id");
    expect(Array.isArray(call.values)).toBe(true);
    expect(new Set(call.values as string[])).toEqual(
      new Set(["s1", "s2", "s3"]),
    );
  });

  it("preserves existing row cues (action count) alongside chip", async () => {
    reviewRows = [
      {
        id: "e1",
        user_id: "u",
        session_id: "s1",
        event_type: "marked_reviewed",
        note: null,
        created_at: "2026-05-28T10:00:00Z",
      },
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    // Existing per-row indicators still render.
    expect(
      screen.getAllByTestId("ai-doctor-sessions-index-action-count").length,
    ).toBeGreaterThan(0);
  });
});

describe("Static safety scan — review-status chip slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const RULES = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionReviewStatusRules.ts"),
    "utf8",
  );
  const HOOK = readFileSync(
    resolve(ROOT, "src/hooks/useAiDoctorSessionReviews.ts"),
    "utf8",
  );
  const ALL = `${TSX}\n${RULES}\n${HOOK}`;

  it("no DB writes anywhere in this slice", () => {
    for (const src of [RULES, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });

  it("no functions.invoke / service_role / action_queue / alerts / tasks writes", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
    expect(ALL).not.toMatch(/from(['"]action_queue['"])/);
    expect(ALL).not.toMatch(/from(['"]alerts['"])/);
    expect(ALL).not.toMatch(/from(['"]tasks['"])/);
  });

  it("no automation / device-control markers in TSX or hook", () => {
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
      expect(TSX.toLowerCase()).not.toContain(tok);
      expect(HOOK.toLowerCase()).not.toContain(tok);
    }
  });

  it("no AI generation calls in slice", () => {
    for (const src of [TSX, HOOK, RULES]) {
      expect(src).not.toMatch(/generateContent/);
      expect(src).not.toMatch(/openai/i);
      expect(src).not.toMatch(/anthropic/i);
    }
  });

  it("chip label strings are not duplicated in TSX", () => {
    // Labels live in buildSessionReviewStatusIndicator (rules). TSX must not
    // hard-code them inline as literals.
    const reviewedMatches = TSX.match(/"Reviewed"/g) ?? [];
    expect(reviewedMatches.length).toBe(0);
    expect(TSX).not.toContain('"Needs follow-up"');
    expect(TSX).toMatch(/buildSessionReviewStatusIndicator\(/);
  });
});
