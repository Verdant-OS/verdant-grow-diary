/**
 * Static guardrail: the parked Quick Log enhancements (mini-chart,
 * recent-series hook, localStorage attach preference) must NOT be wired
 * back into the production QuickLog component before field validation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const QL = readFileSync(resolve(__dirname, "../components/QuickLog.tsx"), "utf8");
const QL_V2_SHEET = readFileSync(resolve(__dirname, "../components/QuickLogV2Sheet.tsx"), "utf8");
const RECENT_TARGET_STORE = readFileSync(
  resolve(__dirname, "../lib/quickLogRecentTargetStore.ts"),
  "utf8",
);

const LOCAL_STORAGE_SOURCES = [
  { name: "QuickLog.tsx", source: QL },
  { name: "QuickLogV2Sheet.tsx", source: QL_V2_SHEET },
  { name: "quickLogRecentTargetStore.ts", source: RECENT_TARGET_STORE },
] as const;

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

  it("only uses localStorage for the narrow last-target memory keys (no payloads/secrets/state)", () => {
    // QuickLog is allowed to remember the grower's last Quick Log target
    // (plantId/growId/tentId/savedAt) on this device only. Exactly ONE key
    // carries that shape: the account-scoped
    // `verdant.quickLog.lastTarget.v2.<userId>`, and it may only be read back
    // as a visible suggestion the grower explicitly accepts.
    //
    // The unscoped `verdant.quickLog.lastTarget.v1` write was RETIRED in
    // slice D5. It had zero readers, and because it ran before the signed-in
    // check it let an anonymous session leave a plant id on a shared device.
    // Pinned absent here so it cannot come back.
    //
    // Nothing else may live in localStorage: no raw sensor payloads, no
    // sensor_readings, no secrets/tokens, no bridge/service-role keys, no
    // device-control state, no Action Queue state, no alerts, no AI output.
    expect(QL).not.toMatch(/verdant\.quickLog\.lastTarget\.v1/);
    // The v2 key is built in the pure suggestion module, so QuickLog carries
    // its builder rather than the literal — and that builder returns null for
    // a signed-out grower, which is what keeps the anonymous case empty.
    expect(QL).toMatch(/buildRecentTargetStorageKey/);
    // No bare last-target key literal survives in this component at all, so
    // the forbidden scans below need no scrubbing to stay honest.
    expect(QL).not.toMatch(/["'`]verdant\.quickLog\.lastTarget/);
    // The write moved into a shared store, so scan both production presenters
    // and the module that actually serializes and writes the record. Omitting
    // either presenter would let a newly added localStorage payload bypass the
    // fence; omitting the store would let the actual writer drift silently.
    expect(RECENT_TARGET_STORE).toMatch(/localStorage\.setItem\(/);
    expect(RECENT_TARGET_STORE).toMatch(
      /JSON\.stringify\(\{[\s\S]*plantId: target\.plantId,[\s\S]*growId: target\.growId,[\s\S]*tentId: target\.tentId,[\s\S]*savedAt: target\.savedAt,[\s\S]*\}\)/,
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
    // Find every localStorage call site in each declared production source and
    // inspect the surrounding 120 chars for forbidden keywords. Scan files
    // separately so one file's tail cannot contaminate another file's window.
    let siteCount = 0;
    for (const { name, source } of LOCAL_STORAGE_SOURCES) {
      const sites = [...source.matchAll(/localStorage\.(getItem|setItem|removeItem)\s*\([^)]*\)/g)];
      siteCount += sites.length;
      for (const m of sites) {
        const start = Math.max(0, (m.index ?? 0) - 120);
        const end = Math.min(source.length, (m.index ?? 0) + m[0].length + 120);
        const window = source.slice(start, end);
        for (const re of FORBIDDEN) {
          expect(
            re.test(window),
            `${name} localStorage call site near "${m[0]}" must not mention ${re}`,
          ).toBe(false);
        }
      }
    }
    expect(siteCount).toBeGreaterThan(0);
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
