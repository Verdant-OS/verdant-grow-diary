/**
 * Action Queue route — accessibility, loading, empty, and missing-context polish.
 *
 * Read-only render tests. No writes triggered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ActionQueue from "@/pages/ActionQueue";
import {
  buildActionRowAriaLabel,
  formatActionTypeLabel,
  formatRiskLabel,
  formatStatusLabel,
} from "@/lib/actionQueueRowView";

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------
describe("actionQueueRowView — pure helpers", () => {
  it("formatActionTypeLabel tokenizes snake/kebab case with fallback", () => {
    expect(formatActionTypeLabel("raise_light")).toBe("Raise Light");
    expect(formatActionTypeLabel("lower-humidity")).toBe("Lower Humidity");
    expect(formatActionTypeLabel(null)).toBe("Suggested action");
    expect(formatActionTypeLabel("")).toBe("Suggested action");
  });

  it("formatRiskLabel returns labels with a calm fallback", () => {
    expect(formatRiskLabel("high")).toBe("High risk");
    expect(formatRiskLabel(null)).toBe("Unknown risk");
    expect(formatRiskLabel("weird")).toBe("Unknown risk");
  });

  it("formatStatusLabel falls back to Pending review", () => {
    expect(formatStatusLabel("approved")).toBe("Approved");
    expect(formatStatusLabel("pending_approval")).toBe("Pending review");
    expect(formatStatusLabel(null)).toBe("Pending review");
  });

  it("buildActionRowAriaLabel composes risk + action + status + source + approval framing", () => {
    const label = buildActionRowAriaLabel({
      action_type: "raise_light",
      risk_level: "medium",
      status: "pending_approval",
      source: "ai_doctor",
    });
    expect(label).toBe(
      "Medium risk: Raise Light. Pending review. Source: AI Doctor. Grower approval required.",
    );
  });
});

// ---------------------------------------------------------------------------
// Render tests
// ---------------------------------------------------------------------------
const PENDING_ROW = {
  id: "row-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "environment_alerts",
  action_type: "raise_light",
  target_metric: "ppfd",
  target_device: null,
  suggested_change: "Increase PPFD",
  reason: "RH above target",
  risk_level: "medium",
  status: "pending_approval",
  created_at: "2026-05-29T10:00:00Z",
};

let actionRowsMock: unknown[] = [];
let actionRowsError: { message: string } | null = null;
let resolveLoad: (() => void) | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      limit: () => {
        if (table !== "action_queue") {
          return Promise.resolve({ data: [], error: null });
        }
        if (resolveLoad) {
          return new Promise((res) => {
            resolveLoad = () => {
              res({ data: actionRowsMock, error: actionRowsError });
            };
          });
        }
        return Promise.resolve({ data: actionRowsMock, error: actionRowsError });
      },
      then: (cb: (r: { data: unknown; error: unknown }) => unknown) =>
        cb({ data: actionRowsMock, error: actionRowsError }),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t) } };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));

const grows = [{ id: "g1", name: "G1" }];
let mockUrlGrowId: string | null = null;
let mockIsValidScopedGrow = false;
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows,
    activeGrowId: null,
    activeGrow: null,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: mockUrlGrowId,
    scopedGrowName: null,
    isValidScopedGrow: mockIsValidScopedGrow,
    backHref: undefined,
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

function renderPage(path = "/actions") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  actionRowsMock = [];
  actionRowsError = null;
  resolveLoad = null;
  mockUrlGrowId = null;
  mockIsValidScopedGrow = false;
});

describe("Action Queue route — loading skeleton", () => {
  it("renders a skeleton with aria-busy while pending actions are fetching", async () => {
    resolveLoad = () => {};
    renderPage();
    const skel = await screen.findByTestId("action-queue-loading-skeleton");
    expect(skel.getAttribute("aria-busy")).toBe("true");
    expect(skel.getAttribute("aria-label")).toBe("Loading pending actions");
    expect(within(skel).getByText(/loading pending actions/i)).toBeTruthy();
    // unblock
    resolveLoad?.();
  });
});

describe("Action Queue route — empty state", () => {
  it("renders 'No pending actions.' with approval-focused helper copy", async () => {
    actionRowsMock = [];
    renderPage();
    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-loading-skeleton")).toBeNull(),
    );
    const empty = screen.getByTestId("action-queue-empty-pending");
    expect(empty.textContent).toMatch(/No pending actions\./);
    expect(empty.textContent).toMatch(/grower-reviewed recommendations/i);
    expect(empty.textContent).toMatch(/grower approval is always required/i);
  });
});

describe("Action Queue route — missing-context fallback", () => {
  it("shows the calm fallback when ?growId does not resolve", async () => {
    mockUrlGrowId = "does-not-exist";
    mockIsValidScopedGrow = false;
    renderPage("/actions?growId=does-not-exist");
    const fallback = await screen.findByTestId("action-queue-missing-context");
    expect(fallback.textContent).toMatch(
      /Select a grow or tent to review pending actions\./,
    );
    expect(fallback.textContent).toMatch(/Grower approval is always required/i);
    expect(screen.queryByTestId("action-queue-loading-skeleton")).toBeNull();
  });
});

describe("Action Queue route — row accessibility", () => {
  it("renders an h3 title + sr-only description, with aria-labelledby on the row", async () => {
    actionRowsMock = [PENDING_ROW];
    renderPage();
    await waitFor(() =>
      expect(screen.queryByTestId("action-queue-loading-skeleton")).toBeNull(),
    );
    const li = document.querySelector(
      `[data-action-id="${PENDING_ROW.id}"]`,
    ) as HTMLElement;
    expect(li).toBeTruthy();
    // Existing focused-state contract preserved: non-focused row has no aria-label.
    expect(li.getAttribute("aria-label")).toBeNull();
    const labelledby = li.getAttribute("aria-labelledby");
    const describedby = li.getAttribute("aria-describedby");
    expect(labelledby).toBe(`aq-pending-title-${PENDING_ROW.id}`);
    expect(describedby).toBe(`aq-pending-desc-${PENDING_ROW.id}`);
    const heading = within(li).getByRole("heading", { level: 3 });
    expect(heading.id).toBe(labelledby);
    expect(heading.textContent).toBe("raise_light");
    const desc = li.querySelector(`#${describedby}`) as HTMLElement;
    expect(desc.textContent).toMatch(/Grower approval required/);
  });

  it("View Details link has visible focus-visible styling", async () => {
    actionRowsMock = [PENDING_ROW];
    renderPage();
    const link = await screen.findByRole("link", { name: /view details/i });
    expect(link.className).toMatch(/focus-visible:ring/);
  });
});

// ---------------------------------------------------------------------------
// Static safety scan over page + helper module
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const VIEW = readFileSync(
  resolve(ROOT, "src/lib/actionQueueRowView.ts"),
  "utf8",
);
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("Action Queue polish — static safety + contract preservation", () => {
  it("polish helper has no I/O or privileged access", () => {
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\*.*$/gm, "")
        .replace(/\/\/.*$/gm, "");
    const blob = stripComments(VIEW).toLowerCase();
    expect(blob).not.toContain("supabase");
    expect(blob).not.toContain("functions.invoke");
    expect(blob).not.toContain("service_role");
    expect(blob).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/,
    );
  });

  it("page preserves approval-focused framing copy", () => {
    expect(PAGE).toMatch(/approval-gated/);
    expect(PAGE).toMatch(/grower\s+approval\s+is\s+always\s+required/i);
    expect(PAGE).toMatch(/Review before acting/i);
    expect(PAGE).toMatch(/Review required/);
  });

  it("page does not introduce autopilot/device-execution language in polish", () => {
    expect(PAGE).not.toMatch(/\bautopilot\b/i);
    expect(PAGE).not.toMatch(/\bauto[\s-]?execute\b/i);
    expect(PAGE).not.toMatch(/\bauto[\s-]?run\b/i);
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i,
    );
    expect(PAGE).not.toMatch(/calendar_events/);
    expect(PAGE).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(PAGE).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
  });

  it("preserves /actions route registration and legacy /action-queue redirect", () => {
    expect(APP).toMatch(/path="\/actions"\s+element=\{<ActionQueue\s*\/>\}/);
    expect(APP).toMatch(
      /path="\/action-queue"\s+element=\{<Navigate\s+to="\/actions"\s+replace\s*\/>\}/,
    );
  });
});
