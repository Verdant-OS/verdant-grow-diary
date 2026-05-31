/**
 * GrowRoomQuickActionsCard — render & interaction smoke tests.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GrowRoomQuickActionsCard from "@/components/GrowRoomQuickActionsCard";

afterEach(() => cleanup());

function renderCard(props: Partial<React.ComponentProps<typeof GrowRoomQuickActionsCard>> = {}) {
  return render(
    <MemoryRouter>
      <GrowRoomQuickActionsCard scopedGrowId={null} {...props} />
    </MemoryRouter>,
  );
}

describe("GrowRoomQuickActionsCard", () => {
  it("renders all 5 quick-action buttons by default", () => {
    renderCard();
    expect(screen.getByTestId("grow-room-launcher-quicklog")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-manual-sensor-snapshot")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-ask-doctor")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-review-alerts")).toBeTruthy();
    expect(screen.getByTestId("grow-room-launcher-record-outcome")).toBeTruthy();
  });

  it("hides Record outcome when surface is unavailable", () => {
    renderCard({ recordOutcomeAvailable: false });
    expect(screen.queryByTestId("grow-room-launcher-record-outcome")).toBeNull();
  });

  it("href targets reflect the scoped grow id", () => {
    renderCard({ scopedGrowId: "grow-9" });
    const sensors = screen.getByTestId("grow-room-launcher-manual-sensor-snapshot") as HTMLAnchorElement;
    const alerts = screen.getByTestId("grow-room-launcher-review-alerts") as HTMLAnchorElement;
    const outcome = screen.getByTestId("grow-room-launcher-record-outcome") as HTMLAnchorElement;
    expect(sensors.getAttribute("href")).toBe("/sensors?growId=grow-9");
    expect(alerts.getAttribute("href")).toBe("/alerts?growId=grow-9");
    expect(outcome.getAttribute("href")).toBe("/dashboard?growId=grow-9");
  });

  it("Ask Doctor links to /doctor regardless of scope", () => {
    renderCard({ scopedGrowId: "grow-9" });
    const doctor = screen.getByTestId("grow-room-launcher-ask-doctor") as HTMLAnchorElement;
    expect(doctor.getAttribute("href")).toBe("/doctor");
  });

  it("QuickLog button dispatches the existing verdant:open-quicklog event", () => {
    renderCard();
    const handler = vi.fn();
    window.addEventListener("verdant:open-quicklog", handler);
    fireEvent.click(screen.getByTestId("grow-room-launcher-quicklog"));
    window.removeEventListener("verdant:open-quicklog", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe("verdant:open-quicklog");
    expect(ev.detail).toBeNull();
  });
});
