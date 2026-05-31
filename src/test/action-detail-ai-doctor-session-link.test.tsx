/**
 * Action Detail header — "Linked from AI Doctor" affordance.
 *
 * Read-only:
 *   - Renders only for source=ai_doctor rows with a parseable [session:<id>].
 *   - Anchor uses aiDoctorSessionDetailPath(sessionId).
 *   - Does not leak raw [session:<id>] tokens or target_device.
 *   - Copy never implies execution / automation / device control.
 *   - Preserves the existing "Suggestion origin" panel.
 *   - Static safety: no new write paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ActionDetail from "@/pages/ActionDetail";
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
  ...AI_DOCTOR_ROW,
  id: "aq-coach-1",
  source: "ai_coach",
  reason: "Mold risk rising.",
  suggested_change: "Lower humidity to 55%",
};

let detailRow: unknown = AI_DOCTOR_ROW;

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: detailRow, error: null }),
        then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
          resolve({ data: [detailRow], error: null }),
      }),
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: [detailRow], error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
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
      insert: () => Promise.resolve({ data: null, error: null }),
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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  detailRow = AI_DOCTOR_ROW;
});

function renderDetail(actionId = "aq-ai-1") {
  return render(
    <MemoryRouter initialEntries={[`/actions/${actionId}`]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionDetail header — Linked from AI Doctor affordance", () => {
  it("shows 'Linked from AI Doctor' on AI Doctor action with a valid session id", async () => {
    renderDetail();
    const chip = await screen.findByTestId(
      "action-detail-ai-doctor-session-header-link",
    );
    expect(chip.textContent ?? "").toMatch(/linked from ai doctor/i);
  });

  it("renders a single 'View saved AI Doctor session' anchor with route helper href", async () => {
    renderDetail();
    // After unification there is exactly ONE header session link.
    const anchor = (await screen.findByTestId(
      "action-detail-ai-doctor-saved-session-link",
    )) as HTMLAnchorElement;
    expect(anchor.textContent ?? "").toBe("View saved AI Doctor session");
    expect(anchor.getAttribute("href")).toBe(aiDoctorSessionDetailPath("sess-abc"));
    // The legacy header anchor testid is removed.
    expect(
      screen.queryByTestId("action-detail-ai-doctor-session-header-link-anchor"),
    ).toBeNull();
  });

  it("does not render the affordance when AI Doctor row lacks a session id", async () => {
    detailRow = AI_DOCTOR_ROW_NO_SESSION;
    renderDetail("aq-ai-2");
    await screen.findByText("Raise the light by 10 cm");
    expect(
      screen.queryByTestId("action-detail-ai-doctor-session-header-link"),
    ).toBeNull();
    expect(
      screen.queryByTestId("action-detail-ai-doctor-saved-session-link"),
    ).toBeNull();
  });

  it("does not render the affordance on non-AI-Doctor actions", async () => {
    detailRow = COACH_ROW;
    renderDetail("aq-coach-1");
    await screen.findByText("Lower humidity to 55%");
    expect(
      screen.queryByTestId("action-detail-ai-doctor-session-header-link"),
    ).toBeNull();
  });

  it("preserves the existing 'Suggestion origin' panel for AI Doctor rows", async () => {
    renderDetail();
    const panel = await screen.findByTestId("action-detail-ai-doctor-provenance");
    expect(panel.textContent ?? "").toContain("Suggestion origin");
  });

  it("never leaks raw [session:<id>] token into the header chip", async () => {
    renderDetail();
    const chip = await screen.findByTestId(
      "action-detail-ai-doctor-session-header-link",
    );
    expect(chip.innerHTML).not.toContain("[session:");
  });

  it("does not render target_device inside the header chip", async () => {
    renderDetail();
    const chip = await screen.findByTestId(
      "action-detail-ai-doctor-session-header-link",
    );
    expect(chip.textContent ?? "").not.toContain("secret-device-name");
  });

  it("header chip copy does not imply execution / automation / device control", async () => {
    renderDetail();
    const chip = await screen.findByTestId(
      "action-detail-ai-doctor-session-header-link",
    );
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
      "complete",
    ]) {
      expect(txt).not.toContain(banned);
    }
  });
});

// --- Static safety scans ----------------------------------------------------

const DETAIL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionDetail.tsx"),
  "utf8",
);

describe("ActionDetail header affordance — static safety", () => {
  it("introduces no new write paths into action_queue", () => {
    const lower = DETAIL_SRC.toLowerCase();
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
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.insert\(/,
    );
  });

  it("uses the shared route helper for the session link", () => {
    expect(DETAIL_SRC).toMatch(/aiDoctorSessionDetailPath\(/);
  });

  it("uses the pure extractor for session ids", () => {
    expect(DETAIL_SRC).toMatch(/extractSourceAiDoctorSessionId\(/);
  });
});
