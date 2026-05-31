/**
 * AlertDetail — "Has linked action" / "N linked actions" count badge.
 *
 * Mirrors the Alerts Index badge using the shared LinkedActionCountBadge +
 * useAlertsLinkedActionCounts. Read-only navigation polish — no writes, no
 * automation, no device control, no token leakage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";
import { actionDetailPath } from "@/lib/routes";

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
      order: () => chain,
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

describe("AlertDetail — Linked action count badge", () => {
  it("shows 'Has linked action' for exactly one open linked action", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
    ];
    renderDetail();
    const badge = await screen.findByTestId("alert-detail-linked-action");
    expect(badge.textContent ?? "").toMatch(/has linked action/i);
  });

  it("shows 'N linked actions' for multiple open linked actions", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
      {
        id: "aq-open-2",
        source: "ai_doctor",
        status: "approved",
        reason: "Raise the light. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    const badge = await screen.findByTestId("alert-detail-linked-action");
    expect(badge.textContent ?? "").toMatch(/2 linked actions/i);
  });

  it("renders no badge when no linked open action exists", async () => {
    actionQueueRows = [];
    renderDetail();
    await screen.findByText("VPD too high");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("alert-detail-linked-action")).toBeNull();
  });

  it("does not count terminal action_queue rows", async () => {
    actionQueueRows = [
      {
        id: "aq-done",
        source: "environment_alert",
        status: "completed",
        reason: "Old. [alert:alert-1]",
      },
      {
        id: "aq-rej",
        source: "environment_alert",
        status: "rejected",
        reason: "No. [alert:alert-1]",
      },
    ];
    renderDetail();
    await screen.findByText("VPD too high");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("alert-detail-linked-action")).toBeNull();
  });

  it("does not count linked actions for other alerts", async () => {
    actionQueueRows = [
      {
        id: "aq-other",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Unrelated. [alert:alert-other]",
      },
    ];
    renderDetail();
    await screen.findByText("VPD too high");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("alert-detail-linked-action")).toBeNull();
  });

  it("links a single open linked action via /actions/<id>", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
    ];
    renderDetail();
    const anchor = (await screen.findByTestId(
      "alert-detail-linked-action-anchor",
    )) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(actionDetailPath("aq-open-1"));
  });

  it("uses a shared route (not single-action deep-link) when multiple linked actions exist", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
      {
        id: "aq-open-2",
        source: "ai_doctor",
        status: "approved",
        reason: "Raise the light. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    renderDetail();
    const anchor = (await screen.findByTestId(
      "alert-detail-linked-action-anchor",
    )) as HTMLAnchorElement;
    expect(anchor.getAttribute("href") ?? "").toMatch(/^\/actions/);
    expect(anchor.getAttribute("href") ?? "").not.toContain("aq-open-1");
    expect(anchor.getAttribute("href") ?? "").not.toContain("aq-open-2");
  });

  it("never leaks raw [alert:<id>] / [session:<id>] tokens or target_device", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        target_device: "secret-device-name",
        reason: "Lower humidity. [alert:alert-1] [session:sess-xyz]",
      },
    ];
    const { container } = renderDetail();
    await screen.findByTestId("alert-detail-linked-action");
    const text = container.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("secret-device-name");
    expect(text.toLowerCase()).not.toContain("target_device");
  });

  it("link copy avoids automation/execution/transition verbs", async () => {
    actionQueueRows = [
      {
        id: "aq-open-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-1]",
      },
    ];
    renderDetail();
    const anchor = await screen.findByTestId(
      "alert-detail-linked-action-anchor",
    );
    const lower = (anchor.textContent ?? "").toLowerCase();
    for (const tok of [
      "auto-execute",
      "automatically",
      "actuate",
      "execute",
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
});

// --- Static safety scans ----------------------------------------------------
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\*.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

const PAGE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/AlertDetail.tsx"),
  "utf8",
);
const BADGE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/LinkedActionCountBadge.tsx"),
  "utf8",
);

describe("AlertDetail Linked action count — static safety", () => {
  it("introduces no new write paths in the shared badge component", () => {
    const lower = stripComments(BADGE_SRC).toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toMatch(/\.insert\(/);
    expect(lower).not.toMatch(/\.update\(/);
    expect(lower).not.toMatch(/\.delete\(/);
    expect(lower).not.toMatch(/\.upsert\(/);
    expect(lower).not.toMatch(/\.rpc\(/);
    expect(lower).not.toMatch(/from\(["']action_queue["']/);
    expect(lower).not.toMatch(/from\(["']alerts["']/);
  });

  it("reuses the shared LinkedActionCountBadge in AlertDetail", () => {
    expect(PAGE_SRC).toMatch(/LinkedActionCountBadge/);
    expect(PAGE_SRC).toMatch(/useAlertsLinkedActionCounts/);
  });

  it("does not render raw alert/session tokens as JSX literals", () => {
    expect(PAGE_SRC).not.toMatch(/>\s*\[alert:/);
    expect(PAGE_SRC).not.toMatch(/>\s*\[session:/);
  });
});
