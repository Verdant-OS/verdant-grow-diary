/**
 * Alerts route — accessibility, loading, retry, and missing-context polish.
 *
 * Read-only render tests. No writes triggered. Focused on the presentation
 * contract added by the polish pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Alerts from "@/pages/Alerts";
import {
  buildAlertRowAriaLabel,
  formatAlertSeenLabel,
  formatAlertSourceLabel,
} from "@/lib/alertsRouteView";

// ---------------------------------------------------------------------------
// Pure helper tests — no React needed.
// ---------------------------------------------------------------------------
describe("alertsRouteView — pure helpers", () => {
  it("formatAlertSourceLabel maps known slugs and tokenizes unknown ones", () => {
    expect(formatAlertSourceLabel("environment_alerts")).toBe(
      "Environment monitor",
    );
    expect(formatAlertSourceLabel("ai_doctor")).toBe("AI Doctor");
    expect(formatAlertSourceLabel("manual")).toBe("Manual entry");
    expect(formatAlertSourceLabel("custom_thing")).toBe("Custom Thing");
    expect(formatAlertSourceLabel(null)).toBe("Sensor system");
    expect(formatAlertSourceLabel("")).toBe("Sensor system");
  });

  it("formatAlertSeenLabel falls back calmly on bad input", () => {
    expect(formatAlertSeenLabel(null)).toBe("Time unknown");
    expect(formatAlertSeenLabel("not-a-date")).toBe("Time unknown");
    expect(formatAlertSeenLabel("2026-05-29T10:00:00Z")).toMatch(/ago|in /i);
  });

  it("buildAlertRowAriaLabel composes severity/status/source/title/time", () => {
    const label = buildAlertRowAriaLabel({
      severity: "warning",
      status: "open",
      title: "Humidity rising",
      source: "environment_alerts",
      firstSeenAt: "2026-05-29T10:00:00Z",
    });
    expect(label).toMatch(/^Warning alert, Open\./);
    expect(label).toContain("Humidity rising");
    expect(label).toContain("Source: Environment monitor");
    expect(label).toMatch(/First seen .* ago/);
  });

  it("buildAlertRowAriaLabel never leaks raw severity/status slugs when unknown", () => {
    const label = buildAlertRowAriaLabel({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      severity: "bogus" as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: "bogus" as any,
      title: "",
      source: null,
      firstSeenAt: null,
    });
    expect(label).toContain("Info alert, Open.");
    expect(label).toContain("Untitled alert");
    expect(label).toContain("Source: Sensor system");
    expect(label).toContain("Time unknown");
  });
});

// ---------------------------------------------------------------------------
// Render tests
// ---------------------------------------------------------------------------
const ALERT = {
  id: "alert-row-1",
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

const listAlertsMock = vi.fn();

vi.mock("@/lib/alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alerts")>(
    "@/lib/alerts",
  );
  return {
    ...actual,
    listAlerts: (...args: unknown[]) => listAlertsMock(...args),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
    logAlertEvent: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => ({ get: () => undefined }),
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
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Alerts />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listAlertsMock.mockReset();
});

describe("Alerts route — loading skeleton", () => {
  it("renders a skeleton while fetching and does not show empty copy", async () => {
    let resolveFetch: (v: unknown[]) => void = () => {};
    listAlertsMock.mockImplementation(
      () => new Promise((r) => (resolveFetch = r as (v: unknown[]) => void)),
    );
    renderAt("/alerts");
    const skel = await screen.findByTestId("alerts-loading-skeleton");
    expect(skel).toBeTruthy();
    expect(skel.getAttribute("role")).toBe("status");
    expect(skel.getAttribute("aria-busy")).toBe("true");
    expect(skel.getAttribute("aria-label")).toBe("Loading alerts");
    expect(within(skel).getByText(/loading alerts/i)).toBeTruthy();
    expect(screen.queryByText("No open alerts.")).toBeNull();
    resolveFetch([]);
  });
});

describe("Alerts route — missing grow/tent context", () => {
  it("shows the calm fallback when the URL grow id does not resolve", async () => {
    listAlertsMock.mockResolvedValue([]);
    renderAt("/alerts?growId=does-not-exist");
    const fallback = await screen.findByTestId("alerts-missing-context");
    expect(fallback.getAttribute("role")).toBe("status");
    expect(fallback.textContent).toMatch(
      /Select a grow or tent to review alerts\./,
    );
    expect(fallback.textContent).toMatch(/scoped to a grow or tent/i);
    expect(screen.queryByTestId("alerts-loading-skeleton")).toBeNull();
    expect(fallback.textContent).not.toContain("g1");
    expect(fallback.textContent).not.toContain("alert-row-1");
  });
});

describe("Alerts route — empty + error + retry", () => {
  it("renders the No open alerts. empty copy", async () => {
    listAlertsMock.mockResolvedValue([]);
    renderAt("/alerts");
    await waitFor(() =>
      expect(screen.queryByTestId("alerts-loading-skeleton")).toBeNull(),
    );
    expect(screen.getByText("No open alerts.")).toBeTruthy();
    expect(
      screen.getByText(/Verdant will show environment or grow warnings/i),
    ).toBeTruthy();
  });

  it("renders calm retry guidance and reloads on click", async () => {
    listAlertsMock.mockRejectedValueOnce(new Error("boom"));
    listAlertsMock.mockResolvedValueOnce([]);
    renderAt("/alerts");
    const errorBox = await screen.findByTestId("alerts-unavailable");
    expect(errorBox.textContent).toMatch(/Alerts unavailable/);
    expect(errorBox.textContent).toMatch(
      /Check your connection and try again/,
    );
    const retry = within(errorBox).getByRole("button", {
      name: /retry loading alerts/i,
    });
    fireEvent.click(retry);
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("alerts-unavailable")).toBeNull(),
    );
    expect(screen.getByText("No open alerts.")).toBeTruthy();
  });

  it("retry/error UI does not leak tokens, raw payloads, or provenance markers", async () => {
    listAlertsMock.mockRejectedValueOnce(new Error("Network failed"));
    const { container } = renderAt("/alerts");
    await screen.findByTestId("alerts-unavailable");
    const visible = (container.textContent ?? "").toLowerCase();
    expect(visible).not.toContain("bearer ");
    expect(visible).not.toContain("service_role");
    expect(visible).not.toContain("raw_payload");
    expect(visible).not.toContain("provenance");
    expect(visible).not.toContain("g1");
    expect(visible).not.toContain("alert-row-1");
  });
});

describe("Alerts route — alert row accessibility", () => {
  it("renders an article landmark with an aria-label and h3 heading", async () => {
    listAlertsMock.mockResolvedValue([ALERT]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    const aria = article.getAttribute("aria-label") ?? "";
    expect(aria).toMatch(/^Warning alert, Open\./);
    expect(aria).toContain("Humidity rising");
    expect(aria).toContain("Source: Environment monitor");

    const heading = within(article).getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("Humidity rising");

    const titleLink = within(heading).getByRole("link", {
      name: /humidity rising/i,
    });
    expect(titleLink.getAttribute("href")).toBe("/alerts/alert-row-1");
    expect(titleLink.className).toMatch(/focus-visible:ring/);
  });

  it("renders human-readable severity/status/source labels with aria-labels", async () => {
    listAlertsMock.mockResolvedValue([ALERT]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    expect(
      within(article).getByLabelText("Severity: Warning"),
    ).toBeTruthy();
    expect(within(article).getByLabelText("Status: Open")).toBeTruthy();
    const source = within(article).getByTestId("alert-row-source");
    expect(source.textContent).toBe("Environment monitor");
    expect(source.getAttribute("aria-label")).toBe(
      "Source: Environment monitor",
    );
    const time = article.querySelector("time");
    expect(time?.getAttribute("aria-label")).toMatch(/^First seen /);
    expect(time?.getAttribute("datetime")).toBe(ALERT.first_seen_at);
  });

  it("renders calm fallbacks when timestamp or source is missing", async () => {
    listAlertsMock.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...ALERT, source: null as any, first_seen_at: "not-a-date" as any },
    ]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    expect(within(article).getByText("Sensor system")).toBeTruthy();
    expect(within(article).getByText("Time unknown")).toBeTruthy();
  });

  it("status-change action buttons have descriptive accessible names that include the alert title", async () => {
    listAlertsMock.mockResolvedValue([ALERT]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    const ack = within(article).getByRole("button", {
      name: /acknowledge alert: humidity rising/i,
    });
    const res = within(article).getByRole("button", {
      name: /resolve alert: humidity rising/i,
    });
    const dis = within(article).getByRole("button", {
      name: /dismiss alert: humidity rising/i,
    });
    expect(ack).toBeTruthy();
    expect(res).toBeTruthy();
    expect(dis).toBeTruthy();
  });

  it("action buttons and title link expose visible focus styling via classes", async () => {
    listAlertsMock.mockResolvedValue([ALERT]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    expect(article.className).toMatch(/focus-within:ring-2/);
    expect(article.className).toMatch(/focus-within:ring-offset-2/);
    const titleLink = within(article).getByRole("link", {
      name: /humidity rising/i,
    });
    expect(titleLink.className).toMatch(/focus-visible:ring-2/);
    expect(titleLink.className).toMatch(/focus-visible:ring-offset-2/);
    for (const tid of [
      "alert-row-acknowledge",
      "alert-row-resolve",
      "alert-row-dismiss",
    ]) {
      const btn = within(article).getByTestId(tid);
      // shadcn Button default ships focus-visible ring styling
      expect(btn.className).toMatch(/focus-visible:/);
    }
  });

  it("action button aria-labels and card aria-label do not leak internal ids", async () => {
    listAlertsMock.mockResolvedValue([ALERT]);
    renderAt("/alerts");
    const article = await waitFor(() => {
      const a = document.querySelector("article[aria-labelledby]");
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    const ariaLabels: string[] = [
      article.getAttribute("aria-label") ?? "",
      ...Array.from(article.querySelectorAll("[aria-label]")).map(
        (el) => el.getAttribute("aria-label") ?? "",
      ),
    ];
    for (const label of ariaLabels) {
      expect(label).not.toContain(ALERT.id);
      expect(label).not.toContain(ALERT.grow_id);
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety scan over the page + helper module
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/Alerts.tsx"), "utf8");
const VIEW = readFileSync(
  resolve(ROOT, "src/lib/alertsRouteView.ts"),
  "utf8",
);

describe("Alerts route polish — static safety", () => {
  it("polish helper introduces no I/O, writes, or privileged access", () => {
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\*.*$/gm, "")
        .replace(/\/\/.*$/gm, "");
    const blob = stripComments(VIEW).toLowerCase();
    expect(blob).not.toContain("supabase");
    expect(blob).not.toContain("functions.invoke");
    expect(blob).not.toContain("service_role");
    expect(blob).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });

  it("page does not add automation/device-control or scheduling copy in polish", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
    expect(PAGE).not.toMatch(/calendar_events/);
    expect(PAGE).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(PAGE).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
    expect(PAGE).not.toMatch(/\bauto[\s-]?(execute|run)\b/i);
  });
});
