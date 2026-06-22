import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import ActionQueueDetailDrawer from "@/components/ActionQueueDetailDrawer";
import type { ActionDrawerInput } from "@/lib/actionQueueViewModel";

vi.mock("@/lib/actionQueueViewModel", async () => {
  const actual = await vi.importActual<typeof import("@/lib/actionQueueViewModel")>(
    "@/lib/actionQueueViewModel",
  );
  return {
    ...actual,
    buildActionDrawerViewModel: () => ({
      title: "Test action",
      reasonSafe: "A safe reason for testing.",
      riskLevel: "low" as const,
      contextChips: [],
      growSummary: null,
      whatHappensNext: ["Approve to mark this action as done."],
    }),
  };
});

function buildRow(overrides: Partial<ActionDrawerInput> = {}): ActionDrawerInput {
  return {
    id: "aq-77",
    action_type: "adjust_irrigation",
    risk_level: "low",
    status: "approved",
    reason: "Soil dry",
    created_at: new Date("2026-06-22T10:00:00Z").toISOString(),
    grow_id: null,
    tent_id: null,
    plant_id: null,
    source: null,
    ...overrides,
  } as ActionDrawerInput;
}

describe("ActionQueueDetailDrawer — diary-trace link return state", () => {
  it("appends safe actionsReturn (allow-listed params only) to the diary trace link", () => {
    const params = new URLSearchParams(
      "status=approved&page=2&pageSize=25&junk=drop&highlight=action-queue:aq-77:approved",
    );
    const { getByTestId } = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={buildRow()}
        currentActionsParams={params}
      />,
    );
    const link = getByTestId("action-queue-detail-drawer-diary-trace-link") as HTMLAnchorElement;
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/timeline?")).toBe(true);
    const qs = new URLSearchParams(href.split("?")[1]);
    const ret = qs.get("actionsReturn") ?? "";
    expect(ret.startsWith("/actions?")).toBe(true);
    const retQs = new URLSearchParams(ret.split("?")[1]);
    expect(retQs.get("status")).toBe("approved");
    expect(retQs.get("page")).toBe("2");
    expect(retQs.get("pageSize")).toBe("25");
    // Unsupported params dropped, including raw `highlight`.
    expect(retQs.get("junk")).toBeNull();
    expect(retQs.get("highlight")).toBeNull();
  });

  it("omits actionsReturn when no currentActionsParams are provided", () => {
    const { getByTestId } = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={buildRow()}
      />,
    );
    const href = getByTestId("action-queue-detail-drawer-diary-trace-link").getAttribute("href") ?? "";
    expect(href).not.toContain("actionsReturn");
  });

  it("does not change href when drawer is reopened with the same params (highlight preserved via URL)", () => {
    const params = new URLSearchParams(
      "status=approved&highlight=action-queue:aq-77:approved",
    );
    const first = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={buildRow()}
        currentActionsParams={params}
      />,
    );
    const hrefA = first.getByTestId("action-queue-detail-drawer-diary-trace-link").getAttribute("href");
    first.unmount();
    const second = render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={buildRow()}
        currentActionsParams={params}
      />,
    );
    const hrefB = second.getByTestId("action-queue-detail-drawer-diary-trace-link").getAttribute("href");
    expect(hrefA).toBe(hrefB);
    // Highlight is owned by the URL; drawer does not strip it.
    const retQs = new URLSearchParams(
      (new URLSearchParams(hrefB!.split("?")[1]).get("actionsReturn") ?? "").split("?")[1] ?? "",
    );
    expect(retQs.get("status")).toBe("approved");
  });
});
