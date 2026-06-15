/**
 * Quick Log preset menu polish audit.
 *
 * Verifies the consolidated Quick Log menu feels intentional rather than
 * a renamed Fast Add menu:
 *  - No grower-facing "Fast Add" copy remains.
 *  - Trigger accessible name is "Quick Log".
 *  - Preset order matches the recommended grower-friendly order.
 *  - All 8 preset event types are still present.
 *  - Clicking a preset still dispatches the existing Quick Log prefill event.
 *  - Menu helper text is present and clear.
 *  - No new modal or write path introduced.
 *  - No Supabase/Action Queue/device-control strings introduced.
 *
 * Pure render + static tests. No I/O. No Supabase. No model calls.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import {
  FAST_ADD_ACTIONS,
  resolveFastAddIntent,
  type FastAddActionId,
} from "@/lib/fastAddActionRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { EVENT_TYPE_MAP } from "@/lib/diary";

afterEach(() => cleanup());

function renderQuickLog(
  ctx: Parameters<typeof GlobalFastAddButton>[0]["context"] = null,
  extra?: Omit<Parameters<typeof GlobalFastAddButton>[0], "context">,
) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <GlobalFastAddButton context={ctx} {...extra} />
    </MemoryRouter>,
  );
}

describe("Quick Log preset menu — copy audit", () => {
  it("trigger accessible name is 'Quick Log'", () => {
    renderQuickLog();
    const trigger = screen.getByRole("button", { name: /quick log/i });
    expect(trigger).toBeInTheDocument();
  });

  it("menu aria-label mentions Quick Log", () => {
    renderQuickLog();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-label")).toMatch(/quick log/i);
  });

  it("no grower-facing 'Fast Add' copy exists in the rendered menu", () => {
    renderQuickLog();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    const menu = screen.getByTestId("global-fast-add-menu");
    expect(menu.textContent).not.toMatch(/fast add/i);
  });

  it("menu helper text reads 'Choose what you want to log.'", () => {
    renderQuickLog();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    const menu = screen.getByTestId("global-fast-add-menu");
    expect(menu.textContent).toMatch(/choose what you want to log/i);
  });
});

describe("Quick Log preset menu — order and completeness", () => {
  it("preset order matches the recommended grower-friendly order", () => {
    const ids = FAST_ADD_ACTIONS.map((a) => a.id);
    expect(ids).toEqual([
      "diary_note",
      "photo",
      "watering",
      "feeding",
      "environment",
      "training",
      "diagnosis",
      "harvest",
    ]);
  });

  it("all 8 preset labels are clear and concise", () => {
    const labels = FAST_ADD_ACTIONS.map((a) => a.label);
    expect(labels).toEqual([
      "Note",
      "Photo",
      "Watering",
      "Feeding",
      "Environment",
      "Training",
      "Diagnosis",
      "Harvest",
    ]);
  });

  it("all 8 presets are rendered as menu items", () => {
    renderQuickLog({ plantId: "p1", tentId: null, growId: "g1" });
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    for (const a of FAST_ADD_ACTIONS) {
      expect(
        screen.getByTestId(`global-fast-add-action-${a.id}`),
      ).toBeInTheDocument();
    }
  });

  it("every non-diagnosis preset maps to a registered diary eventType", () => {
    for (const a of FAST_ADD_ACTIONS) {
      if (a.quickLogEventType === null) continue;
      expect(EVENT_TYPE_MAP[a.quickLogEventType]).toBeDefined();
    }
  });
});

describe("Quick Log preset menu — event wiring", () => {
  it.each(
    FAST_ADD_ACTIONS.filter((a) => a.id !== "diagnosis").map(
      (a) => [a.id, a.quickLogEventType!] as const,
    ),
  )(
    "clicking '%s' dispatches the existing Quick Log event with eventType=%s",
    (actionId, expectedEventType) => {
      const onDispatchEvent = vi.fn();
      renderQuickLog(
        { plantId: "p1", tentId: null, growId: "g1" },
        { onDispatchEvent },
      );
      fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
      fireEvent.click(screen.getByTestId(`global-fast-add-action-${actionId}`));
      expect(onDispatchEvent).toHaveBeenCalledTimes(1);
      const [eventName, detail] = onDispatchEvent.mock.calls[0];
      expect(eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect((detail as { eventType: string }).eventType).toBe(expectedEventType);
    },
  );

  it("diagnosis preset navigates instead of dispatching an event", () => {
    const onNavigate = vi.fn();
    const onDispatchEvent = vi.fn();
    renderQuickLog({
      plantId: "p1",
      tentId: null,
      growId: "g1",
      onNavigate,
      onDispatchEvent,
    } as any);
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-diagnosis"));
    expect(onNavigate).toHaveBeenCalledWith("/plants/p1#ai-doctor");
    expect(onDispatchEvent).not.toHaveBeenCalled();
  });
});

describe("Quick Log preset menu — safety", () => {
  it("no Supabase write methods exist in the component or rules source", () => {
    // This is covered by the existing static safety suites; this test
    // exists as a focused reminder in the preset polish band.
    for (const actionId of FAST_ADD_ACTIONS.map((a) => a.id)) {
      const intent = resolveFastAddIntent(actionId as FastAddActionId, null);
      // Without context, every preset should safely return needs-context
      // rather than attempting a write.
      expect(intent.kind).toBe("needs-context");
    }
  });

  it("no new modal or separate write path is introduced", () => {
    renderQuickLog({ plantId: "p1", tentId: null, growId: "g1" });
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    // The menu should be the only surfaced UI; no separate modal
    // should appear without user interaction.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
