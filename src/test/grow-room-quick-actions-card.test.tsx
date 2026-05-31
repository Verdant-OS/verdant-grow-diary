/**
 * GrowRoomQuickActionsCard — render & interaction smoke tests.
 *
 * Covers:
 *  - all entries render with testIds
 *  - all entries expose an aria-label
 *  - QuickLog dispatches exactly once on click with the expected payload
 *  - QuickLog payload includes scoped growId when supplied
 *  - QuickLog payload includes scoped plantId only when supplied
 *  - QuickLog dispatch is null when no scoped context is available
 *  - Record-outcome renders disabled (not removed) with a reason when
 *    surface is unavailable
 *  - Visible focus-visible ring class is present on entries
 *  - Scoped grow id is preserved in href targets
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GrowRoomQuickActionsCard from "@/components/GrowRoomQuickActionsCard";

afterEach(() => cleanup());

function renderCard(
  props: Partial<React.ComponentProps<typeof GrowRoomQuickActionsCard>> = {},
) {
  return render(
    <MemoryRouter>
      <GrowRoomQuickActionsCard scopedGrowId={null} {...props} />
    </MemoryRouter>,
  );
}

function captureQuickLog() {
  const handler = vi.fn();
  window.addEventListener("verdant:open-quicklog", handler);
  return {
    handler,
    cleanup: () => window.removeEventListener("verdant:open-quicklog", handler),
  };
}

describe("GrowRoomQuickActionsCard · render", () => {
  it("renders all 5 quick-action buttons by default", () => {
    renderCard();
    expect(screen.getByTestId("grow-room-launcher-quicklog")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-manual-sensor-snapshot")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-ask-doctor")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-review-alerts")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-record-outcome")).toBeTruthy();
  });

  it("renders aria-label on every launcher entry", () => {
    renderCard({ scopedGrowId: "grow-1" });
    for (const id of [
      "grow-room-launcher-quicklog",
      "grow-room-launcher-manual-sensor-snapshot",
      "grow-room-launcher-ask-doctor",
      "grow-room-launcher-review-alerts",
      "grow-room-launcher-record-outcome",
    ]) {
      const el = screen.getByTestId(id);
      // For href-asChild entries the aria-label is on the inner <a>.
      const labeled =
        el.getAttribute("aria-label") ??
        el.querySelector("[aria-label]")?.getAttribute("aria-label");
      expect(labeled, `missing aria-label on ${id}`).toBeTruthy();
    }
  });

  it("href targets reflect the scoped grow id", () => {
    renderCard({ scopedGrowId: "grow-9" });
    const sensors = screen.getByTestId(
      "grow-room-launcher-manual-sensor-snapshot",
    ) as HTMLAnchorElement;
    const alerts = screen.getByTestId(
      "grow-room-launcher-review-alerts",
    ) as HTMLAnchorElement;
    const outcome = screen.getByTestId(
      "grow-room-launcher-record-outcome",
    ) as HTMLAnchorElement;
    expect(sensors.getAttribute("href")).toBe("/sensors?growId=grow-9");
    expect(alerts.getAttribute("href")).toBe("/alerts?growId=grow-9");
    expect(outcome.getAttribute("href")).toBe("/dashboard?growId=grow-9");
  });

  it("Ask Doctor links to /doctor regardless of scope", () => {
    renderCard({ scopedGrowId: "grow-9" });
    const doctor = screen.getByTestId(
      "grow-room-launcher-ask-doctor",
    ) as HTMLAnchorElement;
    expect(doctor.getAttribute("href")).toBe("/doctor");
  });

  it("applies the focus-visible ring class to action buttons", () => {
    renderCard();
    const ql = screen.getByTestId("grow-room-launcher-quicklog");
    expect(ql.className).toMatch(/focus-visible:ring-2/);
  });
});

describe("GrowRoomQuickActionsCard · QuickLog dispatch", () => {
  it("dispatches verdant:open-quicklog exactly once on click", () => {
    renderCard();
    const { handler, cleanup: stop } = captureQuickLog();
    fireEvent.click(screen.getByTestId("grow-room-launcher-quicklog"));
    stop();
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe("verdant:open-quicklog");
    expect(ev.detail).toBeNull();
  });

  it("payload carries scoped growId when supplied", () => {
    renderCard({ scopedGrowId: "grow-42" });
    const { handler, cleanup: stop } = captureQuickLog();
    fireEvent.click(screen.getByTestId("grow-room-launcher-quicklog"));
    stop();
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toEqual({ growId: "grow-42", plantId: null });
  });

  it("payload carries plantId only when already available from context", () => {
    renderCard({ scopedGrowId: "grow-42", scopedPlantId: "plant-7" });
    const { handler, cleanup: stop } = captureQuickLog();
    fireEvent.click(screen.getByTestId("grow-room-launcher-quicklog"));
    stop();
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toEqual({ growId: "grow-42", plantId: "plant-7" });
  });
});

describe("GrowRoomQuickActionsCard · disabled state", () => {
  it("Record outcome stays visible but disabled with reason when unavailable", () => {
    renderCard({ recordOutcomeAvailable: false });
    const btn = screen.getByTestId("grow-room-launcher-record-outcome") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    const reason = screen.getByTestId("grow-room-launcher-record-outcome-reason");
    expect(reason.textContent ?? "").toMatch(/no completed actions/i);
  });

  it("disabled Record outcome announces the reason in its aria-label", () => {
    renderCard({ recordOutcomeAvailable: false });
    const btn = screen.getByTestId("grow-room-launcher-record-outcome");
    expect(btn.getAttribute("aria-label") ?? "").toMatch(/unavailable/i);
  });

  it("disabled Record outcome does not dispatch or navigate on click", () => {
    renderCard({ recordOutcomeAvailable: false });
    const { handler, cleanup: stop } = captureQuickLog();
    const btn = screen.getByTestId("grow-room-launcher-record-outcome") as HTMLButtonElement;
    fireEvent.click(btn);
    stop();
    expect(handler).not.toHaveBeenCalled();
    expect(btn.querySelector("a")).toBeNull();
  });
});
