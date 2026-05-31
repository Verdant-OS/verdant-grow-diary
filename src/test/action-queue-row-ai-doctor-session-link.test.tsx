/**
 * Action Queue rows — "Linked from AI Doctor" affordance.
 *
 * Read-only:
 *   - Only AI Doctor-sourced rows with a parseable [session:<id>] back-pointer
 *     render a "Linked from AI Doctor" chip + "View AI Doctor session" link.
 *   - Non-AI-Doctor rows never render it.
 *   - AI Doctor rows missing a valid session id render no broken link.
 *   - Raw [session:<id>] tokens and target_device never leak into the row.
 *   - Copy never implies execution / automation / device control.
 *   - Existing focus / Clear focus / badges remain.
 *   - Static safety: no new write paths introduced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";
import { aiDoctorSessionDetailPath } from "@/lib/routes";

const AI_DOCTOR_ROW = {
  id: "aq-ai-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "ai_doctor",
  action_type: "raise_light",
  target_metric: "general",
  target_device: "secret-device-name",
  suggested_change: "Raise the light by 10 cm",
  reason: "Reduce radiant load. [session:sess-abc]",
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-27T10:00:00Z",
  updated_at: "2026-05-27T10:00:00Z",
};

const AI_DOCTOR_ROW_NO_SESSION = {
  ...AI_DOCTOR_ROW,
  id: "aq-ai-2",
  reason: "Reduce radiant load.",
};

const COACH_ROW = {
  id: "aq-coach-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "ai_coach",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  target_device: null,
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk rising.",
  risk_level: "low",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-27T11:00:00Z",
  updated_at: "2026-05-27T11:00:00Z",
};

let listRows: unknown[] = [AI_DOCTOR_ROW, AI_DOCTOR_ROW_NO_SESSION, COACH_ROW];
const insertSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: listRows, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  const makeEventsChain = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      eq: () => chain,
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeActionQueueChain();
        if (table === "action_queue_events") return makeEventsChain();
        return makeGeneric();
      },
    },
  };
});

const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } };
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
};
const SCOPED_GROW_STATE = {
  urlGrowId: null,
  scopedGrowName: null,
  backHref: "/actions",
};

vi.mock("@/store/auth", () => ({ useAuth: () => AUTH_STATE }));
vi.mock("@/store/grows", () => ({ useGrows: () => GROWS_STATE }));
vi.mock("@/hooks/useScopedGrow", () => ({ useScopedGrow: () => SCOPED_GROW_STATE }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  insertSpy.mockClear();
  listRows = [AI_DOCTOR_ROW, AI_DOCTOR_ROW_NO_SESSION, COACH_ROW];
});

function renderList(url = "/actions") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

describe("Action Queue row — Linked from AI Doctor affordance", () => {
  it("renders 'Linked from AI Doctor' on AI Doctor row with a valid session id", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-ai-1"]') as HTMLElement;
    const chip = row.querySelector(
      '[data-testid="action-queue-row-ai-doctor-session-link"]',
    ) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent ?? "").toMatch(/linked from ai doctor/i);
  });

  it("renders 'View saved AI Doctor session' anchor with the route helper href", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-ai-1"]') as HTMLElement;
    const anchor = row.querySelector(
      '[data-testid="action-queue-row-ai-doctor-session-link-anchor"]',
    ) as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.textContent ?? "").toBe("View saved AI Doctor session");
    expect(anchor.getAttribute("href")).toBe(aiDoctorSessionDetailPath("sess-abc"));
  });

  it("no longer renders the legacy 'View AI Doctor session' label on the row", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-ai-1"]') as HTMLElement;
    const anchor = row.querySelector(
      '[data-testid="action-queue-row-ai-doctor-session-link-anchor"]',
    ) as HTMLAnchorElement;
    expect((anchor.textContent ?? "").trim()).not.toBe("View AI Doctor session");
  });

  it("does not render the affordance when AI Doctor row lacks a session id", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    const row = document.querySelector('[data-action-id="aq-ai-2"]') as HTMLElement;
    expect(row).toBeTruthy();
    expect(
      row.querySelector('[data-testid="action-queue-row-ai-doctor-session-link"]'),
    ).toBeNull();
    // No broken anchor either.
    expect(
      row.querySelector('[data-testid="action-queue-row-ai-doctor-session-link-anchor"]'),
    ).toBeNull();
  });

  it("does not render the affordance on non-AI-Doctor rows", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    const row = document.querySelector('[data-action-id="aq-coach-1"]') as HTMLElement;
    expect(
      row.querySelector('[data-testid="action-queue-row-ai-doctor-session-link"]'),
    ).toBeNull();
  });

  it("never leaks raw [session:<id>] token into the row markup", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-ai-1"]') as HTMLElement;
    expect(row.innerHTML).not.toContain("[session:");
  });

  it("does not render target_device inside the affordance", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const chip = document.querySelector(
      '[data-action-id="aq-ai-1"] [data-testid="action-queue-row-ai-doctor-session-link"]',
    ) as HTMLElement;
    expect(chip.textContent ?? "").not.toContain("secret-device-name");
  });

  it("copy never implies execution / automation / device control", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const chip = document.querySelector(
      '[data-action-id="aq-ai-1"] [data-testid="action-queue-row-ai-doctor-session-link"]',
    ) as HTMLElement;
    const txt = (chip.textContent ?? "").toLowerCase();
    for (const banned of [
      "auto-execute",
      "automatically",
      "send command",
      "execute now",
      "turn on",
      "turn off",
      "actuate",
      "relay",
      "approve",
      "reject",
    ]) {
      expect(txt).not.toContain(banned);
    }
  });

  it("preserves existing AI Doctor + Review required badges on AI Doctor rows", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-ai-1"]') as HTMLElement;
    expect(
      row.querySelector('[data-testid="action-queue-row-ai-doctor-badge"]'),
    ).toBeTruthy();
    expect(
      row.querySelector('[data-testid="action-queue-row-review-required-badge"]'),
    ).toBeTruthy();
  });

  it("preserves /actions?focus=<id> highlight + Clear focus controls", async () => {
    renderList("/actions?focus=aq-ai-1");
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="action-queue-focus-chip"]'),
      ).toBeTruthy(),
    );
    const focused = document.querySelector(
      '[data-action-id="aq-ai-1"][data-focused="true"]',
    );
    expect(focused).toBeTruthy();
    const clear = document.querySelector(
      '[data-testid="action-queue-clear-focus"]',
    ) as HTMLButtonElement;
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="action-queue-focus-chip"]'),
      ).toBeNull(),
    );
  });
});

// --- Static safety scans ----------------------------------------------------

const QUEUE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("Linked-from-AI-Doctor affordance — static safety", () => {
  it("introduces no new write paths into action_queue", () => {
    // The page already has a constrained set of writes for approve/reject/etc.
    // The new affordance must NOT add insert/update/delete/upsert/rpc against
    // action_queue, nor invoke any edge function.
    const lower = QUEUE_SRC.toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.upsert\(/,
    );
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.delete\(/,
    );
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.rpc\(/,
    );
    // No new insert to action_queue: only inserts allowed are into
    // action_queue_events for approve/reject/etc audit. Assert no insert call
    // is chained to from('action_queue').
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.insert\(/,
    );
  });

  it("uses the shared route helper for the session link", () => {
    expect(QUEUE_SRC).toMatch(/aiDoctorSessionDetailPath\(/);
  });

  it("uses the pure extractor for session ids", () => {
    expect(QUEUE_SRC).toMatch(/extractSourceAiDoctorSessionId\(/);
  });
});
