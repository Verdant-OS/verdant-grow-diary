/**
 * Public pricing history truth.
 *
 * The entitlement catalog and RLS policy give Free growers 90 days of
 * sensor-reading history while paid plans can read the full stored history.
 * Diary and timeline entries remain the grower's history on every plan; paid
 * value comes from advanced filtering and jump tools, never retention.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, "..", relativePath), "utf8");

const PAGE = source("pages/Pricing.tsx");
const CONSTANTS = source("constants/pricing.ts");

describe("public pricing history truth", () => {
  it("states the real Free and paid sensor-history windows", () => {
    expect(PAGE).toMatch(
      /label:\s*"Sensor snapshot history"[\s\S]{0,180}free:\s*"90 days"[\s\S]{0,100}pro:\s*"Full history"[\s\S]{0,100}craft:\s*"Full history"[\s\S]{0,100}founder:\s*"Full history"/,
    );
    expect(CONSTANTS).toContain('"Full sensor snapshot history"');
  });

  it("keeps diary and timeline history forever on every plan", () => {
    expect(PAGE).toMatch(
      /label:\s*"Diary & timeline history"[\s\S]{0,180}free:\s*"Kept forever"[\s\S]{0,100}pro:\s*"Kept forever"[\s\S]{0,100}craft:\s*"Kept forever"[\s\S]{0,100}founder:\s*"Kept forever"/,
    );
    expect(PAGE).not.toMatch(/longer grow history/i);
  });

  it("sells advanced filtering and jump tools instead of retention or future promises", () => {
    expect(PAGE).toMatch(
      /label:\s*"Advanced timeline filtering & jump tools"[\s\S]{0,160}free:\s*false[\s\S]{0,80}pro:\s*true[\s\S]{0,80}craft:\s*true[\s\S]{0,80}founder:\s*true/,
    );
    expect(CONSTANTS).toContain('"Advanced timeline filtering and jump tools"');
    expect(PAGE).not.toMatch(/Future Pro features/i);
  });
});
