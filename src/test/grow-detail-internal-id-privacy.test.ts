import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const GROW_DETAIL = readSource("src/pages/GrowDetail.tsx");

const FORBIDDEN_SIDE_EFFECT_TOKENS = [
  "functions.invoke",
  "action_queue.insert",
  "alerts.insert",
  "device-control",
  "deviceControl",
  "mqtt.connect",
  "publish(",
  "service_role",
];

describe("grow detail internal id privacy", () => {
  it("does not render the raw grow UUID as a grow-facing field", () => {
    expect(GROW_DETAIL).not.toContain('label="Grow ID"');
    expect(GROW_DETAIL).not.toContain("Grow ID");
    expect(GROW_DETAIL).not.toMatch(/<Field[^>]+value=\{grow\.id\}[^>]*mono/);
  });

  it("keeps grow id only for routing and child component props", () => {
    expect(GROW_DETAIL).toMatch(/GrowBreadcrumbs growId=\{grow\.id\}/);
    expect(GROW_DETAIL).toMatch(/StartPhenoHuntButton growId=\{grow\.id\}/);
    expect(GROW_DETAIL).toMatch(/logsPath\(growId\)/);
    expect(GROW_DETAIL).toMatch(/plantsPath\(growId\)/);
    expect(GROW_DETAIL).toMatch(/tentsPath\(growId\)/);
  });

  it("does not introduce unsafe writes, automation, or device-control paths", () => {
    for (const token of FORBIDDEN_SIDE_EFFECT_TOKENS) {
      expect(GROW_DETAIL).not.toContain(token);
    }
    expect(GROW_DETAIL).not.toMatch(/raw_payload/i);
    expect(GROW_DETAIL).not.toMatch(/\.insert\(/);
    expect(GROW_DETAIL).not.toMatch(/\.update\(/);
    expect(GROW_DETAIL).not.toMatch(/\.delete\(/);
    expect(GROW_DETAIL).not.toMatch(/\.upsert\(/);
  });
});
