import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentPlantRosterQuickActions,
  dispatchTentPlantRosterQuickLog,
  tentPlantRosterQuickActionsTriggerLabel,
  PLANT_QUICKLOG_PREFILL_EVENT,
} from "@/lib/tentPlantRosterQuickActions";

describe("tentPlantRosterQuickActions helper", () => {
  it("builds three entries in stable order", () => {
    const entries = buildTentPlantRosterQuickActions({
      plantId: "p1",
      plantName: "Alpha",
      tentId: "t1",
      growId: "g1",
    });
    expect(entries.map((e) => e.kind)).toEqual([
      "view_diary",
      "add_quicklog",
      "view_photos",
    ]);
  });

  it("view_diary navigates to Plant Detail with timeline anchor", () => {
    const [diary] = buildTentPlantRosterQuickActions({
      plantId: "p1",
      plantName: "Alpha",
      tentId: "t1",
      growId: "g1",
    });
    expect(diary.href).toBe("/plants/p1#plant-relative-timeline");
    expect(diary.anchorBlocked).toBe(false);
    expect(diary.disabled).toBeFalsy();
  });

  it("view_photos navigates to Plant Detail and reports anchor blocked", () => {
    const entries = buildTentPlantRosterQuickActions({
      plantId: "p1",
      plantName: "Alpha",
      tentId: "t1",
      growId: "g1",
    });
    const photos = entries.find((e) => e.kind === "view_photos")!;
    expect(photos.href).toBe("/plants/p1");
    expect(photos.anchorBlocked).toBe(true);
  });

  it("add_quicklog uses open-quicklog event with correct payload", () => {
    const entries = buildTentPlantRosterQuickActions({
      plantId: "p1",
      plantName: "Alpha",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
    });
    const ql = entries.find((e) => e.kind === "add_quicklog")!;
    expect(ql.event).toBe("open-quicklog");
    expect(ql.eventPayload).toEqual({
      plantId: "p1",
      plantName: "Alpha",
      growId: "g1",
      tentId: "t1",
      tentName: "Tent A",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("add_quicklog is disabled when grow/tent context is missing", () => {
    const entries = buildTentPlantRosterQuickActions({
      plantId: "p1",
      plantName: "Alpha",
      tentId: null,
      growId: null,
    });
    const ql = entries.find((e) => e.kind === "add_quicklog")!;
    expect(ql.disabled).toBe(true);
    expect(ql.eventPayload).toBeNull();
  });

  it("all entries disabled when plantId is missing", () => {
    const entries = buildTentPlantRosterQuickActions({
      plantId: null,
      tentId: "t1",
      growId: "g1",
    });
    expect(entries.every((e) => e.disabled === true)).toBe(true);
  });

  it("trigger label includes plant name", () => {
    expect(tentPlantRosterQuickActionsTriggerLabel("Alpha")).toBe(
      "Open actions for Alpha",
    );
    expect(tentPlantRosterQuickActionsTriggerLabel(null)).toBe(
      "Open actions for this plant",
    );
  });

  it("dispatchTentPlantRosterQuickLog emits the existing event with payload", () => {
    const received: Array<unknown> = [];
    const listener = (ev: Event) => received.push((ev as CustomEvent).detail);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    dispatchTentPlantRosterQuickLog({
      plantId: "p1",
      plantName: "Alpha",
      growId: "g1",
      tentId: "t1",
      tentName: null,
      eventType: "observation",
      suggestSnapshot: true,
    });
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(PLANT_QUICKLOG_PREFILL_EVENT).toBe("verdant:open-quicklog");
    expect(received).toHaveLength(1);
    expect((received[0] as { plantId: string }).plantId).toBe("p1");
  });

  it("dispatch is a no-op when payload is null", () => {
    const received: Array<unknown> = [];
    const listener = (ev: Event) => received.push(ev);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    dispatchTentPlantRosterQuickLog(null);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(received).toHaveLength(0);
  });
});

describe("tentPlantRosterQuickActions static safety", () => {
  const path = resolve(__dirname, "../lib/tentPlantRosterQuickActions.ts");
  const content = readFileSync(path, "utf8");

  it("does not import Supabase or write helpers", () => {
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
