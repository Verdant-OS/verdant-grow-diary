/**
 * Action Queue rows — "Linked alert" affordance.
 *
 * Read-only chip + link that lets growers pivot Queue → Alert directly when
 * a row carries a safe `[alert:<id>]` back-pointer. Mirrors the AI Doctor
 * session-link affordance and coexists with it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";
import { aiDoctorSessionDetailPath, alertDetailPath } from "@/lib/routes";

const ALERT_DERIVED_ROW = {
  id: "aq-alert-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
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
  id: "aq-ai-both",
  source: "ai_doctor",
  suggested_change: "Raise the light by 10 cm",
  reason: "Reduce radiant load. [session:sess-xyz] [alert:alert-abc]",
};

const COACH_ROW_NO_ALERT = {
  ...ALERT_DERIVED_ROW,
  id: "aq-coach-1",
  source: "ai_coach",
  suggested_change: "Tighten schedule",
  reason: "Stress observed.",
};

let listRows: unknown[] = [
  ALERT_DERIVED_ROW,
  AI_DOCTOR_ROW_WITH_ALERT,
  COACH_ROW_NO_ALERT,
];
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
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  insertSpy.mockClear();
  listRows = [ALERT_DERIVED_ROW, AI_DOCTOR_ROW_WITH_ALERT, COACH_ROW_NO_ALERT];
});

function renderList(url = "/actions") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

async function waitForRows() {
  await waitFor(() =>
    expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
  );
}

describe("Action Queue row — Linked alert affordance", () => {
  it("renders 'Linked alert' chip on alert-derived row with a valid alert id", async () => {
    renderList();
    await waitForRows();
    const row = document.querySelector('[data-action-id="aq-alert-1"]') as HTMLElement;
    const chip = row.querySelector(
      '[data-testid="action-queue-row-linked-alert"]',
    ) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent ?? "").toMatch(/linked alert/i);
  });

  it("renders 'View linked alert' anchor with the route helper href", async () => {
    renderList();
    await waitForRows();
    const row = document.querySelector('[data-action-id="aq-alert-1"]') as HTMLElement;
    const anchor = row.querySelector(
      '[data-testid="action-queue-row-linked-alert-anchor"]',
    ) as HTMLAnchorElement;
    expect(anchor.textContent).toBe("View linked alert");
    expect(anchor.getAttribute("href")).toBe(alertDetailPath("alert-abc"));
  });

  it("renders both AI Doctor session link and Linked alert link when both tokens are present", async () => {
    renderList();
    await waitForRows();
    const row = document.querySelector('[data-action-id="aq-ai-both"]') as HTMLElement;
    const aiLink = row.querySelector(
      '[data-testid="action-queue-row-ai-doctor-session-link-anchor"]',
    ) as HTMLAnchorElement;
    const alertLink = row.querySelector(
      '[data-testid="action-queue-row-linked-alert-anchor"]',
    ) as HTMLAnchorElement;
    expect(aiLink.getAttribute("href")).toBe(aiDoctorSessionDetailPath("sess-xyz"));
    expect(alertLink.getAttribute("href")).toBe(alertDetailPath("alert-abc"));
  });

  it("does not render Linked alert on rows without a parseable alert id", async () => {
    renderList();
    await waitForRows();
    const row = document.querySelector('[data-action-id="aq-coach-1"]') as HTMLElement;
    expect(
      row.querySelector('[data-testid="action-queue-row-linked-alert"]'),
    ).toBeNull();
    expect(
      row.querySelector('[data-testid="action-queue-row-linked-alert-anchor"]'),
    ).toBeNull();
  });

  it("does not leak raw [alert:<id>], [session:<id>] tokens, or target_device on any row", async () => {
    const { container } = renderList();
    await waitForRows();
    const text = container.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("secret-device-name");
    expect(text.toLowerCase()).not.toContain("target_device");
  });

  it("link copy does not imply automation, execution, or status transition", async () => {
    renderList();
    await waitForRows();
    const anchor = (await screen.findAllByTestId(
      "action-queue-row-linked-alert-anchor",
    ))[0];
    const lower = (anchor.textContent ?? "").toLowerCase();
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

  it("preserves the existing AI Doctor session-link affordance on AI Doctor rows", async () => {
    renderList();
    await waitForRows();
    const row = document.querySelector('[data-action-id="aq-ai-both"]') as HTMLElement;
    const chip = row.querySelector(
      '[data-testid="action-queue-row-ai-doctor-session-link"]',
    ) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent ?? "").toMatch(/linked from ai doctor/i);
  });
});

// --- Static safety scans ----------------------------------------------------
const QUEUE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("Action Queue Linked alert — static safety", () => {
  it("introduces no new write paths into action_queue or alerts", () => {
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
      /from\(["']alerts["'][\s\S]{0,200}?\.(insert|update|delete|upsert)\(/,
    );
    expect(lower).not.toMatch(/\.rpc\(/);
  });

  it("uses the shared route helper and pure extractor", () => {
    expect(QUEUE_SRC).toMatch(/alertDetailPath\(/);
    expect(QUEUE_SRC).toMatch(/extractSourceAlertId\(/);
  });

  it("does not render raw alert/session tokens as JSX literals", () => {
    expect(QUEUE_SRC).not.toMatch(/>\s*\[alert:/);
    expect(QUEUE_SRC).not.toMatch(/>\s*\[session:/);
  });
});
