/**
 * ActionQueueDetailDrawer — component tests.
 *
 * Confirms drawer renders safe explanation fields, hides internal ids,
 * and that Approve/Reject only fire on explicit grower click (no
 * render-time writes, no device control).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActionQueueDetailDrawer from "@/components/ActionQueueDetailDrawer";

const ROW = {
  id: "aq-1",
  grow_id: "g-1",
  tent_id: "t-1",
  plant_id: "p-1",
  source: "ai_doctor",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk. [alert:alert-xyz] [session:sess-1]",
  risk_level: "medium",
  status: "pending_approval",
};

const LOOKUPS = {
  growsById: { "g-1": { name: "Greenhouse A" } },
  tentsById: { "t-1": { name: "Tent One" } },
  plantsById: { "p-1": { nickname: "Bertha" } },
};

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchSpy;
});

describe("ActionQueueDetailDrawer", () => {
  it("renders safe explanation fields when open", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        lookups={LOOKUPS}
      />,
    );
    expect(
      screen.getByTestId("action-queue-detail-drawer-title").textContent,
    ).toBe("Lower humidity to 55%");
    expect(
      screen.getByTestId("action-queue-detail-drawer-status").textContent,
    ).toBe("Pending review");
    expect(
      screen.getByTestId("action-queue-detail-drawer-risk").textContent,
    ).toBe("Medium risk");
    expect(
      screen.getByTestId("action-queue-detail-drawer-source").textContent,
    ).toContain("AI Doctor");
    expect(
      screen.getByTestId("action-queue-detail-drawer-target").textContent,
    ).toBe("humidity_pct");
    expect(
      screen.getByTestId("action-queue-detail-drawer-grow").textContent,
    ).toContain("Greenhouse A");
    expect(
      screen.getByTestId("action-queue-detail-drawer-tent").textContent,
    ).toContain("Tent One");
    expect(
      screen.getByTestId("action-queue-detail-drawer-plant").textContent,
    ).toContain("Bertha");
    expect(
      screen.getByTestId("action-queue-detail-drawer-safety-reminder").textContent,
    ).toContain("Verdant suggests. Grower approves.");
  });

  it("hides raw back-pointer tokens and internal IDs in visible copy", () => {
    const { baseElement } = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        lookups={LOOKUPS}
      />,
    );
    const text = baseElement.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("alert-xyz");
    expect(text).not.toContain("sess-1");
    expect(text).not.toContain("aq-1");
    // Reason text is shown after sanitization.
    expect(
      screen.getByTestId("action-queue-detail-drawer-reason").textContent,
    ).toBe("Mold risk.");
  });

  it("shows calm 'no related diary context' message when lookups are empty", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={{ ...ROW, grow_id: null, tent_id: null, plant_id: null }}
      />,
    );
    expect(
      screen.getByTestId("action-queue-detail-drawer-no-context").textContent,
    ).toBe("No related diary context found yet.");
  });

  it("does NOT call any callbacks or fetch on render", () => {
    const approve = vi.fn();
    const reject = vi.fn();
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        onApprove={approve}
        onReject={reject}
      />,
    );
    expect(approve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Approve button fires exactly once per click", () => {
    const approve = vi.fn();
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        onApprove={approve}
      />,
    );
    fireEvent.click(screen.getByTestId("action-queue-detail-drawer-approve"));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith(ROW);
  });

  it("Reject button fires exactly once per click", () => {
    const reject = vi.fn();
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        onReject={reject}
      />,
    );
    fireEvent.click(screen.getByTestId("action-queue-detail-drawer-reject"));
    expect(reject).toHaveBeenCalledTimes(1);
  });

  it("disables Approve and Reject buttons while busy", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        busy
      />,
    );
    expect(
      screen
        .getByTestId("action-queue-detail-drawer-approve")
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("action-queue-detail-drawer-reject")
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("contains no automation / device-control wording", () => {
    const { baseElement } = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        lookups={LOOKUPS}
      />,
    );
    const text = (baseElement.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "auto-approve",
      "auto execute",
      "auto-execute",
      "send command",
      "run device",
      "control hardware",
      "turn on",
      "turn off",
      "blind automation",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
