import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TENT_ROSTER_ACTION_EVENT,
  trackTentRosterAction,
} from "@/lib/tentPlantRosterActionTracking";

describe("trackTentRosterAction", () => {
  let received: Array<unknown> = [];
  const listener = (ev: Event) => received.push((ev as CustomEvent).detail);

  beforeEach(() => {
    received = [];
    window.addEventListener(TENT_ROSTER_ACTION_EVENT, listener as EventListener);
  });
  afterEach(() => {
    window.removeEventListener(TENT_ROSTER_ACTION_EVENT, listener as EventListener);
  });

  it("dispatches verdant:tent-roster-action with the safe detail shape", () => {
    trackTentRosterAction({
      action: "view_diary",
      plantName: "Alpha",
      hasTentContext: true,
      anchorBlocked: false,
    });
    expect(TENT_ROSTER_ACTION_EVENT).toBe("verdant:tent-roster-action");
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      action: "view_diary",
      plantName: "Alpha",
      hasTentContext: true,
      anchorBlocked: false,
    });
  });

  it("omits private/internal ids from the event detail", () => {
    trackTentRosterAction({
      action: "add_quick_log",
      plantName: "Beta",
      hasTentContext: true,
      anchorBlocked: false,
    });
    const detail = received[0] as Record<string, unknown>;
    expect(detail).not.toHaveProperty("plantId");
    expect(detail).not.toHaveProperty("tentId");
    expect(detail).not.toHaveProperty("growId");
  });

  it("normalises blank plantName to null", () => {
    trackTentRosterAction({
      action: "view_photos",
      plantName: "   ",
      hasTentContext: false,
      anchorBlocked: true,
    });
    expect((received[0] as { plantName: string | null }).plantName).toBeNull();
  });

  it("swallows dispatch errors", () => {
    const spy = vi
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => {
        throw new Error("boom");
      });
    expect(() =>
      trackTentRosterAction({
        action: "view_diary",
        plantName: "Alpha",
        hasTentContext: true,
        anchorBlocked: false,
      }),
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe("trackTentRosterAction static safety", () => {
  const path = resolve(__dirname, "../lib/tentPlantRosterActionTracking.ts");
  const content = readFileSync(path, "utf8");

  it("does not call fetch / XMLHttpRequest / Supabase", () => {
    expect(content).not.toMatch(/\bfetch\s*\(/);
    expect(content).not.toMatch(/XMLHttpRequest/);
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/supabase\.from\(/);
  });

  it("does not import AI/model/alerts/action-queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
});
