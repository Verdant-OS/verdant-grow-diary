/**
 * Tests — GlobalFastAddButton + fastAddActionRules.
 * Pure / render tests. No network, no Supabase, no model calls.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import GlobalFastAddButton from "../components/GlobalFastAddButton";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_NO_CONTEXT_COPY,
  resolveFastAddIntent,
  deriveSelectionContextFromPathname,
} from "../lib/fastAddActionRules";

afterEach(() => cleanup());

function renderAt(pathname: string, props: Parameters<typeof GlobalFastAddButton>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <GlobalFastAddButton {...props} />
    </MemoryRouter>,
  );
}

describe("fastAddActionRules", () => {
  it("defines all 8 Fast Add actions in stable order", () => {
    expect(FAST_ADD_ACTIONS.map((a) => a.id)).toEqual([
      "diary_note",
      "watering",
      "feeding",
      "training",
      "photo",
      "environment",
      "diagnosis",
      "harvest",
    ]);
  });

  it("returns needs-context when no plant/tent selected", () => {
    for (const a of FAST_ADD_ACTIONS) {
      const intent = resolveFastAddIntent(a.id, null);
      expect(intent.kind).toBe("needs-context");
      if (intent.kind === "needs-context") {
        expect(intent.message).toBe(FAST_ADD_NO_CONTEXT_COPY);
      }
    }
  });

  it("routes non-diagnosis actions to open the existing Quick Log via event", () => {
    const ctx = { plantId: "p1", tentId: null, growId: "g1" };
    const intent = resolveFastAddIntent("watering", ctx);
    expect(intent.kind).toBe("open-quicklog");
    if (intent.kind === "open-quicklog") {
      expect(intent.prefill.eventType).toBe("watering");
      expect(intent.prefill.plantId).toBe("p1");
      expect(intent.eventName).toBe("verdant:open-quicklog");
    }
  });

  it("diagnosis action navigates only — never triggers a model call", () => {
    const intent = resolveFastAddIntent("diagnosis", {
      plantId: "p1",
      tentId: null,
      growId: null,
    });
    expect(intent.kind).toBe("navigate");
    if (intent.kind === "navigate") {
      expect(intent.to).toMatch(/^\/plants\/p1#ai-doctor$/);
    }
  });

  it("derives selection context from /plants/:id and /tents/:id pathnames", () => {
    expect(deriveSelectionContextFromPathname("/plants/abc")).toEqual({
      plantId: "abc",
      tentId: null,
      growId: null,
    });
    expect(deriveSelectionContextFromPathname("/tents/xyz")).toEqual({
      plantId: null,
      tentId: "xyz",
      growId: null,
    });
    expect(deriveSelectionContextFromPathname("/dashboard")).toBeNull();
  });
});

describe("GlobalFastAddButton", () => {
  it("renders the Fast Add trigger globally", () => {
    renderAt("/");
    expect(screen.getByTestId("global-fast-add-trigger")).toBeTruthy();
  });

  it("opens a menu showing all 8 actions", () => {
    renderAt("/plants/p1");
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    for (const a of FAST_ADD_ACTIONS) {
      expect(
        screen.getByTestId(`global-fast-add-action-${a.id}`),
      ).toBeTruthy();
    }
  });

  it("shows calm no-context copy when no plant/tent selected", () => {
    renderAt("/dashboard");
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-watering"));
    const notice = screen.getByTestId("global-fast-add-needs-context");
    expect(notice.textContent).toBe(FAST_ADD_NO_CONTEXT_COPY);
  });

  it("dispatches the Quick Log event for a logging action when context exists", () => {
    const onDispatchEvent = vi.fn();
    renderAt("/plants/p1", { onDispatchEvent });
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-feeding"));
    expect(onDispatchEvent).toHaveBeenCalledTimes(1);
    const [eventName, detail] = onDispatchEvent.mock.calls[0];
    expect(eventName).toBe("verdant:open-quicklog");
    expect((detail as { eventType: string }).eventType).toBe("feeding");
  });

  it("navigates for Diagnosis (no event, no model call)", () => {
    const onNavigate = vi.fn();
    const onDispatchEvent = vi.fn();
    renderAt("/plants/p1", { onNavigate, onDispatchEvent });
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-diagnosis"));
    expect(onNavigate).toHaveBeenCalledWith("/plants/p1#ai-doctor");
    expect(onDispatchEvent).not.toHaveBeenCalled();
  });
});

describe("GlobalFastAddButton + fastAddActionRules — static safety", () => {
  const SRC = [
    "../components/GlobalFastAddButton.tsx",
    "../lib/fastAddActionRules.ts",
  ]
    .map((p) => readFileSync(resolve(__dirname, p), "utf8"))
    .join("\n");

  it("contains no privileged keys or bridge tokens", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/bridge_token/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("does not call functions.invoke or fetch", () => {
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
  });
  it("performs no Supabase writes", () => {
    for (const t of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SRC).not.toContain(t);
    }
  });
  it("touches no alerts or action_queue tables", () => {
    expect(SRC).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(SRC).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
  });
  it("contains no device-control or automation strings", () => {
    for (const t of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
      "auto_apply",
      "autopilot",
      "scheduler.run",
    ]) {
      expect(SRC).not.toContain(t);
    }
  });
});
