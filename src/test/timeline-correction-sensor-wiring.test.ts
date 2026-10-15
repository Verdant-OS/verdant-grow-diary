import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const timeline = readFileSync(resolve(process.cwd(), "src/pages/Timeline.tsx"), "utf8");

describe("Timeline correction sensor wiring", () => {
  it("passes the Timeline-only sensor rows into the diary correction dialog", () => {
    expect(timeline).toContain(
      "correctionValuesForTimelineDiaryEntry(\n                                      e,\n                                      timelineSensorEvents,\n                                    )",
    );
    expect(timeline).toContain(".select(TIMELINE_SENSOR_GROW_EVENT_SELECT)");
    expect(timeline).toContain('.eq("event_type", "environment")');
  });

  it("keeps a sensor-query failure off the required Timeline read", () => {
    const start = timeline.indexOf("let sensorEventsQuery");
    const end = timeline.indexOf("setEntries(coreRows)");
    expect(start).toBeGreaterThan(-1);
    const sensorRead = timeline.slice(start, end);
    expect(sensorRead).not.toContain("throw sensorEventsResult.error");
    expect(timeline).toContain(
      'setPartialReadSources(sensorReadFailed ? ["manual_sensor_readings"] : [])',
    );
  });
});
