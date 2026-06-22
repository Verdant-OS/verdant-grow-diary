import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActionQueueLoadingSkeleton from "@/components/ActionQueueLoadingSkeleton";
import ActionQueueDetailDrawer from "@/components/ActionQueueDetailDrawer";
import type { ActionQueueStatusHistoryEntry } from "@/lib/actionQueueStatusHistoryRules";

const ROW = {
  id: "aq-1",
  grow_id: "g-1",
  tent_id: "t-1",
  plant_id: "p-1",
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk rising [alert:alert-xyz]",
  risk_level: "medium",
  status: "pending_approval",
};

describe("ActionQueueLoadingSkeleton", () => {
  it("renders the stable skeleton structure with no fake action text", () => {
    render(<ActionQueueLoadingSkeleton count={2} />);
    const root = screen.getByTestId("action-queue-loading-skeleton");
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByTestId("action-queue-loading-skeleton-card")).toHaveLength(2);
    expect(
      screen.getAllByTestId("action-queue-loading-skeleton-explain").length,
    ).toBe(2);
    // Renders no real action title / reason text — only placeholders.
    expect(root.textContent?.toLowerCase()).not.toContain("approve");
    expect(root.textContent?.toLowerCase()).not.toContain("reject");
    expect(root.textContent?.toLowerCase()).not.toContain("healthy");
    expect(root.textContent?.toLowerCase()).not.toContain("safe");
  });

  it("does NOT trigger fetch / I/O on render", () => {
    const fetchSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;
    render(<ActionQueueLoadingSkeleton count={3} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ActionQueueDetailDrawer — loading skeleton", () => {
  it("renders drawer skeleton instead of the body while loading", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        loading
      />,
    );
    expect(
      screen.getByTestId("action-queue-detail-drawer-skeleton"),
    ).toBeTruthy();
    // The body title is NOT rendered while loading.
    expect(
      screen.queryByTestId("action-queue-detail-drawer-title"),
    ).toBeNull();
    // No fake claims while loading.
    const text = (
      screen.getByTestId("action-queue-detail-drawer-skeleton").textContent ?? ""
    ).toLowerCase();
    for (const forbidden of ["safe", "healthy", "approved", "rejected"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("ActionQueueDetailDrawer — status history section", () => {
  it("renders the calm empty-state copy when history is empty", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        statusHistory={[]}
      />,
    );
    expect(
      screen.getByTestId("action-queue-detail-drawer-history-empty").textContent,
    ).toBe("No status history found yet.");
  });

  it("renders approve/reject transitions with timestamps", () => {
    const history: ActionQueueStatusHistoryEntry[] = [
      {
        label: "Action approved",
        at: "2026-06-22T12:00:00.000Z",
        kind: "approved",
        idempotency_key: "action-queue:aq-1:approved",
      },
      {
        label: "Action rejected",
        at: "2026-06-21T09:00:00.000Z",
        kind: "rejected",
        idempotency_key: "action-queue:aq-1:rejected",
      },
    ];
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        statusHistory={history}
      />,
    );
    const items = screen.getAllByTestId("action-queue-detail-drawer-history-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Action approved");
    expect(items[1].textContent).toContain("Action rejected");
    // Does not surface the idempotency key (which contains the UUID) in
    // visible copy.
    const visible = items.map((i) => i.textContent ?? "").join("\n");
    expect(visible).not.toContain("aq-1");
    expect(visible).not.toContain("idempotency_key");
  });
});

describe("ActionQueueDetailDrawer — Go to source link", () => {
  it("renders a safe alert link when source + token agree", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
      />,
    );
    const link = screen.getByTestId("action-queue-detail-drawer-source-link");
    expect(link.getAttribute("data-source-kind")).toBe("alert");
    expect(link.getAttribute("href")).toMatch(/\/alerts\//);
    expect(link.textContent).toContain("View originating alert");
    // Visible label must not embed the raw alert UUID.
    expect(link.textContent).not.toContain("alert-xyz");
  });

  it("renders a safe AI Doctor link when source + token agree", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={{
          ...ROW,
          source: "ai_doctor",
          reason: "Possible mold [session:sess-1]",
        }}
      />,
    );
    const link = screen.getByTestId("action-queue-detail-drawer-source-link");
    expect(link.getAttribute("data-source-kind")).toBe("ai_doctor");
    expect(link.textContent).not.toContain("sess-1");
  });

  it("shows 'Source link unavailable.' for missing/unsafe context", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={{
          ...ROW,
          source: "environment_alert",
          reason: "no token present",
          plant_id: null,
          tent_id: null,
          grow_id: null,
        }}
      />,
    );
    expect(
      screen.queryByTestId("action-queue-detail-drawer-source-link"),
    ).toBeNull();
    expect(
      screen.getByTestId(
        "action-queue-detail-drawer-source-link-unavailable",
      ).textContent,
    ).toBe("Source link unavailable.");
  });
});

describe("ActionQueueDetailDrawer — trace failure + retry", () => {
  it("does not render the retry affordance when traceFailed is false", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
      />,
    );
    expect(
      screen.queryByTestId("action-queue-detail-drawer-trace-failure"),
    ).toBeNull();
  });

  it("renders a calm warning + retry button when traceFailed is true", () => {
    const retry = vi.fn();
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        traceFailed
        onRetryTrace={retry}
      />,
    );
    const banner = screen.getByTestId("action-queue-detail-drawer-trace-failure");
    expect(banner.textContent).toContain("Status was saved, but the diary trace did not save.");
    expect(banner.textContent).toContain("Retry only repairs the diary trace. It will not approve/reject again.");

    fireEvent.click(
      screen.getByTestId("action-queue-detail-drawer-retry-trace"),
    );
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith(ROW);
  });

  it("disables the retry button while retrying", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        traceFailed
        retrying
      />,
    );
    expect(
      screen
        .getByTestId("action-queue-detail-drawer-retry-trace")
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("preserves the existing approval-required safety reminder", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        traceFailed
      />,
    );
    expect(
      screen.getByTestId("action-queue-detail-drawer-safety-reminder").textContent,
    ).toContain("Verdant suggests. Grower approves.");
  });
});
