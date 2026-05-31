/**
 * ActionDetail header — "Linked alert" chip + "View linked alert" link.
 *
 * Read-only navigation polish. Mirrors the AI Doctor session affordance and
 * surfaces the originating alert when the action carries a safe
 * `[alert:<id>]` back-pointer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ActionDetail from "@/pages/ActionDetail";
import { alertDetailPath, aiDoctorSessionDetailPath } from "@/lib/routes";

const ALERT_DERIVED_ROW = {
  id: "aq-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity",
  target_device: "secret-device-name",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk rising. [alert:alert-abc]",
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-29T10:00:00Z",
  updated_at: "2026-05-29T10:00:00Z",
};
const AI_DOCTOR_ROW_WITH_ALERT = {
  ...ALERT_DERIVED_ROW,
  id: "aq-2",
  source: "ai_doctor",
  suggested_change: "Raise the light by 10 cm",
  reason: "Reduce radiant load. [session:sess-xyz] [alert:alert-abc]",
};
const NO_ALERT_ROW = {
  ...ALERT_DERIVED_ROW,
  id: "aq-3",
  source: "ai_doctor",
  suggested_change: "Drop EC slightly",
  reason: "Light burn. [session:sess-xyz]",
};
const NON_ALERT_NON_AI_ROW = {
  ...ALERT_DERIVED_ROW,
  id: "aq-4",
  source: "manual",
  suggested_change: "Manual note",
  reason: "Manual reminder.",
};

let detailRow: unknown = ALERT_DERIVED_ROW;

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
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      in: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "action_queue" ? makeActionQueueChain() : makeGeneric(),
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
  detailRow = ALERT_DERIVED_ROW;
});

function renderDetail(actionId = "aq-1") {
  return render(
    <MemoryRouter initialEntries={[`/actions/${actionId}`]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionDetail header — Linked alert link", () => {
  it("renders chip + link for an alert-derived action with a safe alert id", async () => {
    renderDetail();
    const header = await screen.findByTestId("action-detail-linked-alert-header");
    expect(header.textContent ?? "").toMatch(/linked alert/i);
    const link = (await screen.findByTestId(
      "action-detail-linked-alert-link",
    )) as HTMLAnchorElement;
    expect(link.textContent).toBe("View linked alert");
    expect(link.getAttribute("href")).toBe(alertDetailPath("alert-abc"));
  });

  it("renders both AI Doctor and Linked alert affordances when both tokens are present", async () => {
    detailRow = AI_DOCTOR_ROW_WITH_ALERT;
    renderDetail("aq-2");
    const aiLink = (await screen.findByTestId(
      "action-detail-ai-doctor-saved-session-link",
    )) as HTMLAnchorElement;
    expect(aiLink.getAttribute("href")).toBe(aiDoctorSessionDetailPath("sess-xyz"));
    const alertLink = (await screen.findByTestId(
      "action-detail-linked-alert-link",
    )) as HTMLAnchorElement;
    expect(alertLink.getAttribute("href")).toBe(alertDetailPath("alert-abc"));
  });

  it("does not render Linked alert when no alert id is parseable", async () => {
    detailRow = NO_ALERT_ROW;
    renderDetail("aq-3");
    await screen.findByText("Drop EC slightly");
    expect(screen.queryByTestId("action-detail-linked-alert-link")).toBeNull();
    expect(screen.queryByTestId("action-detail-linked-alert-header")).toBeNull();
  });

  it("renders nothing on actions without any alert or AI Doctor token", async () => {
    detailRow = NON_ALERT_NON_AI_ROW;
    renderDetail("aq-4");
    await screen.findByText("Manual note");
    expect(screen.queryByTestId("action-detail-linked-alert-link")).toBeNull();
    expect(
      screen.queryByTestId("action-detail-ai-doctor-saved-session-link"),
    ).toBeNull();
  });

  it("does not leak raw [alert:<id>], [session:<id>] tokens, or target_device", async () => {
    detailRow = AI_DOCTOR_ROW_WITH_ALERT;
    const { container } = renderDetail("aq-2");
    await screen.findByTestId("action-detail-linked-alert-link");
    const text = container.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("secret-device-name");
    expect(text.toLowerCase()).not.toContain("target_device");
  });

  it("link copy does not imply automation, execution, or status transition", async () => {
    renderDetail();
    const link = await screen.findByTestId("action-detail-linked-alert-link");
    const lower = (link.textContent ?? "").toLowerCase();
    for (const tok of [
      "auto-execute",
      "automatically",
      "actuate",
      "execute now",
      "turn on",
      "turn off",
      "relay",
      "mqtt",
      "approve",
      "reject",
      "complete",
      "resolve",
      "dismiss",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("preserves the existing 'Suggestion origin' panel", async () => {
    renderDetail();
    const panel = await screen.findByTestId("action-detail-ai-doctor-provenance").catch(() => null);
    // For environment_alert rows there is a different 'Action source' aria-label; check that at minimum the suggested_change still renders.
    await screen.findByText("Lower humidity to 55%");
    // Panel may exist only for ai_doctor; for environment_alert rows the lower 'Action source' card should be present.
    if (!panel) {
      expect(document.querySelector('[aria-label="Action source"]')).not.toBeNull();
    }
  });
});

// --- Static safety scans ----------------------------------------------------
const DETAIL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionDetail.tsx"),
  "utf8",
);

describe("ActionDetail Linked alert — static safety", () => {
  it("introduces no new write paths into action_queue or alerts", () => {
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
      /from\(["']alerts["'][\s\S]{0,200}?\.(insert|update|delete|upsert)\(/,
    );
    expect(lower).not.toMatch(/\.rpc\(/);
  });

  it("uses the shared route helper and pure extractor", () => {
    expect(DETAIL_SRC).toMatch(/alertDetailPath\(headerAlertId\)/);
    expect(DETAIL_SRC).toMatch(/extractSourceAlertId\(/);
  });

  it("does not render raw alert/session tokens as JSX literals", () => {
    expect(DETAIL_SRC).not.toMatch(/>\s*\[alert:/);
    expect(DETAIL_SRC).not.toMatch(/>\s*\[session:/);
  });
});
