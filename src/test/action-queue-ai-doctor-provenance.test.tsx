/**
 * Action Queue — AI Doctor provenance polish.
 *
 * Read-only UI:
 *   - List rows for source=ai_doctor show "AI Doctor" badge + "Review required".
 *   - Non-AI-Doctor rows do NOT show those badges.
 *   - Detail page renders a "Suggestion origin" panel for source=ai_doctor.
 *   - Detail panel exposes a safe "View AI Doctor session" link only when a
 *     valid session id is parsed from the reason back-pointer.
 *   - Raw [session:<id>] tokens never leak into UI.
 *   - target_device is never rendered in the provenance panel.
 *   - Copy never implies execution / automation / device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";
import ActionDetail from "@/pages/ActionDetail";

// --- Pure helper unit tests -------------------------------------------------

import {
  extractSourceAiDoctorSessionId,
  isAiDoctorDerived,
  stripBackPointerTokens,
} from "@/lib/actionQueueProvenanceRules";

describe("actionQueueProvenanceRules — AI Doctor helpers", () => {
  it("extracts a session id from [session:<id>]", () => {
    expect(
      extractSourceAiDoctorSessionId("Reduce heat. [session:sess-1]"),
    ).toBe("sess-1");
  });
  it("returns null for missing/malformed tokens", () => {
    expect(extractSourceAiDoctorSessionId(null)).toBeNull();
    expect(extractSourceAiDoctorSessionId("")).toBeNull();
    expect(extractSourceAiDoctorSessionId("no token here")).toBeNull();
    expect(extractSourceAiDoctorSessionId("[session:]")).toBeNull();
  });
  it("identifies ai_doctor-sourced rows", () => {
    expect(isAiDoctorDerived({ source: "ai_doctor" })).toBe(true);
    expect(isAiDoctorDerived({ source: "ai_coach" })).toBe(false);
    expect(isAiDoctorDerived(null)).toBe(false);
  });
  it("strips both alert and session back-pointers", () => {
    expect(
      stripBackPointerTokens("Mold risk. [session:s1] [alert:a1] check soon."),
    ).toBe("Mold risk. check soon.");
  });
});

// --- Fixtures ---------------------------------------------------------------

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

const AI_DOCTOR_ROW_NO_SESSION = {
  ...AI_DOCTOR_ROW,
  id: "aq-ai-2",
  reason: "Reduce radiant load.",
};

const insertSpy = vi.fn();
let listRows: unknown[] = [AI_DOCTOR_ROW, COACH_ROW];
let detailRow: unknown = AI_DOCTOR_ROW;

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (_col: string, _val: unknown) => {
        const c2: Record<string, unknown> = {
          maybeSingle: () =>
            Promise.resolve({ data: detailRow, error: null }),
          then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
            resolve({ data: listRows, error: null }),
        };
        return c2;
      },
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: listRows, error: null }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
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
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
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

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() } }));

beforeEach(() => {
  insertSpy.mockClear();
  listRows = [AI_DOCTOR_ROW, COACH_ROW];
  detailRow = AI_DOCTOR_ROW;
});

function renderList(url = "/actions") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

function renderDetail(actionId = "aq-ai-1") {
  return render(
    <MemoryRouter initialEntries={[`/actions/${actionId}`]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionQueue list — AI Doctor provenance badges", () => {
  it("AI Doctor row shows 'AI Doctor' badge", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const aiRow = document.querySelector(
      '[data-action-id="aq-ai-1"]',
    ) as HTMLElement;
    expect(aiRow).toBeTruthy();
    expect(
      aiRow.querySelector('[data-testid="action-queue-row-ai-doctor-badge"]'),
    ).toBeTruthy();
  });

  it("AI Doctor row shows 'Review required' helper", async () => {
    renderList();
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-testid="action-queue-row-review-required-badge"]',
        ),
      ).toBeTruthy(),
    );
    const badge = document.querySelector(
      '[data-testid="action-queue-row-review-required-badge"]',
    ) as HTMLElement;
    expect(badge.textContent ?? "").toMatch(/review required/i);
  });

  it("non-AI-Doctor row does not show AI Doctor badge", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(2),
    );
    const coachRow = document.querySelector(
      '[data-action-id="aq-coach-1"]',
    ) as HTMLElement;
    expect(coachRow).toBeTruthy();
    expect(
      coachRow.querySelector('[data-testid="action-queue-row-ai-doctor-badge"]'),
    ).toBeNull();
    expect(
      coachRow.querySelector(
        '[data-testid="action-queue-row-review-required-badge"]',
      ),
    ).toBeNull();
  });

  it("never renders [session:<id>] token in list", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    expect(document.body.innerHTML).not.toContain("[session:");
  });
});

describe("ActionDetail — AI Doctor provenance panel", () => {
  it("shows 'Suggestion origin' panel for source=ai_doctor", async () => {
    renderDetail();
    const panel = await screen.findByTestId(
      "action-detail-ai-doctor-provenance",
    );
    expect(panel.textContent ?? "").toContain("Suggestion origin");
    expect(panel.textContent ?? "").toContain("Source: AI Doctor");
    expect(panel.textContent ?? "").toMatch(/grower (review|approval)/i);
  });

  it("renders a 'View saved AI Doctor session' link when a session id is parseable", async () => {
    renderDetail();
    const link = (await screen.findByTestId(
      "action-detail-ai-doctor-session-link",
    )) as HTMLAnchorElement;
    expect(link.textContent ?? "").toBe("View saved AI Doctor session");
    expect(link.getAttribute("href")).toBe("/doctor/sessions/sess-abc");
  });

  it("does NOT render a session link when no session id is present", async () => {
    detailRow = AI_DOCTOR_ROW_NO_SESSION;
    renderDetail("aq-ai-2");
    await screen.findByTestId("action-detail-ai-doctor-provenance");
    expect(
      screen.queryByTestId("action-detail-ai-doctor-session-link"),
    ).toBeNull();
  });

  it("does NOT render the panel for non-AI-Doctor sources", async () => {
    detailRow = COACH_ROW;
    renderDetail("aq-coach-1");
    await screen.findByText("Lower humidity to 55%");
    expect(
      screen.queryByTestId("action-detail-ai-doctor-provenance"),
    ).toBeNull();
  });

  it("never renders [session:<id>] token anywhere on the detail page", async () => {
    renderDetail();
    await screen.findByTestId("action-detail-ai-doctor-provenance");
    expect(document.body.innerHTML).not.toContain("[session:");
  });

  it("does not render target_device inside the provenance panel", async () => {
    renderDetail();
    const panel = await screen.findByTestId(
      "action-detail-ai-doctor-provenance",
    );
    expect(panel.textContent ?? "").not.toContain("secret-device-name");
  });

  it("provenance copy does not imply execution/automation/device control", async () => {
    renderDetail();
    const panel = await screen.findByTestId(
      "action-detail-ai-doctor-provenance",
    );
    const txt = (panel.textContent ?? "").toLowerCase();
    for (const banned of [
      "auto-execute",
      "automatically",
      "send command",
      "execute now",
      "turn on",
      "turn off",
      "actuate",
      "relay",
    ]) {
      expect(txt).not.toContain(banned);
    }
  });
});



// --- Static safety scans ----------------------------------------------------

const QUEUE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);
const DETAIL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionDetail.tsx"),
  "utf8",
);
const RULES_SRC = readFileSync(
  resolve(__dirname, "../..", "src/lib/actionQueueProvenanceRules.ts"),
  "utf8",
);

describe("AI Doctor provenance — static safety scan", () => {
  for (const [name, src] of [
    ["ActionQueue", QUEUE_SRC],
    ["ActionDetail", DETAIL_SRC],
    ["ProvenanceRules", RULES_SRC],
  ] as const) {
    it(`${name} introduces no functions.invoke / service_role / device-control verbs`, () => {
      const lower = src.toLowerCase();
      expect(lower).not.toContain("functions.invoke");
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
      ]) {
        expect(lower).not.toContain(tok);
      }
    });
  }

  it("ProvenanceRules helper file performs no DB writes", () => {
    expect(RULES_SRC).not.toMatch(/\.insert\(/);
    expect(RULES_SRC).not.toMatch(/\.update\(/);
    expect(RULES_SRC).not.toMatch(/\.delete\(/);
    expect(RULES_SRC).not.toMatch(/\.upsert\(/);
    expect(RULES_SRC).not.toMatch(/\.rpc\(/);
    expect(RULES_SRC).not.toMatch(/supabase/i);
  });

  it("ActionDetail scrubs row.reason before rendering", () => {
    // The header reason text must go through stripBackPointerTokens — otherwise
    // [session:<id>] would leak into grower-visible copy.
    expect(DETAIL_SRC).toMatch(/stripBackPointerTokens\(\s*row\.reason\s*\)/);
  });
});
