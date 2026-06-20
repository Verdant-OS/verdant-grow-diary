import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../components/PlantQuickLog.tsx"),
  "utf8",
);

describe("PlantQuickLog static safety", () => {
  it("does not introduce model, Edge Function, alert, Action Queue, or device-control behavior", () => {
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|model client|ai doctor/i);
    expect(SRC).not.toMatch(/action_queue|ActionQueue|action queue/i);
    expect(SRC).not.toMatch(/alert.*insert|insert.*alert|alerts\.insert/i);
    expect(SRC).not.toMatch(/control device|device control|set fan|set light|turn on|turn off/i);
  });

  it("does not expose restricted secret/token patterns", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/bridge token|bridge_token|VERDANT_BRIDGE_TOKEN/i);
    expect(SRC).not.toMatch(/OPENAI_API_KEY|process\.env|VITE_/);
  });

  it("keeps manual readings explicitly non-live", () => {
    expect(SRC).toMatch(/Manual readings are not live sensor data/);
    expect(SRC).not.toMatch(/manual readings are live/i);
    expect(SRC).not.toMatch(/fake live|live proof|verified live/i);
  });

  it("does not add new schema/table targets beyond existing diary entry and photo storage paths", () => {
    expect(SRC).toMatch(/from\("diary-photos"\)/);
    expect(SRC).toMatch(/from\("diary_entries"\)/);
    expect(SRC).not.toMatch(/from\("sensor_readings"\)/);
    expect(SRC).not.toMatch(/from\("alerts"\)/);
    expect(SRC).not.toMatch(/from\("action_queue"\)/);
  });
});
