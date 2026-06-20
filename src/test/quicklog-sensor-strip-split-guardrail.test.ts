/**
 * Static guardrail: the parked Quick Log enhancements (mini-chart,
 * recent-series hook, localStorage attach preference) must NOT be wired
 * back into the production QuickLog component before field validation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const QL = readFileSync(resolve(__dirname, "../components/QuickLog.tsx"), "utf8");

describe("QuickLog publish-slice split guardrail", () => {
  it("does not import or mount the sensor mini-chart", () => {
    expect(QL).not.toMatch(/QuickLogSensorMiniChart/);
  });

  it("does not import or use the recent tent sensor series hook", () => {
    expect(QL).not.toMatch(/useRecentTentSensorSeries/);
  });

  it("does not import or use the attach-preference localStorage helpers", () => {
    expect(QL).not.toMatch(/quickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/hasQuickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/loadQuickLogSensorAttachPreference/);
    expect(QL).not.toMatch(/saveQuickLogSensorAttachPreference/);
  });

  it("only uses localStorage for the narrow last-target memory key (no payloads/secrets/state)", () => {
    // QuickLog is allowed to remember the grower's last Quick Log target
    // (plantId/growId/tentId/savedAt) on this device only, under the key
    // `verdant.quickLog.lastTarget.v1`. Nothing else may live in localStorage:
    // no raw sensor payloads, no sensor_readings, no secrets/tokens, no
    // bridge/service-role keys, no device-control state, no Action Queue
    // state, no alerts, no AI output.
    const ALLOWED_KEY = "verdant.quickLog.lastTarget.v1";
    expect(QL).toMatch(/verdant\.quickLog\.lastTarget\.v1/);

    // Strip any string literal mentioning the allowed key so the forbidden
    // scans below cannot be tricked by it.
    const scrubbed = QL.replace(
      new RegExp(`["']${ALLOWED_KEY.replace(/\./g, "\\.")}["']`, "g"),
      '""',
    );

    // Forbidden localStorage payloads / state classes.
    const FORBIDDEN = [
      /raw_?payload/i,
      /sensor_readings/i,
      /\bsecret\b/i,
      /\btoken\b/i,
      /service_role/i,
      /\bbridge[_-]?token\b/i,
      /\bdevice[_-]?control\b/i,
      /\baction_queue\b/i,
      /\balerts?\b.*localStorage/i,
      /ai[_-]?output/i,
    ];
    // Find every localStorage call site and inspect the surrounding 120 chars
    // for forbidden keywords.
    const sites = [
      ...scrubbed.matchAll(/localStorage\.(getItem|setItem|removeItem)\s*\([^)]*\)/g),
    ];
    expect(sites.length).toBeGreaterThan(0);
    for (const m of sites) {
      const start = Math.max(0, (m.index ?? 0) - 120);
      const end = Math.min(scrubbed.length, (m.index ?? 0) + m[0].length + 120);
      const window = scrubbed.slice(start, end);
      for (const re of FORBIDDEN) {
        expect(
          re.test(window),
          `localStorage call site near "${m[0]}" must not mention ${re}`,
        ).toBe(false);
      }
    }
  });

  it("parked source files are removed from the repo", () => {
    const root = resolve(__dirname, "..", "..");
    expect(existsSync(resolve(root, "src/components/QuickLogSensorMiniChart.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/hooks/useRecentTentSensorSeries.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/quickLogSensorMiniChartRules.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/quickLogSensorAttachPreference.ts"))).toBe(false);
  });

  it("has no automation / device-control / fake-live wording", () => {
    expect(QL).not.toMatch(/\baction_queue\.(insert|update|delete|upsert)/i);
    expect(QL).not.toMatch(/service_role/);
    expect(QL).not.toMatch(/functions\.invoke/);
    expect(QL).not.toMatch(/\.rpc\(/);
    expect(QL).not.toMatch(/live updating/i);
  });

});
