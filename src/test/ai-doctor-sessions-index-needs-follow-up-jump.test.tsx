/**
 * AI Doctor Sessions index — "Jump to Needs follow-up" chip behavior.
 *
 * Clicking the visible-count chip applies the built-in "Needs follow-up"
 * saved view via existing logic. No DB writes, no AI, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  SAVED_VIEWS_STORAGE_KEY,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

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

vi.mock("@/integrations/supabase/client", () => {
  function makeChain(initial: unknown[]) {
    let current = initial;
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.in = (_column: string, values: unknown) => {
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
      from: (table: string) =>
        table === "ai_doctor_session_reviews"
          ? makeChain(reviewRows)
          : makeChain(sessionRows),
    },
  };
});

function makeRow(id: string, over: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
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

function LocationProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CHIP_TID = "ai-doctor-sessions-index-needs-follow-up-visible-chip";
const SELECT_TID = "ai-doctor-sessions-saved-views-select";

beforeEach(() => {
  sessionRows = [makeRow("a"), makeRow("b"), makeRow("c")];
  reviewRows = [];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — Jump to Needs follow-up chip", () => {
  it("chip renders as a clickable <button>", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.getAttribute("type")).toBe("button");
    expect(chip.hasAttribute("disabled")).toBe(false);
  });

  it("tooltip/title makes the scope clear with 'visible count only'", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    const title = (chip.getAttribute("title") ?? "").toLowerCase();
    expect(title).toContain("visible count only");
    expect(title).toContain("needs follow-up");
  });

  it("clicking the chip applies the built-in Needs follow-up saved view (URL + selector sync)", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    fireEvent.click(chip);
    await waitFor(() => {
      const search = screen.getByTestId("probe-search").textContent ?? "";
      expect(search).toContain("reviewStatus=needs_follow_up");
    });
    const select = screen.getByTestId(SELECT_TID) as HTMLSelectElement;
    expect(select.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID);
    const reviewSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-review-status",
    )) as HTMLSelectElement;
    expect(reviewSel.value).toBe("needs_follow_up");
  });

  it("clicking still works when the visible count is 0", async () => {
    // No review events seeded -> count is 0, but chip must remain clickable.
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.textContent).toBe("Needs follow-up: 0 visible");
    expect(chip.hasAttribute("disabled")).toBe(false);
    fireEvent.click(chip);
    await waitFor(() => {
      const search = screen.getByTestId("probe-search").textContent ?? "";
      expect(search).toContain("reviewStatus=needs_follow_up");
    });
  });

  it("existing label copy is unchanged", async () => {
    reviewRows = [
      {
        id: "e1",
        user_id: "u",
        session_id: "a",
        event_type: "needs_follow_up",
        note: null,
        created_at: "2026-05-28T10:00:00Z",
      },
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 1 visible"),
    );
  });

  it("does not interfere with the built-in 'Needs my attention' preset", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    const select = (await screen.findByTestId(SELECT_TID)) as HTMLSelectElement;
    await waitFor(() =>
      expect(select.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID),
    );
    // The chip remains visible and clickable; it does not silently navigate.
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.tagName).toBe("BUTTON");
  });
});

// ---------------- static safety scan ----------------

describe("Static safety scan — Jump chip slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const RULES = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionsSavedViewsRules.ts"),
    "utf8",
  );
  const ALL = `${TSX}\n${RULES}`;

  it("no DB writes", () => {
    for (const src of [TSX, RULES]) {
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
  it("no row-level mutation controls introduced", () => {
    expect(TSX).not.toMatch(/data-testid=["'][^"']*row-level-mark-review[^"']*["']/);
  });
  it("built-in id is imported from rules, not duplicated as a string literal in TSX", () => {
    // The TSX must reference the constant, not re-spell the id.
    expect(TSX).toMatch(/BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID/);
    expect(TSX).not.toMatch(/["']builtin:needs-follow-up["']/);
    // Filter values (e.g. reviewStatus="needs_follow_up") are not hand-rolled
    // for this chip's click handler; the helper/applySavedView path owns it.
    expect(TSX).not.toMatch(
      /onClick=\{[^}]*reviewStatus[^}]*needs_follow_up/,
    );
  });
});
