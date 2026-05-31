/**
 * LinkedActionCountBadge — aria-label clarity on the linked-action anchor.
 *
 * Component-level test that exercises every count branch directly so we
 * don't need to thread integer counts through Alerts Index / Alert Detail
 * fixtures. Covers single, two, and many cases plus the no-link branch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LinkedActionCountBadge } from "@/components/LinkedActionCountBadge";
import {
  actionDetailPath,
  actionQueueAlertContextPath,
} from "@/lib/routes";
import type { AlertLinkedActionsSummary } from "@/lib/alertsLinkedActionsViewModel";

function renderBadge(
  alertId: string,
  summary: AlertLinkedActionsSummary | undefined,
) {
  return render(
    <MemoryRouter>
      <LinkedActionCountBadge
        alertId={alertId}
        summary={summary}
        testIdPrefix="badge"
      />
    </MemoryRouter>,
  );
}

describe("LinkedActionCountBadge — aria-labels", () => {
  it("single-action anchor has aria-label 'View linked action'", () => {
    renderBadge("alert-1", { count: 1, singleActionId: "act-1" });
    const anchor = screen.getByTestId("badge-linked-action-anchor");
    expect(anchor.getAttribute("aria-label")).toBe("View linked action");
    expect(anchor.textContent).toBe("View linked action");
    expect(anchor.getAttribute("href")).toBe(actionDetailPath("act-1"));
  });

  it("two-action anchor uses 'View 2 actions linked to this alert'", () => {
    renderBadge("alert-1", { count: 2, singleActionId: null });
    const anchor = screen.getByTestId("badge-linked-action-anchor");
    expect(anchor.getAttribute("aria-label")).toBe(
      "View 2 actions linked to this alert",
    );
    expect(anchor.textContent).toBe("View linked actions");
    expect(anchor.getAttribute("href")).toBe(
      actionQueueAlertContextPath("alert-1"),
    );
  });

  it("pluralizes for 3+ actions", () => {
    renderBadge("alert-1", { count: 5, singleActionId: null });
    const anchor = screen.getByTestId("badge-linked-action-anchor");
    expect(anchor.getAttribute("aria-label")).toBe(
      "View 5 actions linked to this alert",
    );
  });

  it("renders nothing when there are no linked actions", () => {
    const { container } = renderBadge("alert-1", { count: 0, singleActionId: null });
    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("badge-linked-action-anchor")).toBeNull();
  });

  it("renders nothing when summary is undefined", () => {
    const { container } = renderBadge("alert-1", undefined);
    expect(container.textContent).toBe("");
  });

  it("visible badge copy is unchanged", () => {
    renderBadge("alert-1", { count: 1, singleActionId: "act-1" });
    expect(screen.getByText(/^Has linked action$/)).toBeTruthy();
    expect(screen.getByText(/^View linked action$/)).toBeTruthy();

    renderBadge("alert-2", { count: 3, singleActionId: null });
    expect(screen.getByText(/^3 linked actions$/)).toBeTruthy();
    expect(screen.getByText(/^View linked actions$/)).toBeTruthy();
  });

  it("aria-label never exposes a raw [alert:<id>] token", () => {
    renderBadge("alert-xyz", { count: 4, singleActionId: null });
    const anchor = screen.getByTestId("badge-linked-action-anchor");
    const label = anchor.getAttribute("aria-label") ?? "";
    expect(label).not.toContain("[alert:");
    expect(label).not.toContain("alert-xyz");
  });

  it("routing hrefs remain unchanged after aria-label additions", () => {
    renderBadge("alert-xyz", { count: 1, singleActionId: "act-xyz" });
    expect(
      screen.getByTestId("badge-linked-action-anchor").getAttribute("href"),
    ).toBe(actionDetailPath("act-xyz"));

    renderBadge("alert-xyz", { count: 4, singleActionId: null });
    const anchors = screen.getAllByTestId("badge-linked-action-anchor");
    expect(anchors[anchors.length - 1].getAttribute("href")).toBe(
      actionQueueAlertContextPath("alert-xyz"),
    );
  });

  it("aria-label copy avoids automation/execution/device verbs", () => {
    renderBadge("alert-1", { count: 7, singleActionId: null });
    const label = (
      screen.getByTestId("badge-linked-action-anchor").getAttribute("aria-label") ?? ""
    ).toLowerCase();
    for (const tok of [
      "auto",
      "execute",
      "actuate",
      "device",
      "relay",
      "mqtt",
      "approve",
      "reject",
      "resolve",
      "dismiss",
    ]) {
      expect(label).not.toContain(tok);
    }
  });
});

// --- Static safety scan ------------------------------------------------------
const SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/LinkedActionCountBadge.tsx"),
  "utf8",
);

describe("LinkedActionCountBadge — safety scan", () => {
  it("introduces no DB writes, edge function calls, or privileged tokens", () => {
    const lower = SRC.toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    expect(SRC).not.toMatch(/\.upsert\(/);
    expect(SRC).not.toMatch(/\.rpc\(/);
    expect(SRC).not.toMatch(/\.insert\(/);
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
    expect(SRC).not.toMatch(/from\(["']action_queue["']\)/);
    expect(SRC).not.toMatch(/from\(["']alerts["']\)/);
  });
});
