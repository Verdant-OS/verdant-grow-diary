import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SensorSnapshotDetailsDrawer, {
  SNAPSHOT_DRAWER_CLOSE_LABEL,
  type SensorSnapshotDetailsDrawerData,
} from "@/components/SensorSnapshotDetailsDrawer";

const base: SensorSnapshotDetailsDrawerData = {
  snapshotId: "s1",
  capturedAt: "2026-06-19T12:00:00Z",
  source: "live",
  provider: "ecowitt",
  transport: "mqtt",
  tentId: "t1",
  plantId: "p1",
  vpdKpa: 1.2,
  soilMoisturePct: 35,
  humidityPct: 55,
  airTemperatureC: 22,
  confidence: 0.9,
  staleOrInvalid: false,
};

describe("SensorSnapshotDetailsDrawer — accessibility", () => {
  it("renders as a modal dialog with title and description wiring", () => {
    render(<SensorSnapshotDetailsDrawer open onOpenChange={() => {}} data={base} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("exposes a clearly-labelled close button", () => {
    render(<SensorSnapshotDetailsDrawer open onOpenChange={() => {}} data={base} />);
    const close = screen.getByLabelText(SNAPSHOT_DRAWER_CLOSE_LABEL);
    expect(close).toBeTruthy();
  });

  it("calls onOpenChange(false) when Escape is pressed", () => {
    const spy = vi.fn();
    render(<SensorSnapshotDetailsDrawer open onOpenChange={spy} data={base} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(spy).toHaveBeenCalledWith(false);
  });

  it("never renders raw payload, MAC, passkey, or bearer-like strings", () => {
    const { container } = render(
      <SensorSnapshotDetailsDrawer open onOpenChange={() => {}} data={base} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/i);
    expect(html).not.toMatch(/passkey/i);
    expect(html).not.toMatch(/Bearer\s+/);
    expect(html).not.toMatch(/\b[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}\b/);
  });
});
