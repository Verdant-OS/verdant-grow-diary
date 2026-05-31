/**
 * Alerts Index — "Has linked action" badge/count.
 *
 * Read-only chip + optional link that lets growers see which alerts already
 * have one or more open Action Queue items linked via `[alert:<id>]`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Alerts from "@/pages/Alerts";
import { actionDetailPath } from "@/lib/routes";

const ALERT_WITH_ONE = {
  id: "alert-one",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  title: "Humidity rising",
  reason: "RH above target",
  metric: "humidity_pct",
  severity: "warning" as const,
  status: "open" as const,
  source: "environment_alerts",
  first_seen_at: "2026-05-29T10:00:00Z",
  last_seen_at: "2026-05-29T10:00:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-29T10:00:00Z",
  updated_at: "2026-05-29T10:00:00Z",
};
const ALERT_WITH_MANY = { ...ALERT_WITH_ONE, id: "alert-many", title: "VPD drift" };
const ALERT_WITH_NONE = { ...ALERT_WITH_ONE, id: "alert-none", title: "Temp warm" };

const ALERTS = [ALERT_WITH_ONE, ALERT_WITH_MANY, ALERT_WITH_NONE];

// One open action linked to alert-one, two open linked to alert-many,
// one terminal action linked to alert-many (must NOT be counted),
// one open action linked to a different alert (must NOT bleed).
const ACTION_ROWS = [
  {
    id: "act-one",
    reason: "Lower humidity. [alert:alert-one]",
    status: "pending_approval",
  },
  {
    id: "act-many-1",
    reason: "Adjust VPD. [alert:alert-many]",
    status: "pending_approval",
  },
  {
    id: "act-many-2",
    reason: "Bump fan. [alert:alert-many] [session:sess-xyz]",
    status: "approved",
  },
  {
    id: "act-many-terminal",
    reason: "Old. [alert:alert-many]",
    status: "completed",
  },
  {
    id: "act-other",
    reason: "Unrelated. [alert:alert-other]",
    status: "pending_approval",
  },
];

const insertSpy = vi.fn();
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
      insert: (...a: unknown[]) => {
        insertSpy(...a);
        return Promise.resolve({ data: null, error: null });
      },
      update: (...a: unknown[]) => {
        updateSpy(...a);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      delete: (...a: unknown[]) => {
        deleteSpy(...a);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeChain(ACTION_ROWS);
        if (table === "alerts") return makeChain(ALERTS);
        if (table === "alert_events") return makeChain([]);
        return makeChain([]);
      },
    },
  };
});

vi.mock("@/lib/alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alerts")>(
    "@/lib/alerts",
  );
  return {
    ...actual,
    listAlerts: vi.fn(async () => ALERTS),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
    logAlertEvent: vi.fn(),
  };
});

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/alerts",
  }),
}));
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
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  insertSpy.mockClear();
  updateSpy.mockClear();
  deleteSpy.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/alerts"]}>
      <Alerts />
    </MemoryRouter>,
  );
}

async function rowFor(alertId: string): Promise<HTMLElement> {
  return await waitFor(() => {
    const link = document.querySelector(`a[href="/alerts/${alertId}"]`);
    expect(link).toBeTruthy();
    const li = (link as HTMLElement).closest("li") as HTMLElement;
    expect(li).toBeTruthy();
    return li;
  });
}

describe("Alerts Index — Linked action badge", () => {
  it("renders 'Has linked action' on alert with exactly one open linked action", async () => {
    renderPage();
    const li = await rowFor("alert-one");
    const badge = await waitFor(() =>
      within(li).getByTestId("alert-row-linked-action"),
    );
    expect(badge.textContent ?? "").toMatch(/has linked action/i);
  });

  it("renders count text on alert with multiple open linked actions", async () => {
    renderPage();
    const li = await rowFor("alert-many");
    const badge = await waitFor(() =>
      within(li).getByTestId("alert-row-linked-action"),
    );
    expect(badge.textContent ?? "").toMatch(/2 linked actions/i);
  });

  it("renders no linked-action badge on alerts with no open linked action", async () => {
    renderPage();
    const li = await rowFor("alert-none");
    await waitFor(() =>
      expect(screen.getAllByTestId("alert-row-linked-action").length).toBe(2),
    );
    expect(within(li).queryByTestId("alert-row-linked-action")).toBeNull();
  });

  it("does not count terminal action_queue rows", async () => {
    renderPage();
    const li = await rowFor("alert-many");
    const badge = await waitFor(() =>
      within(li).getByTestId("alert-row-linked-action"),
    );
    expect(badge.textContent ?? "").not.toMatch(/3 linked/i);
  });

  it("does not count linked actions for other alerts", async () => {
    renderPage();
    const li = await rowFor("alert-one");
    const badge = await waitFor(() =>
      within(li).getByTestId("alert-row-linked-action"),
    );
    expect(badge.textContent ?? "").toMatch(/^has linked action/i);
  });

  it("links a single open linked action to /actions/<id>", async () => {
    renderPage();
    const li = await rowFor("alert-one");
    const anchor = (await waitFor(() =>
      within(li).getByTestId("alert-row-linked-action-anchor"),
    )) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(actionDetailPath("act-one"));
  });

  it("never renders raw [alert:<id>] tokens", async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId("alert-row-linked-action").length).toBe(2),
    );
    expect(container.textContent ?? "").not.toContain("[alert:");
  });

  it("never renders raw [session:<id>] tokens", async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId("alert-row-linked-action").length).toBe(2),
    );
    expect(container.textContent ?? "").not.toContain("[session:");
  });

  it("never renders target_device copy", async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId("alert-row-linked-action").length).toBe(2),
    );
    expect((container.textContent ?? "").toLowerCase()).not.toContain(
      "target_device",
    );
  });

  it("link copy does not imply automation, execution, or status transition", async () => {
    renderPage();
    const anchors = await waitFor(() =>
      screen.getAllByTestId("alert-row-linked-action-anchor"),
    );
    for (const anchor of anchors) {
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
    }
  });
});

// --- Static safety scans ----------------------------------------------------
const PAGE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/Alerts.tsx"),
  "utf8",
);
const HOOK_SRC = readFileSync(
  resolve(__dirname, "../..", "src/hooks/useAlertsLinkedActionCounts.ts"),
  "utf8",
);
const VM_SRC = readFileSync(
  resolve(__dirname, "../..", "src/lib/alertsLinkedActionsViewModel.ts"),
  "utf8",
);

describe("Alerts Index Linked action — static safety", () => {
  it("introduces no insert/update/delete/upsert/rpc against action_queue or alerts in the new hook/view-model", () => {
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\*.*$/gm, "")
        .replace(/\/\/.*$/gm, "");
    for (const src of [HOOK_SRC, VM_SRC]) {
      const lower = stripComments(src).toLowerCase();
      expect(lower).not.toContain("functions.invoke");
      expect(lower).not.toContain("service_role");
      expect(lower).not.toMatch(/\.insert\(/);
      expect(lower).not.toMatch(/\.update\(/);
      expect(lower).not.toMatch(/\.delete\(/);
      expect(lower).not.toMatch(/\.upsert\(/);
      expect(lower).not.toMatch(/\.rpc\(/);
    }
  });

  it("uses the pure extractor and route helper", () => {
    expect(VM_SRC).toMatch(/extractSourceAlertId\(/);
    expect(PAGE_SRC).toMatch(/actionDetailPath\(/);
  });

  it("does not render raw alert/session tokens as JSX literals", () => {
    expect(PAGE_SRC).not.toMatch(/>\s*\[alert:/);
    expect(PAGE_SRC).not.toMatch(/>\s*\[session:/);
  });
});
