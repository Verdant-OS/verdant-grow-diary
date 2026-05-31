/**
 * AlertDetail — "View saved AI Doctor session" back-link.
 *
 * Renders only when an AI Doctor-derived Action Queue row is linked to this
 * alert via the `[alert:<id>]` back-pointer AND a safe AI Doctor session id
 * is parseable from its reason.
 *
 * Read-only navigation polish. No writes, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";
import { aiDoctorSessionDetailPath } from "@/lib/routes";

const ALERT = {
  id: "alert-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "vpd_high",
  severity: "warning",
  status: "open",
  metric: "vpd",
  title: "VPD too high",
  reason: "VPD has been elevated for 30 minutes.",
  first_seen_at: "2026-05-30T10:00:00Z",
  last_seen_at: "2026-05-30T10:30:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-30T10:00:00Z",
  updated_at: "2026-05-30T10:30:00Z",
};

// Mutable per-test fixtures.
let actionQueueRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/alerts", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/alerts");
  return {
    ...actual,
    getAlertById: vi.fn(async () => ALERT),
    logAlertEvent: vi.fn(async () => undefined),
  };
});

vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ events: [] }),
}));

vi.mock("@/integrations/supabase/client", () => {
  type Result = { data: unknown; error: null };
  const makeActionQueueChain = () => {
    let currentSource: string | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "source") currentSource = val;
        return chain;
      },
      in: () => chain,
      like: () => chain,
      order: () => chain,
      limit: () => {
        const data =
          currentSource === "ai_doctor"
            ? actionQueueRows.filter((r) => r.source === "ai_doctor")
            : currentSource === "environment_alert"
              ? actionQueueRows.filter((r) => r.source === "environment_alert")
              : actionQueueRows;
        return Promise.resolve({ data, error: null } as Result);
      },
      then: (resolve: (r: Result) => unknown) => {
        const data =
          currentSource === "ai_doctor"
            ? actionQueueRows.filter((r) => r.source === "ai_doctor")
            : currentSource === "environment_alert"
              ? actionQueueRows.filter((r) => r.source === "environment_alert")
              : actionQueueRows;
        return resolve({ data, error: null });
      },
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  const makeGeneric = () => {
    const result: Result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      in: () => chain,
      like: () => chain,
      order: () => Promise.resolve(result),
      limit: () => Promise.resolve(result),
      then: (resolve: (r: Result) => unknown) => resolve(result),
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));

beforeEach(() => {
  actionQueueRows = [];
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${ALERT.id}`]}>
      <Routes>
        <Route path="/alerts/:alertId" element={<AlertDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AlertDetail — View saved AI Doctor session link", () => {
  it("renders the chip and link when a linked AI Doctor action carries a safe session id", async () => {
    actionQueueRows = [
      {
        id: "aq-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    const link = (await screen.findByTestId(
      "alert-detail-ai-doctor-saved-session-link",
    )) as HTMLAnchorElement;
    expect(link.textContent).toBe("View saved AI Doctor session");
    expect(link.getAttribute("href")).toBe(aiDoctorSessionDetailPath("sess-xyz"));
    const chip = await screen.findByTestId("alert-detail-ai-doctor-review-chip");
    expect(chip.textContent ?? "").toMatch(/linked ai doctor review/i);
  });

  it("renders nothing when no AI Doctor session id is parseable", async () => {
    actionQueueRows = [
      {
        id: "aq-2",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
    ];
    renderDetail();
    await screen.findByText("VPD too high");
    await new Promise((r) => setTimeout(r, 30));
    expect(
      screen.queryByTestId("alert-detail-ai-doctor-saved-session-link"),
    ).toBeNull();
    expect(
      screen.queryByTestId("alert-detail-ai-doctor-review-section"),
    ).toBeNull();
  });

  it("ignores non-AI-Doctor linked actions", async () => {
    actionQueueRows = [
      {
        id: "aq-3",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    await screen.findByText("VPD too high");
    await new Promise((r) => setTimeout(r, 30));
    expect(
      screen.queryByTestId("alert-detail-ai-doctor-saved-session-link"),
    ).toBeNull();
  });

  it("does not leak raw [session:<id>] or [alert:<id>] tokens, or target_device", async () => {
    actionQueueRows = [
      {
        id: "aq-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    const { container } = renderDetail();
    await screen.findByTestId("alert-detail-ai-doctor-saved-session-link");
    const text = container.textContent ?? "";
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("[alert:");
    expect(text.toLowerCase()).not.toContain("target_device");
  });

  it("link copy does not imply automation, execution, or status transition", async () => {
    actionQueueRows = [
      {
        id: "aq-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    const link = await screen.findByTestId(
      "alert-detail-ai-doctor-saved-session-link",
    );
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

  it("preserves the alert header and existing related actions section", async () => {
    actionQueueRows = [
      {
        id: "aq-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    await screen.findByText("VPD too high");
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Related Action Queue Items"]'),
      ).not.toBeNull();
    });
  });
});

// --- Static safety scans ----------------------------------------------------
const ALERT_DETAIL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/AlertDetail.tsx"),
  "utf8",
);

describe("AlertDetail AI Doctor back-link — static safety", () => {
  it("uses the shared route helper and pure extractor", () => {
    expect(ALERT_DETAIL_SRC).toMatch(/aiDoctorSessionDetailPath\(/);
    expect(ALERT_DETAIL_SRC).toMatch(/extractSourceAiDoctorSessionId\(/);
    expect(ALERT_DETAIL_SRC).toMatch(/isAiDoctorDerived\(/);
  });

  it("introduces no new write paths and no privileged execution", () => {
    const lower = ALERT_DETAIL_SRC.toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.upsert\(/,
    );
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.delete\(/,
    );
    expect(lower).not.toMatch(/\.rpc\(/);
  });

  it("does not render the raw session/alert tokens in JSX", () => {
    // Token strings must only appear inside parser/effect logic, never as
    // literal JSX text. Detect any literal occurrence outside template tokens.
    expect(ALERT_DETAIL_SRC).not.toMatch(/>\s*\[session:/);
    expect(ALERT_DETAIL_SRC).not.toMatch(/>\s*\[alert:/);
  });
});
