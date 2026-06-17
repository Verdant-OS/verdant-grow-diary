/**
 * Quick-action button rendering tests for AiDoctorContextReadinessPanel.
 *
 * Verifies:
 *  - missing-photo state renders the Fast Add Photo button
 *  - missing-watering state renders Add Watering
 *  - missing-feeding state renders Add Feeding
 *  - buttons without a wired handler render disabled (no invented routes)
 *  - confidence-class banner copy is rendered
 *  - clicking a button does NOT trigger any AI/session/fetch/Supabase call
 *    (handler is presenter-only)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in panel quick-action test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in panel quick-action test");
      },
    },
  },
}));

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function makeContext(events: ReadonlyArray<Record<string, unknown>>) {
  return compileAiDoctorContextFromRows({
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "NL",
      stage: "veg",
      grow_id: "g1",
      tent_id: "t1",
    },
    growEvents: events,
    sensorReadings: [],
    now: NOW,
  });
}

describe("AiDoctorContextReadinessPanel quick actions", () => {
  it("renders Fast Add Photo / Add Watering / Add Feeding when missing", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockImplementation((() => {
        throw new Error("fetch not allowed in quick-action panel test");
      }) as never);

    render(
      <AiDoctorContextReadinessPanel
        context={makeContext([])}
        openAlertsCount={0}
      />,
    );
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-watering",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-feeding",
      ),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders disabled buttons when no handler is wired (no invented routes)", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={makeContext([])}
        openAlertsCount={0}
      />,
    );
    const button = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-disabled")).toBe("true");
  });

  it("hides missing-context buttons whose evidence is already present", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={makeContext([
          { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
          { occurred_at: ago(HOUR), event_type: "feeding", source: "manual" },
          { occurred_at: ago(HOUR), event_type: "photo", source: "manual" },
        ])}
        openAlertsCount={0}
      />,
    );
    expect(
      screen.queryByTestId(
        "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-watering",
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-feeding",
      ),
    ).toBeNull();
  });

  it("invokes wired handlers without triggering AI/session calls", () => {
    const onAddWatering = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={makeContext([])}
        openAlertsCount={0}
        quickActions={{ onAddWatering }}
      />,
    );
    const button = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-add-watering",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onAddWatering).toHaveBeenCalledTimes(1);
  });

  it("renders confidence-class copy", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={makeContext([])}
        openAlertsCount={0}
      />,
    );
    const banner = screen.getByTestId(
      "ai-doctor-context-readiness-panel-confidence-class-copy",
    );
    expect(banner.textContent).toMatch(
      /Context looks strong|AI Doctor can run|not trustworthy/,
    );
  });
});
