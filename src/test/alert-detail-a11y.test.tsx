/**
 * AlertDetail — accessibility & review-state clarity.
 *
 * Presentation-only assertions. No writes, no AI, no automation/device control.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";

const ALERT_TITLE = "VPD too high";
const ALERT = {
  id: "alert-a11y-1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: "p1",
  source: "vpd_high",
  severity: "warning" as const,
  status: "open" as const,
  metric: "vpd",
  title: ALERT_TITLE,
  reason: "VPD has been elevated for 30 minutes.",
  first_seen_at: "2026-05-30T10:00:00Z",
  last_seen_at: "2026-05-30T10:30:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-30T10:00:00Z",
  updated_at: "2026-05-30T10:30:00Z",
};

let nextLoad: () => Promise<typeof ALERT | null> = async () => ALERT;

vi.mock("@/lib/alerts", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/alerts");
  return {
    ...actual,
    getAlertById: vi.fn(() => nextLoad()),
    logAlertEvent: vi.fn(async () => undefined),
  };
});

vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ events: [] }),
}));

vi.mock("@/integrations/supabase/client", () => {
  type Result = { data: unknown; error: null };
  const makeChain = () => {
    const result: Result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      like: () => chain,
      contains: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(result),
      then: (resolve: (r: Result) => unknown) => resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  return { supabase: { from: () => makeChain() } };
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${ALERT.id}`]}>
      <Routes>
        <Route path="/alerts/:alertId" element={<AlertDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AlertDetail — accessibility & review-state clarity", () => {
  it("renders exactly one page-level heading (h1)", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    await screen.findByText(ALERT_TITLE);
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent ?? "").toMatch(/alert detail/i);
  });

  it("exposes severity, status, metric, and source via accessible labels", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    await screen.findByText(ALERT_TITLE);
    expect(screen.getByLabelText(/severity: warning/i)).toBeTruthy();
    expect(screen.getByLabelText(/status: open/i)).toBeTruthy();
    expect(screen.getByLabelText(/metric: vpd/i)).toBeTruthy();
    expect(screen.getByLabelText(/source: vpd_high/i)).toBeTruthy();
  });

  it("groups the status badges with a descriptive aria-label", async () => {
    nextLoad = async () => ALERT;
    const { container } = renderDetail();
    await screen.findByText(ALERT_TITLE);
    const group = container.querySelector('[role="group"][aria-label*="severity"]');
    expect(group).not.toBeNull();
  });

  it("exposes first-seen / last-seen timestamp context to assistive tech", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    await screen.findByText(ALERT_TITLE);
    expect(screen.getByText(/first seen/i)).toBeTruthy();
    expect(screen.getByText(/last seen/i)).toBeTruthy();
  });

  it("status-change buttons have descriptive accessible names that include the alert title", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    const ack = await screen.findByRole("button", {
      name: new RegExp(`acknowledge alert: ${ALERT_TITLE}`, "i"),
    });
    const resolve = screen.getByRole("button", {
      name: new RegExp(`resolve alert: ${ALERT_TITLE}`, "i"),
    });
    const dismiss = screen.getByRole("button", {
      name: new RegExp(`dismiss alert: ${ALERT_TITLE}`, "i"),
    });
    expect(ack).toBeTruthy();
    expect(resolve).toBeTruthy();
    expect(dismiss).toBeTruthy();
  });

  it("status-change buttons expose focus-visible ring + ring-offset styles", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    const ack = await screen.findByTestId("alert-detail-acknowledge");
    const cls = ack.className;
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).toMatch(/focus-visible:ring-ring/);
    expect(cls).toMatch(/focus-visible:ring-offset-2/);
  });

  it("status-change button aria-labels do not leak internal alert/grow/tent/plant IDs", async () => {
    nextLoad = async () => ALERT;
    renderDetail();
    const ack = await screen.findByTestId("alert-detail-acknowledge");
    const label = ack.getAttribute("aria-label") ?? "";
    expect(label).not.toContain(ALERT.id);
    expect(label).not.toContain(ALERT.grow_id);
    expect(label).not.toContain(ALERT.tent_id as string);
    expect(label).not.toContain(ALERT.plant_id as string);
    expect(label).not.toMatch(/\[alert:/);
    expect(label).not.toMatch(/\[session:/);
  });

  it("error state exposes role=alert and an accessible Retry control", async () => {
    nextLoad = async () => {
      throw new Error("boom");
    };
    renderDetail();
    const region = await screen.findByRole("alert");
    expect(region.textContent ?? "").toMatch(/alert unavailable/i);
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry.className).toMatch(/focus-visible:ring-2/);
  });

  it("not-found state stays calm and offers a back link without leaking the missing id", async () => {
    nextLoad = async () => null;
    const { container } = renderDetail();
    await screen.findByText(/alert not found/i);
    const back = screen.getByRole("link", { name: /back to alert center/i });
    expect(back.getAttribute("href")).toMatch(/\/alerts$/);
    const text = container.textContent ?? "";
    expect(text).not.toContain(ALERT.id);
    expect(text).not.toMatch(/\[alert:/);
  });
});

// --- Static safety scans ----------------------------------------------------
const PAGE_SRC = readFileSync(
  resolve(__dirname, "../pages/AlertDetail.tsx"),
  "utf8",
);

describe("AlertDetail a11y polish — static safety", () => {
  it("introduces no AI/coach calls", () => {
    expect(PAGE_SRC).not.toMatch(/ai-coach/i);
    expect(PAGE_SRC).not.toMatch(/functions\.invoke/);
  });
  it("contains no automation/device-control copy", () => {
    expect(PAGE_SRC).not.toMatch(/actuator|auto-execute|automatically execute|mqtt|home[\s_-]?assistant|\brelay\b|webhook/i);
  });
  it("does not use service_role", () => {
    expect(PAGE_SRC).not.toMatch(/service_role/i);
  });
  it("status-change button labels are templated from alert.title (not hard-coded IDs)", () => {
    expect(PAGE_SRC).toMatch(/aria-label=\{`Acknowledge alert: \$\{alert\.title\}`\}/);
    expect(PAGE_SRC).toMatch(/aria-label=\{`Resolve alert: \$\{alert\.title\}`\}/);
    expect(PAGE_SRC).toMatch(/aria-label=\{`Dismiss alert: \$\{alert\.title\}`\}/);
  });
});
