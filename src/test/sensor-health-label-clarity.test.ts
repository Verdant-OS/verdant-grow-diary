import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const TENTS_PAGE = "src/pages/Tents.tsx";
const PLANTS_PAGE = "src/pages/Plants.tsx";
const TENTS = readSource(TENTS_PAGE);
const PLANTS = readSource(PLANTS_PAGE);

const FORBIDDEN_SIDE_EFFECT_TOKENS = [
  "functions.invoke",
  "action_queue",
  "alerts.insert",
  "device-control",
  "deviceControl",
  "mqtt.connect",
  "publish(",
  "service_role",
];

describe("sensor health label clarity", () => {
  it("tents page scopes the card health chip to plant health", () => {
    expect(TENTS).toMatch(/Plant health:/);
    expect(TENTS).toMatch(/Plant health status:/);
    expect(TENTS).toMatch(/Sensor status is shown separately/);
    expect(TENTS).toMatch(/Plant health only — sensor status is shown separately/);
  });

  it("plants page scopes the card health chip to plant health", () => {
    expect(PLANTS).toMatch(/Plant health:/);
    expect(PLANTS).toMatch(/Plant health status:/);
    expect(PLANTS).toMatch(/Sensor status is shown separately/);
    expect(PLANTS).toMatch(/Plant health only — sensor status is shown separately/);
  });

  it("plants page no longer renders a naked health value beside the green dot", () => {
    expect(PLANTS).not.toMatch(/<span className="capitalize">\{p\.health\}<\/span>/);
    expect(PLANTS).toMatch(/formatPlantHealthLabel\(p\.health\)/);
    expect(PLANTS).toMatch(/formatPlantHealthAriaLabel\(p\.health\)/);
  });

  it("tents page strips the legacy decorative dot before rendering scoped copy", () => {
    expect(TENTS).toMatch(/formatTentPlantHealthCopy/);
    expect(TENTS).toMatch(/replace\(\/\^●\\s\*\//);
    expect(TENTS).toMatch(/Plant health: \{plantHealthCopy\}/);
  });

  it("does not weaken sensor truth labels or introduce unsafe side effects", () => {
    const combined = `${TENTS}\n${PLANTS}`;
    expect(combined).not.toMatch(/raw_payload/i);
    for (const token of FORBIDDEN_SIDE_EFFECT_TOKENS) {
      expect(combined).not.toContain(token);
    }
    expect(combined).toMatch(/GrowDataSourceDisclosure/);
    expect(combined).toMatch(/HELP_COPY\.staleData/);
    expect(combined).toMatch(/HELP_COPY\.liveSensorData/);
  });
});
