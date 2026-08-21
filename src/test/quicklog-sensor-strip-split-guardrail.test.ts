/**
 * Static guardrail: the parked Quick Log enhancements (mini-chart,
 * recent-series hook, localStorage attach preference) must NOT be wired
 * back into the production QuickLog component before field validation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const QL = readFileSync(resolve(__dirname, "../components/QuickLog.tsx"), "utf8");

// Every module in the last-target feature that touches browser storage. The
// fence originally scanned QuickLog.tsx alone, which stopped covering the
// actual writer the moment `localStorage.setItem` moved into the store module:
// the component's remaining `getItem` still satisfied "at least one call site",
// so the guard stayed green while no longer guarding the code that writes.
// A fence that can silently stop covering its subject is worse than none,
// because it still reads as protection.
const STORAGE_SOURCES: ReadonlyArray<{ label: string; path: string; mustWrite: boolean }> = [
  { label: "QuickLog.tsx", path: "../components/QuickLog.tsx", mustWrite: false },
  {
    label: "quickLogRecentTargetStore.ts",
    path: "../lib/quickLogRecentTargetStore.ts",
    mustWrite: true,
  },
  { label: "QuickLogV2Sheet.tsx", path: "../components/QuickLogV2Sheet.tsx", mustWrite: false },
  {
    label: "useRecentQuickLogTargetOffer.ts",
    path: "../hooks/useRecentQuickLogTargetOffer.ts",
    mustWrite: false,
  },
];

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

    // Scan EVERY module in the feature that touches storage, not just the
    // component. Each call site is inspected with its surrounding 120 chars.
    let totalSites = 0;
    for (const source of STORAGE_SOURCES) {
      const src = readFileSync(resolve(__dirname, source.path), "utf8");
      const sites = [...src.matchAll(/localStorage\.(getItem|setItem|removeItem)\s*\([^)]*\)/g)];
      totalSites += sites.length;

      // The writer must still BE the writer. If `setItem` moves again, this
      // fails loudly here instead of quietly ceasing to cover anything.
      if (source.mustWrite) {
        expect(
          sites.some((m) => m[1] === "setItem"),
          `${source.label} is the declared writer but performs no localStorage.setItem — ` +
            `the write moved, and STORAGE_SOURCES must move with it`,
        ).toBe(true);
      }

      for (const m of sites) {
        const start = Math.max(0, (m.index ?? 0) - 120);
        const end = Math.min(src.length, (m.index ?? 0) + m[0].length + 120);
        const window = src.slice(start, end);
        for (const re of FORBIDDEN) {
          expect(
            re.test(window),
            `${source.label}: localStorage call site near "${m[0]}" must not mention ${re}`,
          ).toBe(false);
        }
      }
    }
    expect(totalSites).toBeGreaterThan(0);
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
